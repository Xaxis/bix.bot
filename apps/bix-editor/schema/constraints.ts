import { defineConstraint } from "@bix/engine"
import type { OrbitalData } from "./traits"

// ── 1. moon-requires-planet ───────────────────────────────────────

export const MoonRequiresPlanet = defineConstraint({
    name: "moon-requires-planet",
    description: "A moon must orbit a planet, not a star or another moon.",
    priority: 100,
    scope: "local",
    effect: "prevent",
    watch: {
        entityTypes: ["moon"],
        intentTypes: ["entity.create", "entity.reparent"],
    },
    evaluate(ctx) {
        const intent = ctx.trigger.intent

        const isCreatingMoon =
            intent.type === "entity.create" && intent.params["entityType"] === "moon"
        const isReparentingMoon =
            intent.type === "entity.reparent" &&
            (() => {
                const id = intent.params["entityId"] as string | undefined
                return id !== undefined ? ctx.world.getEntity(id)?.type === "moon" : false
            })()

        if (!isCreatingMoon && !isReparentingMoon) return { valid: true, violations: [] }

        const parentId = (
            intent.type === "entity.create"
                ? intent.params["parent"]
                : intent.params["newParentId"]
        ) as string | undefined

        if (!parentId) {
            return {
                valid: false,
                violations: [
                    {
                        constraintName: "moon-requires-planet",
                        message: "A moon must be placed as a child of a planet.",
                        entityIds: [],
                        effect: "prevent",
                    },
                ],
            }
        }

        const parent = ctx.world.getEntity(parentId)
        if (!parent || parent.type !== "planet") {
            return {
                valid: false,
                violations: [
                    {
                        constraintName: "moon-requires-planet",
                        message: `Moons must orbit a planet, not a "${parent?.type ?? "unknown"}".`,
                        entityIds: [parentId],
                        effect: "prevent",
                    },
                ],
            }
        }

        return { valid: true, violations: [] }
    },
})

// ── 2. planet-requires-star ───────────────────────────────────────

export const PlanetRequiresStar = defineConstraint({
    name: "planet-requires-star",
    description: "A planet must orbit a star.",
    priority: 100,
    scope: "local",
    effect: "prevent",
    watch: {
        entityTypes: ["planet"],
        intentTypes: ["entity.create", "entity.reparent"],
    },
    evaluate(ctx) {
        const intent = ctx.trigger.intent

        const isCreatingPlanet =
            intent.type === "entity.create" && intent.params["entityType"] === "planet"
        const isReparentingPlanet =
            intent.type === "entity.reparent" &&
            (() => {
                const id = intent.params["entityId"] as string | undefined
                return id !== undefined
                    ? ctx.world.getEntity(id)?.type === "planet"
                    : false
            })()

        if (!isCreatingPlanet && !isReparentingPlanet)
            return { valid: true, violations: [] }

        const parentId = (
            intent.type === "entity.create"
                ? intent.params["parent"]
                : intent.params["newParentId"]
        ) as string | undefined

        if (!parentId) {
            return {
                valid: false,
                violations: [
                    {
                        constraintName: "planet-requires-star",
                        message: "A planet must be placed as a child of a star.",
                        entityIds: [],
                        effect: "prevent",
                    },
                ],
            }
        }

        const parent = ctx.world.getEntity(parentId)
        if (!parent || parent.type !== "star") {
            return {
                valid: false,
                violations: [
                    {
                        constraintName: "planet-requires-star",
                        message: `Planets must orbit a star, not a "${parent?.type ?? "unknown"}".`,
                        entityIds: [parentId],
                        effect: "prevent",
                    },
                ],
            }
        }

        return { valid: true, violations: [] }
    },
})

// ── 3. min-orbit-radius ───────────────────────────────────────────

export const MinOrbitRadius = defineConstraint({
    name: "min-orbit-radius",
    description: "Orbit radius must be greater than 0 for non-star bodies.",
    priority: 80,
    scope: "local",
    effect: "prevent",
    watch: {
        traitNames: ["orbital"],
        intentTypes: ["entity.create"],
    },
    evaluate(ctx) {
        const intent = ctx.trigger.intent

        let proposedRadius: number | undefined

        if (intent.type === "entity.create") {
            const traits = intent.params["traits"] as Record<string, unknown> | undefined
            const orbital = traits?.["orbital"] as Partial<OrbitalData> | undefined
            proposedRadius = orbital?.orbitRadius
            // Stars are allowed orbitRadius=0 (they sit at the center)
            if (intent.params["entityType"] === "star")
                return { valid: true, violations: [] }
        } else if (
            intent.type === "trait.update" &&
            intent.params["traitName"] === "orbital"
        ) {
            const entityId = intent.params["entityId"] as string
            const entity = ctx.world.getEntity(entityId)
            if (entity?.type === "star") return { valid: true, violations: [] }
            const data = intent.params["data"] as Partial<OrbitalData> | undefined
            proposedRadius = data?.orbitRadius
        } else {
            return { valid: true, violations: [] }
        }

        if (proposedRadius !== undefined && proposedRadius <= 0) {
            return {
                valid: false,
                violations: [
                    {
                        constraintName: "min-orbit-radius",
                        message: `Orbit radius must be > 0 (got ${proposedRadius}).`,
                        entityIds: [],
                        effect: "prevent",
                    },
                ],
            }
        }

        return { valid: true, violations: [] }
    },
})

// ── 4. orbit-spacing ─────────────────────────────────────────────

export const OrbitSpacing = defineConstraint({
    name: "orbit-spacing",
    description:
        "Two siblings orbiting the same body should not have orbit radii " +
        "within 0.5 units of each other — orbits that close may collide.",
    priority: 40,
    scope: "local",
    effect: "warn",
    watch: {
        traitNames: ["orbital"],
        intentTypes: ["entity.create"],
    },
    evaluate(ctx) {
        const intent = ctx.trigger.intent

        let parentId: string | undefined
        let proposedRadius: number | undefined

        if (intent.type === "entity.create") {
            if (intent.params["entityType"] === "star")
                return { valid: true, violations: [] }
            parentId = intent.params["parent"] as string | undefined
            const traits = intent.params["traits"] as Record<string, unknown> | undefined
            const orbital = traits?.["orbital"] as Partial<OrbitalData> | undefined
            proposedRadius = orbital?.orbitRadius
        } else if (
            intent.type === "trait.update" &&
            intent.params["traitName"] === "orbital"
        ) {
            const entityId = intent.params["entityId"] as string
            const entity = ctx.world.getEntity(entityId)
            if (!entity || entity.type === "star") return { valid: true, violations: [] }
            parentId = entity.parent
            const data = intent.params["data"] as Partial<OrbitalData> | undefined
            proposedRadius = data?.orbitRadius
        } else {
            return { valid: true, violations: [] }
        }

        if (!parentId || proposedRadius === undefined)
            return { valid: true, violations: [] }

        // Find siblings with orbital trait
        const siblings = ctx.entities
            .all()
            .filter((e) => e.parent === parentId && "orbital" in e.traits)

        const tooClose = siblings.filter((sib) => {
            const sibOrbital = sib.traits["orbital"] as Partial<OrbitalData> | undefined
            return (
                sibOrbital?.orbitRadius !== undefined &&
                Math.abs(sibOrbital.orbitRadius - proposedRadius!) < 0.5
            )
        })

        if (tooClose.length > 0) {
            return {
                valid: false,
                violations: tooClose.map((sib) => ({
                    constraintName: "orbit-spacing",
                    message: `Orbit radius ${proposedRadius} is within 0.5 units of ${sib.id} (orbit ${(sib.traits["orbital"] as OrbitalData).orbitRadius}). Orbits may overlap.`,
                    entityIds: [sib.id],
                    effect: "warn" as const,
                })),
            }
        }

        return { valid: true, violations: [] }
    },
})
