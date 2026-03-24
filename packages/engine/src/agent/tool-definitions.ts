import { type DomainSchema } from "../schema/schema.js"
import { BUILT_IN_TRAITS } from "../trait/built-in-traits.js"
import { type TraitDefinition } from "../trait/trait-definition.js"
import { zodToJsonSchema, type JSONSchemaProperty } from "./zod-to-json-schema.js"

// ── Types ─────────────────────────────────────────────────────────

export interface ToolParameters {
  type: "object"
  properties: Record<string, JSONSchemaProperty>
  required?: string[]
}

/**
 * A single tool definition in the format expected by LLM tool-calling APIs
 * (Anthropic Claude, OpenAI function calling, etc.).
 */
export interface ToolDefinition {
  /** Unique tool name (snake_case). */
  name: string
  /** Human + AI readable description of what this tool does. */
  description: string
  /** JSON Schema for the tool's input parameters. */
  parameters: ToolParameters
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Sanitize a string to a valid snake_case tool name.
 * Entity types like "load-bearing-wall" → "load_bearing_wall".
 */
function toToolName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

/** Build a map of all trait definitions (built-ins + schema). */
function buildTraitMap(schema: DomainSchema): Map<string, TraitDefinition> {
  const map = new Map<string, TraitDefinition>()
  for (const t of BUILT_IN_TRAITS) map.set(t.name, t)
  for (const t of schema.traits) map.set(t.name, t)
  return map
}

// ── Generic tool parameter schemas ───────────────────────────────

const POSITION_SCHEMA: JSONSchemaProperty = {
  type: "object",
  description: "World-space position (x right, y up, z forward).",
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    z: { type: "number" },
  },
  required: ["x", "y", "z"],
}

// ── generateToolDefinitions ───────────────────────────────────────

/**
 * Generate tool definitions for an LLM agent from a DomainSchema.
 *
 * Produces:
 * - One `create_<type>` tool per entity type in the schema, with
 *   parameters derived from the entity type's declared traits.
 * - Generic tools: `delete_entity`, `update_trait`, `list_entities`,
 *   `get_entity`, `get_connections`, `undo`, `redo`.
 *
 * Tool parameters use JSON Schema objects derived from Zod schemas,
 * making them usable with Anthropic, OpenAI, and any tool-calling LLM.
 *
 * ```typescript
 * const tools = generateToolDefinitions(mySchema)
 * // Pass to Anthropic:
 * anthropic.messages.create({ tools, messages: [...] })
 * ```
 */
export function generateToolDefinitions(schema: DomainSchema): ToolDefinition[] {
  const traitMap = buildTraitMap(schema)
  const tools: ToolDefinition[] = []

  // ── Per-entity-type create tools ─────────────────────────────

  for (const entityType of schema.entityTypes ?? []) {
    const toolName = `create_${toToolName(entityType.type)}`

    // Build properties: id, parent, position shorthand, then each declared trait
    const properties: Record<string, JSONSchemaProperty> = {
      id: {
        type: "string",
        description: "Optional unique entity ID. Auto-generated if omitted.",
      },
      parent: {
        type: "string",
        description: "Optional ID of a parent entity for hierarchical composition.",
      },
      position: {
        ...POSITION_SCHEMA,
        description:
          "Optional initial position. Adds a Spatial trait automatically. " +
          "Omit to create the entity without placing it in the scene.",
      },
    }

    // Add each declared trait schema as an optional parameter
    for (const traitName of entityType.traits) {
      const traitDef = traitMap.get(traitName)
      if (traitDef === undefined) continue

      const schema = zodToJsonSchema(traitDef.schema)
      const description =
        traitDef.editable !== undefined
          ? `${traitName} trait data. Fields: ${Object.keys(traitDef.editable.fields).join(", ")}.`
          : `${traitName} trait data.`

      properties[traitName] = { ...schema, description }
    }

    tools.push({
      name: toolName,
      description:
        `Create a new ${entityType.label} entity. ${entityType.description}` +
        (entityType.traits.length > 0
          ? ` Carries traits: ${entityType.traits.join(", ")}.`
          : ""),
      parameters: {
        type: "object",
        properties,
        required: [],
      },
    })
  }

  // ── Generic mutation tools ────────────────────────────────────

  tools.push({
    name: "delete_entity",
    description:
      "Delete an entity from the world. Also deletes all child entities (cascade). " +
      "This action is undoable.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID of the entity to delete." },
      },
      required: ["id"],
    },
  })

  tools.push({
    name: "update_trait",
    description:
      "Update the data for a specific trait on an entity. " +
      "The new data is validated against the trait's Zod schema before applying.",
    parameters: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "ID of the entity to update." },
        traitName: {
          type: "string",
          description: "Name of the trait to update (e.g., 'spatial', 'color').",
          ...(schema.traits.length > 0 || BUILT_IN_TRAITS.length > 0
            ? {
                enum: [
                  ...BUILT_IN_TRAITS.map((t) => t.name),
                  ...schema.traits.map((t) => t.name),
                ],
              }
            : {}),
        },
        data: {
          type: "object",
          description:
            "New trait data. Must match the trait's schema. " +
            "For spatial: {position:{x,y,z}, rotation:{x,y,z,w}, scale:{x,y,z}}. " +
            "For renderable: {visible:bool, opacity:number, layer:number}.",
        },
      },
      required: ["entityId", "traitName", "data"],
    },
  })

  // ── Query tools ───────────────────────────────────────────────

  const entityTypeNames = (schema.entityTypes ?? []).map((et) => et.type)

  tools.push({
    name: "list_entities",
    description:
      "List entities in the world. Returns id, type, and trait names for each entity. " +
      "Optionally filter by entity type.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Optional entity type to filter by.",
          ...(entityTypeNames.length > 0 ? { enum: entityTypeNames } : {}),
        },
      },
      required: [],
    },
  })

  tools.push({
    name: "get_entity",
    description:
      "Get full details of a specific entity by ID, including all its trait data.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID of the entity to retrieve." },
      },
      required: ["id"],
    },
  })

  tools.push({
    name: "get_connections",
    description:
      "Get the composition relationships for an entity: its parent entity and " +
      "its direct children. Useful for understanding hierarchy.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "ID of the entity to get connections for.",
        },
      },
      required: ["id"],
    },
  })

  // ── History tools ─────────────────────────────────────────────

  tools.push({
    name: "undo",
    description: "Undo the last action. Returns whether there was anything to undo.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  })

  tools.push({
    name: "redo",
    description:
      "Redo the last undone action. Returns whether there was anything to redo.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  })

  return tools
}
