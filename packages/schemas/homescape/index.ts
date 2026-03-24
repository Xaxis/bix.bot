/**
 * Homescape — Cabin & Home Builder Schema
 *
 * The first real-world bix.bot schema. Turns the engine into an
 * interactive building designer supporting 2D floor-plan editing
 * and 3D visualization.
 *
 * This schema is the Phase 4 pressure test: it exercises every engine
 * abstraction against genuine domain complexity.
 */
import { defineSchema, type PaletteConfig, type ViewportConfig } from "@bix/engine"
import { Structural, Dimensional } from "./traits.js"
import { Wall, Door, Window, Floor, Roof, Pillar } from "./entities.js"
import {
    DoorRequiresWall,
    WindowRequiresWall,
    WallMinLength,
    DoorFitsInWall,
    LoadBearingDeletionBlocked,
    RoofNeedsSupport,
} from "./constraints.js"

// Gap 4 is resolved — palette and viewports are now first-class schema fields.

const homescapePalette: PaletteConfig = {
    categories: [
        { name: "Structure", types: ["wall", "pillar", "floor"] },
        { name: "Openings", types: ["door", "window"] },
        { name: "Roof", types: ["roof"] },
    ],
}

const homescapeViewports: readonly ViewportConfig[] = [
    { type: "3d", label: "3D View", renderer: "three" },
    { type: "2d", label: "Floor Plan", renderer: "svg" },
]

const homescapeSchema = defineSchema({
    name: "homescape",
    version: "0.1.0",
    description:
        "A cabin and home builder. Users assemble buildings from structural " +
        "components: walls, doors, windows, floors, roofs, and pillars. " +
        "Supports 2D floor-plan editing and 3D visualization.",

    traits: [Structural, Dimensional],

    entityTypes: [Wall, Door, Window, Floor, Roof, Pillar],

    constraints: [
        // Higher priority = evaluated first
        LoadBearingDeletionBlocked, // priority 200 — hardest safety rule
        DoorRequiresWall, // priority 100 — structural placement
        WindowRequiresWall, // priority 100 — structural placement
        WallMinLength, // priority 90  — dimensional minimum
        DoorFitsInWall, // priority 85  — dimensional relationship
        RoofNeedsSupport, // priority 50  — structural warning
    ],

    systems: [],
    // NOTE: No simulation systems for Phase 4. Future systems:
    // - StructuralLoadCalculator: propagates loads through the structure
    // - SolarExposureSystem:      calculates solar gain per room
    // - AreaCalculator:           computes room floor areas reactively

    palette: homescapePalette,
    viewports: homescapeViewports,
})

export default homescapeSchema
export { Structural, Dimensional } from "./traits.js"
export { Wall, Door, Window, Floor, Roof, Pillar } from "./entities.js"
export {
    DoorRequiresWall,
    WindowRequiresWall,
    WallMinLength,
    DoorFitsInWall,
    LoadBearingDeletionBlocked,
    RoofNeedsSupport,
} from "./constraints.js"
