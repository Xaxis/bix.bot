import { z } from "zod"
import { defineTrait } from "@bix/engine"

/**
 * Orbital — defines how an entity moves around a parent body.
 *
 * The orbit system reads orbitRadius/Speed/Angle to compute world
 * position each tick. orbitAngle is updated by the system; authors
 * set orbitRadius and orbitSpeed when creating entities.
 */
export const Orbital = defineTrait({
    name: "orbital",
    schema: z.object({
        /** Distance from the parent body's position (world units). */
        orbitRadius: z.number().min(0),
        /** Angular velocity in radians per second. */
        orbitSpeed: z.number(),
        /** Current angle in radians, updated each tick by the orbit system. */
        orbitAngle: z.number(),
        /**
         * ID of the parent body entity.
         * Should match the entity hierarchy parent, but stored here
         * so the orbit system can resolve it without traversal.
         */
        parentBody: z.string(),
    }),
    defaults: {
        orbitRadius: 1,
        orbitSpeed: 0.5,
        orbitAngle: 0,
        parentBody: "",
    },
    editable: {
        fields: {
            orbitRadius: {
                label: "Orbit Radius",
                widget: "slider",
                min: 0,
                max: 50,
                step: 0.5,
            },
            orbitSpeed: {
                label: "Orbit Speed (rad/s)",
                widget: "slider",
                min: -5,
                max: 5,
                step: 0.1,
            },
            orbitAngle: { label: "Current Angle (rad)", widget: "input" },
        },
    },
})

/**
 * Emissive — marks a star (or any light source) as self-illuminating.
 * The viewport uses luminosity and color to render the glow/point-light.
 */
export const Emissive = defineTrait({
    name: "emissive",
    schema: z.object({
        /** Relative brightness (0 = dark, 1 = sun-like, higher = brighter). */
        luminosity: z.number().min(0),
        /** CSS color string for the emissive glow (e.g. "#FFD700"). */
        color: z.string(),
    }),
    defaults: { luminosity: 1, color: "#FFD700" },
    editable: {
        fields: {
            luminosity: {
                label: "Luminosity",
                widget: "slider",
                min: 0,
                max: 10,
                step: 0.1,
            },
            color: { label: "Color", widget: "color" },
        },
    },
})

export type OrbitalData = {
    orbitRadius: number
    orbitSpeed: number
    orbitAngle: number
    parentBody: string
}

export type EmissiveData = {
    luminosity: number
    color: string
}
