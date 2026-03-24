import React from "react"
import { type StoreApi, type UseBoundStore } from "zustand"
import { type WorldStoreState } from "../stores/world-store.js"

export interface ToolbarProps {
    store: UseBoundStore<StoreApi<WorldStoreState>>
}

/**
 * Toolbar — undo, redo, and delete controls.
 *
 * All actions delegate through the store (which delegates to the World).
 * The Toolbar never touches the World directly.
 */
export function Toolbar({ store }: ToolbarProps): JSX.Element {
    const canUndo = store((s) => s.canUndo)
    const canRedo = store((s) => s.canRedo)
    const selection = store((s) => s.selection)
    const undo = store((s) => s.undo)
    const redo = store((s) => s.redo)
    const dispatch = store((s) => s.dispatch)
    const clearSelection = store((s) => s.clearSelection)

    const handleDelete = (): void => {
        // Delete all selected entities (cascade — children go with parents)
        for (const id of selection) {
            dispatch({ type: "entity.delete", params: { id, cascade: true } })
        }
        clearSelection()
    }

    return (
        <div data-testid="toolbar" className="toolbar">
            <button data-testid="toolbar-undo" disabled={!canUndo} onClick={() => undo()}>
                Undo
            </button>
            <button data-testid="toolbar-redo" disabled={!canRedo} onClick={() => redo()}>
                Redo
            </button>
            <button
                data-testid="toolbar-delete"
                disabled={selection.size === 0}
                onClick={handleDelete}
            >
                Delete
            </button>
        </div>
    )
}
