import { type Intent, type IntentInput } from "../intent/intent.js"
import { type WorldQuery } from "../world/world.js"
import { type EntityStore } from "../entity/entity-store.js"
import { type ConstraintGraph } from "./constraint-graph.js"
import { type Violation } from "./constraint-definition.js"

// ── SolverResult ─────────────────────────────────────────────────

/**
 * The result of running the ConstraintSolver for one intent dispatch.
 */
export interface SolverResult {
  /**
   * True if any "prevent" constraint was violated.
   * When true, the intent must not execute.
   */
  readonly hasPreventViolations: boolean
  /**
   * All violations gathered across every evaluated constraint.
   * Includes prevent, warn, adjust, and enforce violations.
   */
  readonly violations: readonly Violation[]
  /**
   * Fix intents suggested by "adjust"/"enforce" constraints.
   * Dispatched as system intents after the main intent executes.
   */
  readonly adjustments: readonly IntentInput[]
}

// ── ConstraintSolver ─────────────────────────────────────────────

/**
 * ConstraintSolver — evaluates the constraints relevant to a pending
 * intent and produces a SolverResult.
 *
 * Evaluation is pre-execution: the solver runs on the current world
 * state + the pending intent. This means:
 *
 * - "prevent" constraints see the entity BEFORE deletion → can block deletes
 * - "warn" constraints see the current state + proposed change
 * - "adjust" constraints compute fix intents based on current state + intent
 *
 * The World is responsible for using the SolverResult to decide whether
 * to proceed, and for dispatching any adjustments.
 */
export class ConstraintSolver {
  constructor(private readonly graph: ConstraintGraph) {}

  /**
   * Run all relevant constraints for the given pending intent.
   *
   * @param intent — The validated intent about to be executed.
   * @param query — Read-only world query (current state, pre-execution).
   * @param entities — Entity store for type lookups.
   */
  solve(intent: Intent, query: WorldQuery, entities: EntityStore): SolverResult {
    const affectedEntityIds = extractAffectedEntityIds(intent)
    const affectedEntityTypes = extractAffectedEntityTypes(
      intent,
      affectedEntityIds,
      entities,
    )
    const affectedTraitNames = extractAffectedTraitNames(intent)

    const relevant = this.graph.getRelevant(
      intent,
      affectedEntityTypes,
      affectedTraitNames,
    )

    const violations: Violation[] = []
    const adjustments: IntentInput[] = []
    let hasPreventViolations = false

    const ctx = {
      entities: query,
      trigger: { intent, affectedEntityIds },
    }

    for (const constraint of relevant) {
      let result
      try {
        result = constraint.evaluate(ctx)
      } catch (err) {
        // Constraint threw — treat as a warn violation (don't crash dispatch)
        violations.push({
          constraintName: constraint.name,
          message: `Constraint "${constraint.name}" threw during evaluation: ${String(err)}`,
          entityIds: [...affectedEntityIds],
          effect: "warn",
        })
        continue
      }

      if (!result.valid) {
        for (const v of result.violations) {
          violations.push({ ...v, effect: constraint.effect })
        }

        if (constraint.effect === "prevent") {
          hasPreventViolations = true
          // Continue evaluating — gather all prevent violations for richer error info
        }
      }

      // Collect adjustments regardless of valid/invalid
      // (an "adjust" constraint may want to snap even when technically valid)
      if (
        (constraint.effect === "adjust" || constraint.effect === "enforce") &&
        result.suggestions
      ) {
        for (const suggestion of result.suggestions) {
          adjustments.push(suggestion)
        }
      }
    }

    return { hasPreventViolations, violations, adjustments }
  }
}

// ── Intent-to-affected-entities helpers ──────────────────────────

/**
 * Extract entity IDs directly touched by an intent.
 * Works on the intent params — no entity store access needed.
 */
export function extractAffectedEntityIds(intent: Intent): readonly string[] {
  const p = intent.params
  switch (intent.type) {
    case "entity.create":
      // ID may be specified; auto-generated IDs aren't in params yet
      return typeof p["id"] === "string" ? [p["id"]] : []
    case "entity.delete":
      return typeof p["id"] === "string" ? [p["id"]] : []
    case "trait.update":
    case "trait.remove":
      return typeof p["entityId"] === "string" ? [p["entityId"]] : []
    case "entity.reparent":
      return typeof p["entityId"] === "string" ? [p["entityId"]] : []
    case "_entity.restoreSnapshot":
      return typeof p["rootId"] === "string" ? [p["rootId"]] : []
    default:
      return []
  }
}

/**
 * Resolve entity types for affected entity IDs.
 * Looks up entity types from the store for ID-based intents.
 * Falls back to intent params for entity.create.
 */
function extractAffectedEntityTypes(
  intent: Intent,
  affectedEntityIds: readonly string[],
  entities: EntityStore,
): readonly string[] {
  const types = new Set<string>()

  // entity.create provides type in params, entity doesn't exist in store yet
  if (intent.type === "entity.create") {
    const entityType = intent.params["entityType"]
    if (typeof entityType === "string") {
      types.add(entityType)
    }
  }

  // For all other intents, look up from store
  for (const id of affectedEntityIds) {
    const entity = entities.get(id)
    if (entity !== undefined) {
      types.add(entity.type)
    }
  }

  return [...types]
}

/**
 * Extract trait names modified by the intent.
 * Only trait.update and trait.remove modify specific traits.
 */
function extractAffectedTraitNames(intent: Intent): readonly string[] {
  if (intent.type === "trait.update" || intent.type === "trait.remove") {
    const traitName = intent.params["traitName"]
    if (typeof traitName === "string") {
      return [traitName]
    }
  }
  return []
}
