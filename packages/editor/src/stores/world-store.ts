import { create, type StoreApi, type UseBoundStore } from "zustand"
import {
    type World,
    type Entity,
    type IntentInput,
    type IntentResult,
    type Violation,
} from "@bix/engine"

// ── Types ─────────────────────────────────────────────────────────

export type ActiveTool = "select" | "place" | "delete"

/**
 * The full state shape managed by the WorldStore.
 *
 * `entities`, `canUndo`, and `canRedo` are derived from the World —
 * re-snapshotted on every World event. Everything else is pure UI
 * state that the World knows nothing about.
 */
export interface WorldStoreState {
    // ── Derived from World (reactive) ──────────────────────────────

    /** Snapshot of all entities, updated on every World mutation event. */
    readonly entities: readonly Entity[]
    /** True if the World has undoable history. */
    readonly canUndo: boolean
    /** True if the World has redoable history. */
    readonly canRedo: boolean
    /**
     * Violations from the most recent dispatch. Cleared on the next dispatch.
     * Includes "warn", "adjust", and "enforce" violations (not "prevent" —
     * those block execution and are returned in the dispatch result instead).
     */
    readonly lastViolations: readonly Violation[]

    // ── UI state (independent of World) ────────────────────────────

    /** Currently selected entity IDs. Pure editor UI state. */
    readonly selection: ReadonlySet<string>
    /** The active editor tool. */
    readonly activeTool: ActiveTool
    /**
     * Which entity type is queued for placement. Non-null only when
     * activeTool === "place". Cleared automatically when switching tools.
     */
    readonly pendingEntityType: string | null

    // ── World delegates ────────────────────────────────────────────

    dispatch: (input: IntentInput) => IntentResult
    undo: () => boolean
    redo: () => boolean

    // ── UI mutations ────────────────────────────────────────────────

    setSelection: (ids: readonly string[]) => void
    addToSelection: (id: string) => void
    removeFromSelection: (id: string) => void
    clearSelection: () => void
    toggleSelection: (id: string) => void
    /**
     * Set the active tool. Automatically clears `pendingEntityType`
     * when switching to anything other than "place".
     */
    setActiveTool: (tool: ActiveTool) => void
    /**
     * Convenience: set activeTool="place" and pendingEntityType in one step.
     * Use this from the Palette when an entity type is selected.
     */
    setPlaceTool: (entityType: string) => void
    setPendingEntityType: (type: string | null) => void
}

// ── WorldStoreHandle ──────────────────────────────────────────────

export interface WorldStoreHandle {
    store: UseBoundStore<StoreApi<WorldStoreState>>
    destroy: () => void
}

// ── createWorldStore ──────────────────────────────────────────────

export function createWorldStore(world: World): WorldStoreHandle {
    const store = create<WorldStoreState>()((set) => ({
        // Initial snapshot
        entities: [...world.query.all()],
        canUndo: world.canUndo,
        canRedo: world.canRedo,
        lastViolations: [],

        // Initial UI state
        selection: new Set<string>(),
        activeTool: "select" as ActiveTool,
        pendingEntityType: null,

        // World delegates
        dispatch: (input) => world.dispatch(input),
        undo: () => world.undo(),
        redo: () => world.redo(),

        // UI mutations
        setSelection: (ids) => set({ selection: new Set(ids) }),

        addToSelection: (id) =>
            set((state) => ({ selection: new Set([...state.selection, id]) })),

        removeFromSelection: (id) =>
            set((state) => {
                const next = new Set(state.selection)
                next.delete(id)
                return { selection: next }
            }),

        clearSelection: () => set({ selection: new Set<string>() }),

        toggleSelection: (id) =>
            set((state) => {
                const next = new Set(state.selection)
                if (next.has(id)) {
                    next.delete(id)
                } else {
                    next.add(id)
                }
                return { selection: next }
            }),

        setActiveTool: (tool) =>
            set((state) => ({
                activeTool: tool,
                // Preserve pending type when staying in place mode; clear otherwise
                pendingEntityType: tool === "place" ? state.pendingEntityType : null,
            })),

        setPlaceTool: (entityType) =>
            set({ activeTool: "place", pendingEntityType: entityType }),

        setPendingEntityType: (type) => set({ pendingEntityType: type }),
    }))

    const unsubscribe = world.subscribe((event) => {
        store.setState({
            entities: [...world.query.all()],
            canUndo: world.canUndo,
            canRedo: world.canRedo,
            lastViolations:
                event.type === "dispatched" ? (event.result.violations ?? []) : [],
        })
    })

    return { store, destroy: unsubscribe }
}
