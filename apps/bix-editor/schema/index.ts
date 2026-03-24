import { defineSchema } from "@bix/engine"
import { Orbital, Emissive } from "./traits"
import { Star, Planet, Moon } from "./entities"
import {
    MoonRequiresPlanet,
    PlanetRequiresStar,
    MinOrbitRadius,
    OrbitSpacing,
} from "./constraints"
import { OrbitSystem } from "./systems"

const solarSystemSchema = defineSchema({
    name: "solar-system",
    version: "0.1.0",
    description:
        "An interactive solar system editor. " +
        "Build solar systems with stars, orbiting planets, and moons. " +
        "The orbit system animates bodies in real time.",

    traits: [Orbital, Emissive],

    entityTypes: [Star, Planet, Moon],

    constraints: [
        PlanetRequiresStar, // priority 100
        MoonRequiresPlanet, // priority 100
        MinOrbitRadius, // priority 80
        OrbitSpacing, // priority 40 — warn only
    ],

    systems: [OrbitSystem],

    palette: {
        categories: [{ name: "Bodies", types: ["star", "planet", "moon"] }],
    },

    viewports: [{ type: "3d", label: "System View", renderer: "three" }],
})

export default solarSystemSchema
export { Orbital, Emissive } from "./traits"
export { Star, Planet, Moon } from "./entities"
export {
    MoonRequiresPlanet,
    PlanetRequiresStar,
    MinOrbitRadius,
    OrbitSpacing,
} from "./constraints"
export { OrbitSystem } from "./systems"
export type { OrbitalData, EmissiveData } from "./traits"
