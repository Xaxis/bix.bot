import { defineEntityType } from "@bix/engine"

export const Star = defineEntityType({
    type: "star",
    label: "Star",
    description:
        "The gravitational center of a solar system. " +
        "Planets must orbit a star. Stars emit light and heat.",
    traits: ["spatial", "renderable", "orbital", "emissive"],
    icon: "sun",
    defaults: {
        orbital: { orbitRadius: 0, orbitSpeed: 0, orbitAngle: 0, parentBody: "" },
        emissive: { luminosity: 1.5, color: "#FFD700" },
        spatial: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 2, y: 2, z: 2 },
        },
        renderable: { visible: true, opacity: 1, layer: 0, meshRef: "sphere" },
    },
})

export const Planet = defineEntityType({
    type: "planet",
    label: "Planet",
    description:
        "A body orbiting a star. " +
        "Must be a child of a star entity. " +
        "Moons can orbit planets.",
    traits: ["spatial", "renderable", "orbital"],
    icon: "circle",
    defaults: {
        orbital: { orbitRadius: 5, orbitSpeed: 0.4, orbitAngle: 0, parentBody: "" },
        spatial: {
            position: { x: 5, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
        },
        renderable: { visible: true, opacity: 1, layer: 0, meshRef: "sphere" },
    },
})

export const Moon = defineEntityType({
    type: "moon",
    label: "Moon",
    description:
        "A natural satellite orbiting a planet. " + "Must be a child of a planet entity.",
    traits: ["spatial", "renderable", "orbital"],
    icon: "moon",
    defaults: {
        orbital: { orbitRadius: 1.5, orbitSpeed: 1.5, orbitAngle: 0, parentBody: "" },
        spatial: {
            position: { x: 6.5, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 0.3, y: 0.3, z: 0.3 },
        },
        renderable: { visible: true, opacity: 1, layer: 0, meshRef: "sphere" },
    },
})
