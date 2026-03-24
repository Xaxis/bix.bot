import { type Intent, type IntentInput } from "../intent/intent.js"
import { type WorldQuery } from "../world/world.js"

// ── Violation ────────────────────────────────────────────────────

/**
 * A single rule violation produced by a constraint evaluation.
 * Violations accumulate in IntentResult and are surfaced to callers
 * and subscribers.
 */
export interface Violation {
  /** Name of the constraint that generated this violation. */
  constraintName: string
  /** Human + AI readable explanation of why the rule was violated. */
  message: string
  /** Entity IDs directly involved in the violation. */
  entityIds: string[]
  /** The effect class — matches the ConstraintDefinition.effect. */
  effect: ConstraintEffect
}

// ── ConstraintResult ─────────────────────────────────────────────

/**
 * What a constraint's evaluate function returns.
 *
 * - `valid: true` → no violation, nothing to do.
 * - `valid: false` → violation; effect determines what happens next.
 * - `suggestions` → intents the constraint wants dispatched after execution
 *   (used for "adjust" and "enforce" effects).
 */
export interface ConstraintResult {
  valid: boolean
  /** Populated when valid is false. May be empty even when valid is false (no-op violation). */
  violations: Violation[]
  /**
   * Suggested follow-up intents to bring the world into compliance.
   * Only honoured when effect is "adjust" or "enforce".
   */
  suggestions?: IntentInput[]
}

// ── ConstraintContext ─────────────────────────────────────────────

/**
 * Passed to every evaluate function. Provides read-only access to the
 * world state and the triggering intent.
 *
 * Constraints MUST NOT mutate state. They read and return a result.
 * The ConstraintSolver handles enforcement based on the effect.
 */
export interface ConstraintContext {
  /** Read-only queries into the World's current entity state. */
  readonly entities: WorldQuery
  /** What triggered this re-evaluation. */
  readonly trigger: {
    /** The pending intent (not yet executed when pre-execution evaluation runs). */
    readonly intent: Intent
    /**
     * Entity IDs directly touched by the triggering intent.
     * Best-effort — may be empty for complex or unknown intent types.
     */
    readonly affectedEntityIds: readonly string[]
  }
}

// ── Effect ───────────────────────────────────────────────────────

export type ConstraintEffect = "prevent" | "warn" | "adjust" | "enforce"

// ── Watch ────────────────────────────────────────────────────────

/**
 * Declares what triggers re-evaluation of a constraint.
 *
 * Omitting watch on a global constraint means it re-evaluates on every
 * intent. Omitting watch on a local constraint means it re-evaluates
 * on every intent that touches any entity (use sparingly — prefer
 * explicit watch declarations for performance).
 */
export interface ConstraintWatch {
  /** Re-evaluate when entities of these types are involved. */
  entityTypes?: readonly string[]
  /** Re-evaluate when these trait names are set or removed. */
  traitNames?: readonly string[]
  /** Re-evaluate when these specific intent types are dispatched. */
  intentTypes?: readonly string[]
}

// ── ConstraintDefinition ─────────────────────────────────────────

/**
 * A declarative rule governing entity state.
 *
 * Constraints are the intelligence layer — they encode domain rules,
 * physics invariants, structural requirements, and game mechanics.
 *
 * They are first-class citizens: declared, registered, inspectable,
 * and enforced by the engine. Domain logic stays in constraints, not
 * scattered across imperative handlers.
 *
 * Effects:
 * - **prevent** — violation blocks the intent; state is never mutated.
 * - **warn** — violation is recorded but the intent proceeds.
 * - **adjust** — intent proceeds; constraint dispatches fix intents to
 *   bring the world into compliance (e.g., snap to grid).
 * - **enforce** — like adjust but considered a hard invariant
 *   (always brings state into compliance, never just warns).
 */
export interface ConstraintDefinition {
  /** Unique name within the schema (e.g., "min-wall-length"). */
  readonly name: string
  /** Human + AI readable explanation of what this constraint enforces. */
  readonly description: string
  /**
   * Evaluation priority. Higher numbers win when two constraints conflict.
   * Default: 0.
   */
  readonly priority: number
  /**
   * Scope of this constraint.
   * - **local** — governs relationships between specific entities.
   * - **global** — enforces a world-level invariant (always re-evaluated).
   */
  readonly scope: "local" | "global"
  /** What the engine does when this constraint is violated. */
  readonly effect: ConstraintEffect
  /**
   * What triggers re-evaluation. Omit to re-evaluate on every intent
   * (correct but slower). Provide for targeted evaluation.
   */
  readonly watch?: ConstraintWatch
  /**
   * Evaluate the constraint against the current world state + triggering intent.
   *
   * Called BEFORE the intent executes so the full entity graph is visible.
   * Must be pure — read-only access only. Return a ConstraintResult.
   */
  readonly evaluate: (ctx: ConstraintContext) => ConstraintResult
}

// ── defineConstraint ─────────────────────────────────────────────

/**
 * Author a ConstraintDefinition with compile-time safety.
 *
 * ```typescript
 * const minWallLength = defineConstraint({
 *   name: "min-wall-length",
 *   description: "Walls must be at least 0.5m long.",
 *   priority: 10,
 *   scope: "local",
 *   effect: "prevent",
 *   watch: { entityTypes: ["wall"], traitNames: ["spatial"] },
 *   evaluate(ctx) {
 *     const intent = ctx.trigger.intent
 *     // ... check proposed length ...
 *     return { valid: true, violations: [] }
 *   },
 * })
 * ```
 */
export function defineConstraint(config: ConstraintDefinition): ConstraintDefinition {
  if (config.name.trim().length === 0) {
    throw new Error("ConstraintDefinition.name must not be empty")
  }
  if (config.description.trim().length === 0) {
    throw new Error(
      `ConstraintDefinition "${config.name}": description must not be empty`,
    )
  }
  return config
}
