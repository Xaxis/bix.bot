import {
  type SystemDefinition,
  type SystemWorldView,
  PHASE_ORDER,
} from "./system-definition.js"
import { type IntentInput } from "../intent/intent.js"

/**
 * The minimal interface the SystemRunner needs from the World.
 * Using a structural interface (not importing World directly) avoids
 * a circular dependency: World → SystemRunner → World.
 */
export interface SystemRunnerWorld extends SystemWorldView {
  dispatch(input: IntentInput): { prevented?: boolean }
}

/**
 * SystemRunner — registers SystemDefinitions and executes them each tick.
 *
 * Execution order:
 * 1. Phases run in canonical order: pre-physics → physics → post-physics
 *    → constraints → render-prep
 * 2. Within a phase, systems run by priority descending (higher first).
 * 3. For each system, the runner queries entities with all requiredTraits.
 * 4. The system's update() is called with those entities.
 * 5. Any returned IntentInputs are dispatched as source="system".
 *    - Prevented intents (constraint violations) are silently skipped.
 *    - Systems must never crash the tick loop; errors are caught and logged.
 */
export class SystemRunner {
  private readonly systems: SystemDefinition[] = []

  // ── Registration ─────────────────────────────────────────────

  /** Register a system. Throws if a system with the same name is already registered. */
  register(system: SystemDefinition): void {
    if (this.systems.some((s) => s.name === system.name)) {
      throw new Error(`System "${system.name}" is already registered`)
    }
    this.systems.push(system)
  }

  /** Register multiple systems at once. */
  registerAll(systems: readonly SystemDefinition[]): void {
    for (const system of systems) {
      this.register(system)
    }
  }

  /** Check if a system name is registered. */
  has(name: string): boolean {
    return this.systems.some((s) => s.name === name)
  }

  /** Number of registered systems. */
  get count(): number {
    return this.systems.length
  }

  // ── Tick ─────────────────────────────────────────────────────

  /**
   * Run one simulation tick.
   *
   * @param dt — Delta time in seconds since the last tick.
   * @param world — The World instance (provides query + dispatch).
   */
  tick(dt: number, world: SystemRunnerWorld): void {
    // Build sorted system list: phase order first, then priority descending within phase
    const sorted = this.getSortedSystems()

    for (const system of sorted) {
      // Query entities matching all required traits
      const entities =
        system.requiredTraits.length === 0
          ? world.query.all()
          : world.query.withTraits(system.requiredTraits)

      // Skip if no entities match — not an error
      if (entities.length === 0) continue

      // Call the system's update function
      let intents: IntentInput[]
      try {
        intents = system.update(entities, world, dt)
      } catch (err) {
        // System threw — log and continue. Never crash the tick loop.
        console.error(`System "${system.name}" threw during update:`, err)
        continue
      }

      // Dispatch each returned intent as a system action
      for (const intentInput of intents) {
        try {
          world.dispatch({ ...intentInput, source: "system" })
          // Silently ignore prevented intents — the constraint held.
        } catch (err) {
          // Dispatch threw (e.g., unregistered intent type) — log and continue
          console.error(`System "${system.name}" emitted invalid intent:`, err)
        }
      }
    }
  }

  // ── Introspection ─────────────────────────────────────────────

  /** Get all registered systems in execution order (phase → priority). */
  getSortedSystems(): readonly SystemDefinition[] {
    return [...this.systems].sort((a, b) => {
      const phaseA = PHASE_ORDER.indexOf(a.phase)
      const phaseB = PHASE_ORDER.indexOf(b.phase)
      if (phaseA !== phaseB) return phaseA - phaseB
      // Same phase: higher priority first
      return b.priority - a.priority
    })
  }
}
