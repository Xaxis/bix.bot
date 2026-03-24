import { z } from "zod"
import { type IntentDefinition, type IntentHandlerResult } from "./intent.js"
import { type Entity } from "../entity/entity.js"
import { type EntityStore } from "../entity/entity-store.js"

// ── Shared schemas ──────────────────────────────────────────────

const EntitySnapshotSchema = z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    traits: z.record(z.string(), z.unknown()),
    children: z.array(z.string()),
    parent: z.string().optional(),
})

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Snapshot an entity and all its descendants into a flat array.
 * Order: parent first, then descendants depth-first.
 * This produces a serializable record of the entire subtree.
 */
function snapshotSubtree(
    entities: EntityStore,
    rootId: string,
): z.infer<typeof EntitySnapshotSchema>[] {
    const root = entities.getOrThrow(rootId)
    const snapshots: z.infer<typeof EntitySnapshotSchema>[] = []

    function walk(entity: Entity): void {
        snapshots.push({
            id: entity.id,
            type: entity.type,
            traits: JSON.parse(JSON.stringify(entity.traits)) as Record<string, unknown>,
            children: [...entity.children],
            parent: entity.parent,
        })
        for (const childId of entity.children) {
            const child = entities.get(childId)
            if (child !== undefined) {
                walk(child)
            }
        }
    }

    walk(root)
    return snapshots
}

// ── entity.create ───────────────────────────────────────────────

export const entityCreateIntent: IntentDefinition = {
    type: "entity.create",
    description: "Create a new entity of a given type.",
    paramsSchema: z.object({
        entityType: z.string().min(1),
        id: z.string().min(1).optional(),
        traits: z.record(z.string(), z.unknown()).optional(),
        parent: z.string().min(1).optional(),
    }),
    handler(ctx, params): IntentHandlerResult {
        const entityType = params["entityType"] as string
        const id = params["id"] as string | undefined
        const traits = params["traits"] as Record<string, unknown> | undefined
        const parent = params["parent"] as string | undefined

        const entity = ctx.entities.create(entityType, { id, traits, parent })

        return {
            inverse: {
                type: "entity.delete",
                params: { id: entity.id, cascade: true },
                source: "system",
            },
            data: { entityId: entity.id },
        }
    },
}

// ── entity.delete ───────────────────────────────────────────────

export const entityDeleteIntent: IntentDefinition = {
    type: "entity.delete",
    description: "Delete an entity. Cascade (default) deletes all descendants.",
    paramsSchema: z.object({
        id: z.string().min(1),
        cascade: z.boolean().optional(),
    }),
    handler(ctx, params): IntentHandlerResult {
        const id = params["id"] as string
        const cascade = (params["cascade"] as boolean | undefined) ?? true

        // Snapshot before deletion for undo
        const snapshots = cascade
            ? snapshotSubtree(ctx.entities, id)
            : [snapshotSubtree(ctx.entities, id)[0]!]

        ctx.entities.delete(id, { cascade })

        return {
            inverse: {
                type: "_entity.restoreSnapshot",
                params: { snapshots, rootId: id },
                source: "system",
            },
        }
    },
}

// ── _entity.restoreSnapshot (internal — undo support for delete) ─

export const entityRestoreSnapshotIntent: IntentDefinition = {
    type: "_entity.restoreSnapshot",
    description: "Internal: restore entities from a snapshot array (undo of delete).",
    paramsSchema: z.object({
        snapshots: z.array(EntitySnapshotSchema),
        rootId: z.string().min(1),
    }),
    handler(ctx, params): IntentHandlerResult {
        const snapshots = params["snapshots"] as z.infer<typeof EntitySnapshotSchema>[]
        const rootId = params["rootId"] as string

        // Recreate entities in order (parents before children).
        // The snapshot array is already ordered parent-first.
        for (const snap of snapshots) {
            // Create without parent first (parent might not exist yet
            // if it's external to the snapshot and was also deleted).
            // We'll wire up parents in a second pass.
            ctx.entities.create(snap.type, {
                id: snap.id,
                traits: snap.traits,
            })
        }

        // Second pass: wire up parent/child relationships
        for (const snap of snapshots) {
            if (snap.parent !== undefined && ctx.entities.has(snap.parent)) {
                ctx.entities.addChild(snap.parent, snap.id)
            }
        }

        return {
            inverse: {
                type: "entity.delete",
                params: { id: rootId, cascade: true },
                source: "system",
            },
        }
    },
}

// ── trait.update ─────────────────────────────────────────────────

export const traitUpdateIntent: IntentDefinition = {
    type: "trait.update",
    description: "Set or update trait data on an entity.",
    paramsSchema: z.object({
        entityId: z.string().min(1),
        traitName: z.string().min(1),
        data: z.unknown(),
    }),
    handler(ctx, params): IntentHandlerResult {
        const entityId = params["entityId"] as string
        const traitName = params["traitName"] as string
        const data = params["data"]

        // Snapshot previous value for undo
        const previousData = ctx.entities.getTrait(entityId, traitName)
        const hadTrait = ctx.entities.hasTrait(entityId, traitName)

        ctx.entities.setTrait(entityId, traitName, data)

        // Inverse: restore previous value, or remove trait if it didn't exist
        if (hadTrait) {
            return {
                inverse: {
                    type: "trait.update",
                    params: { entityId, traitName, data: previousData },
                    source: "system",
                },
            }
        }

        return {
            inverse: {
                type: "trait.remove",
                params: { entityId, traitName },
                source: "system",
            },
        }
    },
}

// ── trait.remove ─────────────────────────────────────────────────

export const traitRemoveIntent: IntentDefinition = {
    type: "trait.remove",
    description: "Remove a trait from an entity.",
    paramsSchema: z.object({
        entityId: z.string().min(1),
        traitName: z.string().min(1),
    }),
    handler(ctx, params): IntentHandlerResult {
        const entityId = params["entityId"] as string
        const traitName = params["traitName"] as string

        // Snapshot for undo
        const previousData = ctx.entities.getTrait(entityId, traitName)
        const hadTrait = ctx.entities.hasTrait(entityId, traitName)

        ctx.entities.removeTrait(entityId, traitName)

        if (hadTrait) {
            return {
                inverse: {
                    type: "trait.update",
                    params: { entityId, traitName, data: previousData },
                    source: "system",
                },
            }
        }

        // Trait didn't exist — nothing to undo
        return {}
    },
}

// ── entity.reparent ─────────────────────────────────────────────

export const entityReparentIntent: IntentDefinition = {
    type: "entity.reparent",
    description: "Move an entity to a new parent, or detach to root.",
    paramsSchema: z.object({
        entityId: z.string().min(1),
        newParentId: z.string().min(1).optional(),
    }),
    handler(ctx, params): IntentHandlerResult {
        const entityId = params["entityId"] as string
        const newParentId = params["newParentId"] as string | undefined

        // Snapshot current parent for undo
        const entity = ctx.entities.getOrThrow(entityId)
        const previousParentId = entity.parent

        if (newParentId !== undefined) {
            ctx.entities.addChild(newParentId, entityId)
        } else if (entity.parent !== undefined) {
            ctx.entities.removeChild(entity.parent, entityId)
        }

        return {
            inverse: {
                type: "entity.reparent",
                params: {
                    entityId,
                    ...(previousParentId !== undefined
                        ? { newParentId: previousParentId }
                        : {}),
                },
                source: "system",
            },
        }
    },
}

// ── All built-in intents ────────────────────────────────────────

export const BUILT_IN_INTENTS: readonly IntentDefinition[] = [
    entityCreateIntent,
    entityDeleteIntent,
    entityRestoreSnapshotIntent,
    traitUpdateIntent,
    traitRemoveIntent,
    entityReparentIntent,
] as const
