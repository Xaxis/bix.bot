import { z } from "zod"
import { defineTrait } from "@bix/engine"

/**
 * Structural — load-bearing properties and material composition.
 *
 * Carried by: wall, roof, pillar.
 * Used by: load-bearing-deletion-blocked constraint (checks loadBearing),
 *          roof-needs-support constraint (checks structural integrity).
 */
export const Structural = defineTrait({
    name: "structural",
    schema: z.object({
        loadBearing: z.boolean(),
        material: z.enum(["wood", "steel", "concrete", "brick"]),
        /** Wall/pillar thickness in meters (0.1m–2.0m). */
        thickness: z.number().min(0.1).max(2.0),
    }),
    defaults: {
        loadBearing: false,
        material: "wood" as const,
        thickness: 0.15,
    },
    editable: {
        fields: {
            loadBearing: { label: "Load Bearing", widget: "toggle" },
            material: {
                label: "Material",
                widget: "dropdown",
                options: ["wood", "steel", "concrete", "brick"],
            },
            thickness: {
                label: "Thickness (m)",
                widget: "slider",
                min: 0.1,
                max: 2.0,
                step: 0.05,
            },
        },
    },
})

/**
 * Dimensional — the explicit spatial extents of an entity.
 *
 * Distinct from the Spatial built-in trait (which handles position/rotation/scale).
 * Dimensional records design-intent dimensions: the wall is 3m long, 2.4m tall,
 * regardless of how it's scaled in the viewport.
 *
 * Carried by: wall, door, window, floor, roof.
 * Used by: wall-min-length constraint (length >= 0.5m),
 *          door-fits-in-wall constraint (door.width <= wall.length).
 */
export const Dimensional = defineTrait({
    name: "dimensional",
    schema: z.object({
        width: z.number().min(0),
        height: z.number().min(0),
        length: z.number().min(0),
    }),
    defaults: { width: 1.0, height: 2.4, length: 1.0 },
    editable: {
        fields: {
            width: { label: "Width (m)", widget: "input", min: 0, step: 0.1 },
            height: { label: "Height (m)", widget: "input", min: 0, step: 0.1 },
            length: { label: "Length (m)", widget: "input", min: 0, step: 0.1 },
        },
    },
})

export type StructuralData = {
    loadBearing: boolean
    material: "wood" | "steel" | "concrete" | "brick"
    thickness: number
}

export type DimensionalData = {
    width: number
    height: number
    length: number
}
