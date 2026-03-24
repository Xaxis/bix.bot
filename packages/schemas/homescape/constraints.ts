import { defineConstraint } from "@bix/engine"
import type { DimensionalData, StructuralData } from "./traits.js"

// ── Gap 2 resolved: ctx.world convenience methods ─────────────────
// Constraints now use ctx.world.getEntity(id), ctx.world.getParent(id),
// ctx.world.getChildren(id), ctx.world.getTrait(id, name) — the API
// promised by the schema-authoring skill. The old patterns of
// manually traversing entity.parent and entity.children still work
// but this is the cleaner idiomatic form.

// ── 1. door-requires-wall ─────────────────────────────────────────

export const DoorRequiresWall = defineConstraint({
    name: "door-requires-wall",
    description:
        "A door must be placed as a child of a wall entity. " +
        "Doors cannot exist in the scene without a parent wall.",
    priority: 100,
    scope: "local",
    effect: "prevent",
    watch: {
        entityTypes: ["door"],
        intentTypes: ["entity.create", "entity.reparent"],
    },
    evaluate(ctx) {
        const intent = ctx.trigger.intent

        const isCreatingDoor =
            intent.type === "entity.create" && intent.params["entityType"] === "door"

        const isReparentingDoor =
            intent.type === "entity.reparent" &&
            (() => {
                const entityId = intent.params["entityId"] as string | undefined
                return entityId !== undefined
                    ? ctx.world.getEntity(entityId)?.type === "door"
                    : false
            })()

        if (!isCreatingDoor && !isReparentingDoor) {
            return { valid: true, violations: [] }
        }

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
                        constraintName: "door-requires-wall",
                        message:
                            "A door must be placed inside a wall. Specify a wall as the parent entity.",
                        entityIds: [],
                        effect: "prevent",
                    },
                ],
            }
        }

        // Use ctx.world.getEntity for clean entity lookup
        const parent = ctx.world.getEntity(parentId)
        if (!parent || parent.type !== "wall") {
            return {
                valid: false,
                violations: [
                    {
                        constraintName: "door-requires-wall",
                        message: `A door can only attach to a wall, not to a "${parent?.type ?? "unknown"}" entity.`,
                        entityIds: [parentId],
                        effect: "prevent",
                    },
                ],
            }
        }

        return { valid: true, violations: [] }
    },
})

// ── 2. window-requires-wall ──────────────────────────────────────

export const WindowRequiresWall = defineConstraint({
    name: "window-requires-wall",
    description:
        "A window must be placed as a child of a wall entity. " +
        "Windows cannot exist in the scene without a parent wall.",
    priority: 100,
    scope: "local",
    effect: "prevent",
    watch: {
        entityTypes: ["window"],
        intentTypes: ["entity.create", "entity.reparent"],
    },
    evaluate(ctx) {
        const intent = ctx.trigger.intent

        const isCreatingWindow =
            intent.type === "entity.create" && intent.params["entityType"] === "window"

        const isReparentingWindow =
            intent.type === "entity.reparent" &&
            (() => {
                const entityId = intent.params["entityId"] as string | undefined
                return entityId !== undefined
                    ? ctx.world.getEntity(entityId)?.type === "window"
                    : false
            })()

        if (!isCreatingWindow && !isReparentingWindow) {
            return { valid: true, violations: [] }
        }

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
                        constraintName: "window-requires-wall",
                        message:
                            "A window must be placed inside a wall. Specify a wall as the parent entity.",
                        entityIds: [],
                        effect: "prevent",
                    },
                ],
            }
        }

        const parent = ctx.world.getEntity(parentId)
        if (!parent || parent.type !== "wall") {
            return {
                valid: false,
                violations: [
                    {
                        constraintName: "window-requires-wall",
                        message: `A window can only attach to a wall, not to a "${parent?.type ?? "unknown"}" entity.`,
                        entityIds: [parentId],
                        effect: "prevent",
                    },
                ],
            }
        }

        return { valid: true, violations: [] }
    },
})

// ── 3. wall-min-length ────────────────────────────────────────────
// Gap 1 update: also fires on entity.create now that auto-defaults
// mean dimension traits are set at creation time.

export const WallMinLength = defineConstraint({
    name: "wall-min-length",
    description:
        "Walls must be at least 0.5 meters long. Shorter walls are structurally impractical.",
    priority: 90,
    scope: "local",
    effect: "prevent",
    watch: {
        entityTypes: ["wall"],
        traitNames: ["dimensional"],
        intentTypes: ["entity.create"],
    },
    evaluate(ctx) {
        const intent = ctx.trigger.intent

        let proposedLength: number | undefined

        if (intent.type === "entity.create" && intent.params["entityType"] === "wall") {
            // Auto-defaults (Gap 1) means dimensional is now set in entity.create params
            const traits = intent.params["traits"] as Record<string, unknown> | undefined
            const dim = traits?.["dimensional"] as Partial<DimensionalData> | undefined
            proposedLength = dim?.length
        } else if (
            intent.type === "trait.update" &&
            intent.params["traitName"] === "dimensional"
        ) {
            const entityId = intent.params["entityId"] as string
            // Use ctx.world.getEntity for clean lookup
            const entity = ctx.world.getEntity(entityId)
            if (!entity || entity.type !== "wall") {
                return { valid: true, violations: [] }
            }
            const proposed = intent.params["data"] as Partial<DimensionalData> | undefined
            proposedLength = proposed?.length
        } else {
            return { valid: true, violations: [] }
        }

        if (proposedLength !== undefined && proposedLength < 0.5) {
            return {
                valid: false,
                violations: [
                    {
                        constraintName: "wall-min-length",
                        message: `Wall length ${proposedLength}m is below the minimum of 0.5m.`,
                        entityIds:
                            intent.type === "trait.update"
                                ? [intent.params["entityId"] as string]
                                : [],
                        effect: "prevent",
                    },
                ],
            }
        }

        return { valid: true, violations: [] }
    },
})

// ── 4. door-fits-in-wall ──────────────────────────────────────────

export const DoorFitsInWall = defineConstraint({
    name: "door-fits-in-wall",
    description:
        "A door's width must not exceed the length of the wall it is placed in. " +
        "A door wider than its wall would extend beyond the wall's edges.",
    priority: 85,
    scope: "local",
    effect: "prevent",
    watch: {
        entityTypes: ["door"],
        traitNames: ["dimensional"],
        intentTypes: ["entity.create"],
    },
    evaluate(ctx) {
        const intent = ctx.trigger.intent

        let doorParentId: string | undefined
        let proposedWidth: number | undefined

        if (intent.type === "entity.create" && intent.params["entityType"] === "door") {
            doorParentId = intent.params["parent"] as string | undefined
            const traits = intent.params["traits"] as Record<string, unknown> | undefined
            const dim = traits?.["dimensional"] as Partial<DimensionalData> | undefined
            proposedWidth = dim?.width
        } else if (
            intent.type === "trait.update" &&
            intent.params["traitName"] === "dimensional"
        ) {
            const entityId = intent.params["entityId"] as string
            const entity = ctx.world.getEntity(entityId)
            if (!entity || entity.type !== "door") {
                return { valid: true, violations: [] }
            }
            doorParentId = entity.parent
            const data = intent.params["data"] as Partial<DimensionalData> | undefined
            proposedWidth = data?.width
        } else {
            return { valid: true, violations: [] }
        }

        if (!doorParentId || proposedWidth === undefined) {
            return { valid: true, violations: [] }
        }

        const wall = ctx.world.getEntity(doorParentId)
        if (!wall || wall.type !== "wall") {
            return { valid: true, violations: [] }
        }

        // Use ctx.world.getTrait for clean trait data access
        const wallDim = ctx.world.getTrait(doorParentId, "dimensional") as
            | Partial<DimensionalData>
            | undefined
        const wallLength = wallDim?.length

        if (wallLength !== undefined && proposedWidth > wallLength) {
            return {
                valid: false,
                violations: [
                    {
                        constraintName: "door-fits-in-wall",
                        message: `Door width ${proposedWidth}m exceeds wall length ${wallLength}m.`,
                        entityIds: [doorParentId],
                        effect: "prevent",
                    },
                ],
            }
        }

        return { valid: true, violations: [] }
    },
})

// ── 5. load-bearing-deletion-blocked ─────────────────────────────

export const LoadBearingDeletionBlocked = defineConstraint({
    name: "load-bearing-deletion-blocked",
    description:
        "A load-bearing wall cannot be deleted while it directly supports a roof or floor. " +
        "Remove or reassign the dependent structures first.",
    priority: 200,
    scope: "local",
    effect: "prevent",
    watch: {
        entityTypes: ["wall"],
        intentTypes: ["entity.delete"],
    },
    evaluate(ctx) {
        const intent = ctx.trigger.intent
        if (intent.type !== "entity.delete") {
            return { valid: true, violations: [] }
        }

        const wallId = intent.params["id"] as string | undefined
        if (!wallId) return { valid: true, violations: [] }

        // ctx.world.getEntity replaces manual byId lookup
        const wall = ctx.world.getEntity(wallId)
        if (!wall || wall.type !== "wall") {
            return { valid: true, violations: [] }
        }

        // ctx.world.getTrait replaces wall.traits["structural"] cast
        const structural = ctx.world.getTrait(wallId, "structural") as
            | Partial<StructuralData>
            | undefined
        if (!structural?.loadBearing) {
            return { valid: true, violations: [] }
        }

        // ctx.world.getChildren replaces manual wall.children.filter + byId
        const dependents = ctx.world
            .getChildren(wallId)
            .filter((c) => c.type === "roof" || c.type === "floor")

        if (dependents.length === 0) {
            return { valid: true, violations: [] }
        }

        return {
            valid: false,
            violations: [
                {
                    constraintName: "load-bearing-deletion-blocked",
                    message:
                        `Cannot delete load-bearing wall: it supports ${dependents.length} ` +
                        `structure(s) (${dependents.map((d) => d.id).join(", ")}). ` +
                        `Remove or reassign them first.`,
                    entityIds: [wallId, ...dependents.map((d) => d.id)],
                    effect: "prevent",
                },
            ],
        }
    },
})

// ── 6. roof-needs-support ─────────────────────────────────────────

export const RoofNeedsSupport = defineConstraint({
    name: "roof-needs-support",
    description:
        "A roof should be connected to at least one wall for structural support. " +
        "A free-floating roof is structurally invalid in a real building.",
    priority: 50,
    scope: "global",
    effect: "warn",
    watch: {
        entityTypes: ["roof", "wall"],
        intentTypes: ["entity.create", "entity.delete", "entity.reparent"],
    },
    evaluate(ctx) {
        const roofs = ctx.entities.byType("roof")
        const violations: Array<{
            constraintName: string
            message: string
            entityIds: string[]
            effect: "warn"
        }> = []

        for (const roof of roofs) {
            // ctx.world.getParent replaces manual entity.parent + byId lookup
            const parent = ctx.world.getParent(roof.id)
            const hasWallParent = parent?.type === "wall"

            // ctx.world.getChildren replaces manual roof.children.some + byId
            const hasWallChildren = ctx.world
                .getChildren(roof.id)
                .some((c) => c.type === "wall")

            if (!hasWallParent && !hasWallChildren) {
                violations.push({
                    constraintName: "roof-needs-support",
                    message: `Roof "${roof.id}" has no wall connections. Add walls for structural support.`,
                    entityIds: [roof.id],
                    effect: "warn",
                })
            }
        }

        return { valid: violations.length === 0, violations }
    },
})
