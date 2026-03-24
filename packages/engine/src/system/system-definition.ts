import { type IntentInput } from "../intent/intent.js"
import { type Entity } from "../entity/entity.js"

// ── Phase ─────────────────────────────────────────────────────────

/**
 * Execution phases for the System tick loop.
 *
 * Systems run in this exact order each tick. Within a phase,
 * systems are sorted by `priority` descending (higher runs first).
 *
 * - **pre-physics** — input processing, AI decisions, pre-step preparation
 * - **physics** — forces, integration, collision detection
 * - **post-physics** — constraint resolution, position correction
 * - **constraints** — domain constraint enforcement (structural, game rules)
 * - **render-prep** — LOD selection, animation state, anything viewport-facing
 */
export type SystemPhase =
  | "pre-physics"
  | "physics"
  | "post-physics"
  | "constraints"
  | "render-prep"

/**
 * Canonical execution order for phases.
 * Index in this array is the sort key — lower index runs first.
 */
export const PHASE_ORDER: readonly SystemPhase[] = [
  "pre-physics",
  "physics",
  "post-physics",
  "constraints",
  "render-prep",
] as const

// ── SystemDefinition ─────────────────────────────────────────────

/**
 * A SystemDefinition describes a recurring computation that operates
 * on all entities matching a Trait signature.
 *
 * Systems are the simulation loop — they read World state, compute,
 * and emit Intents to request mutations. They never mutate directly.
 *
 * ```typescript
 * const gravitySystem = defineSystem({
 *   name: "gravity",
 *   requiredTraits: ["spatial", "mass"],
 *   phase: "physics",
 *   priority: 100,
 *   update(entities, _world, dt) {
 *     return entities.map(e => ({
 *       type: "trait.update",
 *       params: {
 *         entityId: e.id,
 *         traitName: "spatial",
 *         data: applyGravity(e.traits["spatial"], dt),
 *       },
 *     }))
 *   },
 * })
 * ```
 */
export interface SystemDefinition {
  /** Unique name for this system. */
  readonly name: string
  /**
   * Trait names this system requires. The system's `update` is only
   * called with entities that have ALL of these traits attached.
   * An empty array means the system runs on every entity.
   */
  readonly requiredTraits: readonly string[]
  /** Which phase of the tick loop this system runs in. */
  readonly phase: SystemPhase
  /**
   * Execution priority within the phase. Higher numbers run first.
   * Default: 0.
   */
  readonly priority: number
  /**
   * The system's per-tick computation.
   *
   * @param entities — All entities that have every required trait.
   * @param world — Read-only world reference for additional queries.
   * @param dt — Delta time in seconds since the last tick.
   * @returns An array of IntentInputs to dispatch. Return empty array
   *   if no mutations are needed this tick.
   */
  readonly update: (
    entities: readonly Entity[],
    world: SystemWorldView,
    dt: number,
  ) => IntentInput[]
}

/**
 * The read-only World view passed to system update functions.
 * Systems must not dispatch or mutate directly — they return Intents
 * and the SystemRunner dispatches them.
 */
export interface SystemWorldView {
  /** Read-only entity queries. */
  readonly query: {
    all(): readonly Entity[]
    byId(id: string): Entity | undefined
    byType(type: string): readonly Entity[]
    byTrait(traitName: string): readonly Entity[]
    withTraits(traitNames: readonly string[]): readonly Entity[]
  }
}

// ── defineSystem ──────────────────────────────────────────────────

/**
 * Author a SystemDefinition with compile-time safety and light
 * runtime validation.
 *
 * ```typescript
 * const motionSystem = defineSystem({
 *   name: "motion",
 *   requiredTraits: ["spatial", "velocity"],
 *   phase: "physics",
 *   priority: 50,
 *   update(entities, _world, dt) { ... },
 * })
 * ```
 */
export function defineSystem(config: SystemDefinition): SystemDefinition {
  if (config.name.trim().length === 0) {
    throw new Error("SystemDefinition.name must not be empty")
  }
  if (!(PHASE_ORDER as readonly string[]).includes(config.phase)) {
    throw new Error(
      `SystemDefinition "${config.name}": unknown phase "${config.phase}". ` +
        `Valid phases: ${PHASE_ORDER.join(", ")}`,
    )
  }
  return config
}
