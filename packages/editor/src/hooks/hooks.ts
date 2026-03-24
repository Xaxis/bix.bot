import {
  type Entity,
  type IntentInput,
  type IntentResult,
  type Violation,
  type World,
} from "@bix/engine"
import { type WorldStoreState } from "../stores/world-store.js"
import { useWorldContext } from "./world-context.js"

// ── useWorld ──────────────────────────────────────────────────────

/**
 * Returns the World instance from the nearest WorldStoreProvider.
 *
 * Use for direct World access (e.g., querying entity children/ancestors).
 * For reactive state that updates with the World, prefer the other hooks.
 */
export function useWorld(): World {
  return useWorldContext().world
}

// ── useWorldStore ─────────────────────────────────────────────────

/**
 * Read a slice of the WorldStore state. Re-renders when the selected
 * slice changes.
 *
 * ```typescript
 * const entities = useWorldStore(s => s.entities)
 * const canUndo = useWorldStore(s => s.canUndo)
 * ```
 */
export function useWorldStore<T>(selector: (state: WorldStoreState) => T): T {
  return useWorldContext().store(selector)
}

// ── useSelection ──────────────────────────────────────────────────

/**
 * Returns the current selection set and selection mutation functions.
 *
 * ```typescript
 * const { selection, setSelection, clearSelection } = useSelection()
 * ```
 */
export function useSelection(): {
  selection: ReadonlySet<string>
  setSelection: (ids: readonly string[]) => void
  addToSelection: (id: string) => void
  removeFromSelection: (id: string) => void
  clearSelection: () => void
  toggleSelection: (id: string) => void
} {
  const { store } = useWorldContext()
  const selection = store((s) => s.selection)
  const setSelection = store((s) => s.setSelection)
  const addToSelection = store((s) => s.addToSelection)
  const removeFromSelection = store((s) => s.removeFromSelection)
  const clearSelection = store((s) => s.clearSelection)
  const toggleSelection = store((s) => s.toggleSelection)

  return {
    selection,
    setSelection,
    addToSelection,
    removeFromSelection,
    clearSelection,
    toggleSelection,
  }
}

// ── useIntent ─────────────────────────────────────────────────────

/**
 * Returns the dispatch function for emitting intents through the World.
 *
 * ```typescript
 * const dispatch = useIntent()
 * dispatch({ type: "entity.create", params: { entityType: "wall" } })
 * ```
 */
export function useIntent(): (input: IntentInput) => IntentResult {
  return useWorldContext().store((s) => s.dispatch)
}

// ── useEntities ───────────────────────────────────────────────────

/**
 * Returns the reactive entity list, with an optional filter.
 *
 * ```typescript
 * const walls = useEntities(e => e.type === "wall")
 * const withSpatial = useEntities(e => "spatial" in e.traits)
 * ```
 */
export function useEntities(filter?: (entity: Entity) => boolean): readonly Entity[] {
  const entities = useWorldContext().store((s) => s.entities)
  return filter !== undefined ? entities.filter(filter) : entities
}

// ── useConstraintViolations ───────────────────────────────────────

/**
 * Returns constraint violations from the most recent dispatch.
 * Contains "warn", "adjust", and "enforce" violations.
 * "Prevent" violations are not included here — those are returned
 * directly in the dispatch result and block execution.
 *
 * ```typescript
 * const violations = useConstraintViolations()
 * if (violations.length > 0) { showWarningBanner(violations) }
 * ```
 */
export function useConstraintViolations(): readonly Violation[] {
  return useWorldContext().store((s) => s.lastViolations)
}
