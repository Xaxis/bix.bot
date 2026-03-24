import { defineSystem } from "@bix/engine"
import type { OrbitalData } from "./traits"

/**
 * OrbitSystem — advances orbitAngle and recomputes world position each tick.
 *
 * For each entity with both `orbital` and `spatial` traits:
 * 1. Increment orbitAngle by orbitSpeed * dt
 * 2. Compute x/z offset from parent position using cos/sin
 * 3. Emit trait.update for both orbital (new angle) and spatial (new position)
 *
 * NOTE: Stars are included (they have orbitRadius=0 so they stay at origin).
 * This means planet positions are computed relative to their star's position,
 * and moon positions relative to their planet's current position.
 *
 * PERFORMANCE NOTE: This emits 2 intents per entity per tick. Each goes
 * through the full constraint solver. For large systems, a dedicated
 * "system-level bypass" path would be more efficient. For a demo this is fine.
 */
export const OrbitSystem = defineSystem({
    name: "orbit-system",
    requiredTraits: ["orbital", "spatial"],
    phase: "physics",
    priority: 50,
    update(entities, world, dt) {
        const intents = []

        for (const entity of entities) {
            const orbital = entity.traits["orbital"] as OrbitalData
            const currentSpatial = entity.traits["spatial"] as {
                position: { x: number; y: number; z: number }
                rotation: { x: number; y: number; z: number; w: number }
                scale: { x: number; y: number; z: number }
            }

            const newAngle = orbital.orbitAngle + orbital.orbitSpeed * dt

            // Get parent body position for relative orbit
            let parentX = 0
            let parentZ = 0
            if (entity.parent) {
                const parent = world.query.byId(entity.parent)
                const parentSpatial = parent?.traits["spatial"] as
                    | { position: { x: number; y: number; z: number } }
                    | undefined
                if (parentSpatial) {
                    parentX = parentSpatial.position.x
                    parentZ = parentSpatial.position.z
                }
            }

            // Compute new position (orbiting in the XZ plane)
            const newX = parentX + Math.cos(newAngle) * orbital.orbitRadius
            const newZ = parentZ + Math.sin(newAngle) * orbital.orbitRadius

            // Update orbital angle
            intents.push({
                type: "trait.update",
                params: {
                    entityId: entity.id,
                    traitName: "orbital",
                    data: { ...orbital, orbitAngle: newAngle },
                },
            })

            // Update spatial position
            intents.push({
                type: "trait.update",
                params: {
                    entityId: entity.id,
                    traitName: "spatial",
                    data: {
                        ...currentSpatial,
                        position: { x: newX, y: 0, z: newZ },
                    },
                },
            })
        }

        return intents
    },
})
