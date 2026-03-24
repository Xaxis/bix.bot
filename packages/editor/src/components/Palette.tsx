import React from "react"
import { type StoreApi, type UseBoundStore } from "zustand"
import { type DomainSchema } from "@bix/engine"
import { type WorldStoreState } from "../stores/world-store.js"

export interface PaletteProps {
  store: UseBoundStore<StoreApi<WorldStoreState>>
  schema: DomainSchema
}

/**
 * Palette — lists entity types from the schema and tool buttons.
 *
 * Clicking an entity type activates place mode with that type.
 * The Select and Delete tool buttons switch to those modes.
 *
 * All state changes go through the store — no direct World mutations.
 */
export function Palette({ store, schema }: PaletteProps): JSX.Element {
  const activeTool = store((s) => s.activeTool)
  const pendingEntityType = store((s) => s.pendingEntityType)
  const setActiveTool = store((s) => s.setActiveTool)
  const setPlaceTool = store((s) => s.setPlaceTool)

  const entityTypes = schema.entityTypes ?? []

  return (
    <div data-testid="palette" className="palette">
      {/* Tool buttons */}
      <div className="palette-tools">
        <button
          data-testid="tool-select"
          data-active={activeTool === "select"}
          onClick={() => setActiveTool("select")}
        >
          Select
        </button>
        <button
          data-testid="tool-delete"
          data-active={activeTool === "delete"}
          onClick={() => setActiveTool("delete")}
        >
          Delete
        </button>
      </div>

      {/* Entity type buttons */}
      <div className="palette-entity-types">
        {entityTypes.map((et) => {
          const isActive = activeTool === "place" && pendingEntityType === et.type
          return (
            <button
              key={et.type}
              data-testid={`place-${et.type}`}
              data-entity-type={et.type}
              data-active={isActive}
              onClick={() => setPlaceTool(et.type)}
              title={et.description}
            >
              {et.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
