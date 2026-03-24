import { type World } from "../world/world.js"
import { type DomainSchema } from "../schema/schema.js"
import { type Violation } from "../constraint/constraint-definition.js"
import { type Entity } from "../entity/entity.js"
import { nanoid } from "nanoid"

// ── Result type ───────────────────────────────────────────────────

/**
 * The result of executing an agent tool call.
 * Structured for easy LLM consumption — success/error split with
 * typed data for query tools.
 */
export interface AgentToolResult {
  /** True if the tool executed successfully (even if there are warnings). */
  success: boolean
  /**
   * The tool's output data. Shape varies by tool:
   * - create_*: `{ entityId: string }`
   * - list_entities: `{ entities: EntitySummary[] }`
   * - get_entity: `{ entity: EntityDetail | null }`
   * - get_connections: `{ parent: string | null, children: string[] }`
   * - delete_entity / update_trait / undo / redo: `{ changed: boolean }`
   */
  data?: unknown
  /** Human-readable error message if success=false. */
  error?: string
  /** True if a "prevent" constraint blocked execution. */
  prevented?: boolean
  /** Non-prevent constraint violations (warnings) from the operation. */
  violations?: Violation[]
}

interface EntitySummary {
  id: string
  type: string
  traitNames: string[]
}

interface EntityDetail {
  id: string
  type: string
  traits: Record<string, unknown>
  parent: string | null
  children: string[]
}

// ── Default spatial/renderable for placed entities ─────────────────

const DEFAULT_SPATIAL = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
}

const DEFAULT_RENDERABLE = { visible: true, opacity: 1, layer: 0 }

// ── executeAgentTool ──────────────────────────────────────────────

/**
 * Execute an agent tool call against a World.
 *
 * Maps LLM tool calls to Intents (for mutations) or World queries
 * (for read operations). Returns a structured result the LLM can
 * interpret to understand what happened.
 *
 * ```typescript
 * // In an Anthropic tool_use handler:
 * const result = executeAgentTool(world, schema, toolUse.name, toolUse.input)
 * // Return result.data to the model as tool_result content
 * ```
 *
 * @param world - The live World instance.
 * @param schema - The DomainSchema (used to look up entity types).
 * @param toolName - The tool name from the LLM tool call.
 * @param params - The tool parameters from the LLM tool call.
 */
export function executeAgentTool(
  world: World,
  schema: DomainSchema,
  toolName: string,
  params: Record<string, unknown>,
): AgentToolResult {
  try {
    // ── create_<type> ───────────────────────────────────────────
    const entityTypes = schema.entityTypes ?? []
    for (const entityType of entityTypes) {
      const expectedName = `create_${toToolName(entityType.type)}`
      if (toolName === expectedName) {
        return executeCreate(world, entityType.type, entityType.traits, params)
      }
    }

    // ── Generic tools ───────────────────────────────────────────
    switch (toolName) {
      case "delete_entity":
        return executeDelete(world, params)
      case "update_trait":
        return executeUpdateTrait(world, params)
      case "list_entities":
        return executeListEntities(world, params)
      case "get_entity":
        return executeGetEntity(world, params)
      case "get_connections":
        return executeGetConnections(world, params)
      case "undo":
        return { success: true, data: { changed: world.undo() } }
      case "redo":
        return { success: true, data: { changed: world.redo() } }
      default:
        return { success: false, error: `Unknown tool: "${toolName}"` }
    }
  } catch (err) {
    return {
      success: false,
      error: `Tool "${toolName}" threw an error: ${String(err)}`,
    }
  }
}

// ── Tool handlers ─────────────────────────────────────────────────

function executeCreate(
  world: World,
  entityType: string,
  declaredTraits: readonly string[],
  params: Record<string, unknown>,
): AgentToolResult {
  const traits: Record<string, unknown> = {}

  // Map each declared trait from params (if provided)
  for (const traitName of declaredTraits) {
    if (params[traitName] !== undefined) {
      traits[traitName] = params[traitName]
    }
  }

  // Add spatial from position shorthand if provided
  if (params["position"] !== undefined) {
    const pos = params["position"] as { x?: number; y?: number; z?: number }
    traits["spatial"] = {
      ...DEFAULT_SPATIAL,
      position: {
        x: pos.x ?? 0,
        y: pos.y ?? 0,
        z: pos.z ?? 0,
      },
    }
    traits["renderable"] = DEFAULT_RENDERABLE
  }

  const id = typeof params["id"] === "string" ? params["id"] : nanoid()
  const parent = typeof params["parent"] === "string" ? params["parent"] : undefined

  const result = world.dispatch({
    type: "entity.create",
    params: { entityType, id, traits, parent },
    source: "agent",
  })

  if (result.prevented) {
    return {
      success: false,
      prevented: true,
      violations: result.violations,
      error:
        result.violations?.map((v) => v.message).join("; ") ??
        "Constraint prevented creation",
    }
  }

  return {
    success: true,
    data: { entityId: (result.data?.["entityId"] as string) ?? id },
    violations: result.violations,
  }
}

function executeDelete(world: World, params: Record<string, unknown>): AgentToolResult {
  const id = params["id"]
  if (typeof id !== "string" || id.trim().length === 0) {
    return { success: false, error: "delete_entity requires a non-empty 'id' string" }
  }

  if (!world.query.byId(id)) {
    return { success: false, error: `Entity "${id}" not found` }
  }

  const result = world.dispatch({
    type: "entity.delete",
    params: { id, cascade: true },
    source: "agent",
  })

  if (result.prevented) {
    return {
      success: false,
      prevented: true,
      violations: result.violations,
      error:
        result.violations?.map((v) => v.message).join("; ") ??
        "Constraint prevented deletion",
    }
  }

  return { success: true, data: { deleted: id }, violations: result.violations }
}

function executeUpdateTrait(
  world: World,
  params: Record<string, unknown>,
): AgentToolResult {
  const entityId = params["entityId"]
  const traitName = params["traitName"]
  const data = params["data"]

  if (typeof entityId !== "string") {
    return { success: false, error: "update_trait requires 'entityId' string" }
  }
  if (typeof traitName !== "string") {
    return { success: false, error: "update_trait requires 'traitName' string" }
  }
  if (data === undefined || data === null) {
    return { success: false, error: "update_trait requires 'data' object" }
  }

  if (!world.query.byId(entityId)) {
    return { success: false, error: `Entity "${entityId}" not found` }
  }

  const result = world.dispatch({
    type: "trait.update",
    params: { entityId, traitName, data },
    source: "agent",
  })

  if (result.prevented) {
    return {
      success: false,
      prevented: true,
      violations: result.violations,
      error:
        result.violations?.map((v) => v.message).join("; ") ??
        "Constraint prevented update",
    }
  }

  return {
    success: true,
    data: { entityId, traitName },
    violations: result.violations,
  }
}

function executeListEntities(
  world: World,
  params: Record<string, unknown>,
): AgentToolResult {
  const typeFilter = typeof params["type"] === "string" ? params["type"] : undefined

  const entities: Entity[] = typeFilter
    ? [...world.query.byType(typeFilter)]
    : [...world.query.all()]

  const summaries: EntitySummary[] = entities.map((e) => ({
    id: e.id,
    type: e.type,
    traitNames: Object.keys(e.traits),
  }))

  return {
    success: true,
    data: { entities: summaries, count: summaries.length },
  }
}

function executeGetEntity(
  world: World,
  params: Record<string, unknown>,
): AgentToolResult {
  const id = params["id"]
  if (typeof id !== "string") {
    return { success: false, error: "get_entity requires 'id' string" }
  }

  const entity = world.query.byId(id)
  if (!entity) {
    return { success: true, data: { entity: null } }
  }

  const detail: EntityDetail = {
    id: entity.id,
    type: entity.type,
    traits: entity.traits as Record<string, unknown>,
    parent: entity.parent ?? null,
    children: entity.children,
  }

  return { success: true, data: { entity: detail } }
}

function executeGetConnections(
  world: World,
  params: Record<string, unknown>,
): AgentToolResult {
  const id = params["id"]
  if (typeof id !== "string") {
    return { success: false, error: "get_connections requires 'id' string" }
  }

  const entity = world.query.byId(id)
  if (!entity) {
    return { success: false, error: `Entity "${id}" not found` }
  }

  return {
    success: true,
    data: {
      entityId: id,
      parent: entity.parent ?? null,
      children: entity.children,
    },
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function toToolName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}
