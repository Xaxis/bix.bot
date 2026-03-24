import { defineEntityType } from "@bix/engine"

// ── ENGINE GAP: trait auto-attachment ────────────────────────────
// EntityTypeDefinition.defaults declares per-trait default overrides,
// but the engine does NOT auto-apply them on entity.create.
// The engine only uses entityTypes for schema validation (validateSchema)
// and glossary/tool generation. Callers must pass initial trait data
// explicitly in entity.create params or follow up with trait.update.
// TODO (engine): On entity.create, if entityType is registered in the
// schema, auto-attach all declared traits with their merged defaults.

/**
 * Wall — vertical structural element.
 * Can be load-bearing (carries roof/floor loads) or a partition.
 * Doors and windows attach as children of walls.
 */
export const Wall = defineEntityType({
    type: "wall",
    label: "Wall",
    description:
        "A vertical structural element. Can be load-bearing or a non-structural partition. " +
        "Doors and windows must be placed as children of walls. " +
        "Load-bearing walls cannot be deleted while supporting a roof or floor.",
    traits: [
        "spatial",
        "renderable",
        "connectable",
        "editable",
        "structural",
        "dimensional",
    ],
    icon: "square",
    defaults: {
        dimensional: { width: 0.15, height: 2.4, length: 3.0 },
        structural: { loadBearing: false, material: "wood", thickness: 0.15 },
    },
})

/**
 * Door — an opening in a wall for passage.
 * Must be placed as a child of a wall entity.
 */
export const Door = defineEntityType({
    type: "door",
    label: "Door",
    description:
        "An opening in a wall for human passage. " +
        "Must be a child of a wall entity. " +
        "Door width cannot exceed the parent wall's length.",
    traits: ["spatial", "renderable", "connectable", "editable", "dimensional"],
    icon: "door-open",
    defaults: {
        dimensional: { width: 0.9, height: 2.1, length: 0.05 },
    },
})

/**
 * Window — a glazed opening in a wall for light and ventilation.
 * Must be placed as a child of a wall entity.
 */
export const Window = defineEntityType({
    type: "window",
    label: "Window",
    description:
        "A glazed opening in a wall for light and ventilation. " +
        "Must be a child of a wall entity.",
    traits: ["spatial", "renderable", "connectable", "editable", "dimensional"],
    icon: "layout-panel-top",
    defaults: {
        dimensional: { width: 1.2, height: 1.2, length: 0.05 },
    },
})

/**
 * Floor — a horizontal surface defining a room footprint.
 * Not structurally constrained itself; used as a reference plane
 * for room boundaries and area calculations.
 */
export const Floor = defineEntityType({
    type: "floor",
    label: "Floor",
    description:
        "A horizontal surface defining a room's footprint. " +
        "Used as a reference plane for calculating room area and boundary.",
    traits: ["spatial", "renderable", "editable", "dimensional"],
    icon: "layout-grid",
    defaults: {
        dimensional: { width: 4.0, height: 0.1, length: 5.0 },
    },
})

/**
 * Roof — the topmost covering of a structure.
 * Should be supported by walls. Roofs attached to load-bearing walls
 * block deletion of those walls.
 */
export const Roof = defineEntityType({
    type: "roof",
    label: "Roof",
    description:
        "The topmost covering of a structure. " +
        "Should be connected to supporting walls. " +
        "A roof without wall connections triggers a structural warning.",
    traits: ["spatial", "renderable", "editable", "dimensional", "structural"],
    icon: "home",
    defaults: {
        dimensional: { width: 5.0, height: 0.3, length: 6.0 },
        structural: {
            loadBearing: false,
            material: "wood",
            thickness: 0.2,
        },
    },
})

/**
 * Pillar — a vertical load-bearing column.
 * Supports roofs and floors directly without a wall surround.
 */
export const Pillar = defineEntityType({
    type: "pillar",
    label: "Pillar",
    description:
        "A vertical structural column providing point support for roofs or floors. " +
        "Load-bearing by default.",
    traits: ["spatial", "renderable", "editable", "structural"],
    icon: "minus",
    defaults: {
        structural: {
            loadBearing: true,
            material: "concrete",
            thickness: 0.3,
        },
    },
})
