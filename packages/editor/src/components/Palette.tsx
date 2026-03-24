import React from "react"
import { type StoreApi, type UseBoundStore } from "zustand"
import { type DomainSchema, type EntityTypeDefinition } from "@bix/engine"
import { type WorldStoreState } from "../stores/world-store.js"

export interface PaletteProps {
    store: UseBoundStore<StoreApi<WorldStoreState>>
    schema: DomainSchema
}

// ── Internal helpers ──────────────────────────────────────────────

interface CategoryGroup {
    name: string
    entityTypes: EntityTypeDefinition[]
}

/**
 * Build the display groups for the palette.
 * If schema.palette.categories is defined, use those groups.
 * Otherwise show all entityTypes in a single ungrouped list.
 */
function buildGroups(schema: DomainSchema): CategoryGroup[] {
    const allTypes = schema.entityTypes ?? []
    const typeMap = new Map(allTypes.map((et) => [et.type, et]))

    if (schema.palette?.categories.length) {
        return schema.palette.categories
            .map((cat) => ({
                name: cat.name,
                entityTypes: cat.types
                    .map((t) => typeMap.get(t))
                    .filter((et): et is EntityTypeDefinition => et !== undefined),
            }))
            .filter((g) => g.entityTypes.length > 0)
    }

    // Fallback: flat list, all types in one unnamed group
    return allTypes.length > 0 ? [{ name: "", entityTypes: allTypes }] : []
}

// ── Palette ───────────────────────────────────────────────────────

/**
 * Palette — lists entity types from the schema and tool buttons.
 *
 * If schema.palette.categories is defined, entity types are shown in
 * labeled category groups. Otherwise they appear in a flat list.
 *
 * Clicking an entity type activates place mode. The Select and Delete
 * tool buttons switch to those modes.
 */
export function Palette({ store, schema }: PaletteProps): JSX.Element {
    const activeTool = store((s) => s.activeTool)
    const pendingEntityType = store((s) => s.pendingEntityType)
    const setActiveTool = store((s) => s.setActiveTool)
    const setPlaceTool = store((s) => s.setPlaceTool)

    const groups = buildGroups(schema)

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

            {/* Entity type buttons — grouped or flat */}
            <div className="palette-entity-types">
                {groups.map((group) => (
                    <div key={group.name || "__ungrouped__"} className="palette-category">
                        {group.name && (
                            <div
                                data-testid={`palette-category-${group.name}`}
                                className="palette-category-label"
                            >
                                {group.name}
                            </div>
                        )}
                        {group.entityTypes.map((et) => {
                            const isActive =
                                activeTool === "place" && pendingEntityType === et.type
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
                ))}
            </div>
        </div>
    )
}
