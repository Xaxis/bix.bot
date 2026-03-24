import { describe, it, expect, beforeEach, vi } from "vitest"
import { z } from "zod"
import { World } from "./world.js"
import { defineSchema } from "../schema/schema.js"
import { defineTrait } from "../trait/trait-definition.js"
import { BUILT_IN_TRAITS } from "../trait/built-in-traits.js"
import type { WorldEvent } from "./world.js"
import type { SpatialData } from "../trait/built-in-traits.js"

// ── Test schema ──────────────────────────────────────────────────

const colorTrait = defineTrait({
    name: "color",
    schema: z.object({
        r: z.number().min(0).max(255),
        g: z.number().min(0).max(255),
        b: z.number().min(0).max(255),
    }),
    defaults: { r: 128, g: 128, b: 128 },
})

const massSchema = z.object({ kg: z.number().positive() })
const massTrait = defineTrait({
    name: "mass",
    schema: massSchema,
    defaults: { kg: 1 },
})

const testSchema = defineSchema({
    name: "test-schema",
    version: "0.1.0",
    description: "Minimal schema used in World tests",
    traits: [colorTrait, massTrait],
})

// ── World.create ─────────────────────────────────────────────────

describe("World.create", () => {
    it("creates a world from a schema", () => {
        const world = World.create(testSchema)
        expect(world).toBeDefined()
        expect(world.schema).toBe(testSchema)
    })

    it("built-in traits are always available", () => {
        const world = World.create(testSchema)
        // dispatch uses built-in intents — if built-ins weren't registered this would throw
        world.dispatch({
            type: "entity.create",
            params: {
                entityType: "box",
                id: "b1",
                traits: {
                    spatial: {
                        position: { x: 0, y: 0, z: 0 },
                        rotation: { x: 0, y: 0, z: 0, w: 1 },
                        scale: { x: 1, y: 1, z: 1 },
                    },
                },
            },
        })
        expect(world.query.byId("b1")).toBeDefined()
    })

    it("schema traits are registered and validated", () => {
        const world = World.create(testSchema)
        world.dispatch({
            type: "entity.create",
            params: { entityType: "box", id: "b1" },
        })
        // Valid color data should succeed
        expect(() =>
            world.dispatch({
                type: "trait.update",
                params: {
                    entityId: "b1",
                    traitName: "color",
                    data: { r: 255, g: 0, b: 0 },
                },
            }),
        ).not.toThrow()
        // Invalid color data should fail
        expect(() =>
            world.dispatch({
                type: "trait.update",
                params: {
                    entityId: "b1",
                    traitName: "color",
                    data: { r: 999, g: 0, b: 0 },
                },
            }),
        ).toThrow()
    })

    it("rejects schema that shadows a built-in trait name", () => {
        expect(() =>
            defineSchema({
                name: "bad-schema",
                version: "0.1.0",
                traits: [
                    defineTrait({
                        name: "spatial", // shadows built-in
                        schema: z.object({ x: z.number() }),
                        defaults: { x: 0 },
                    }),
                ],
            }),
        ).toThrow("TRAIT_SHADOWS_BUILTIN")
    })

    it("multiple worlds are independent (no shared singletons)", () => {
        const worldA = World.create(testSchema)
        const worldB = World.create(testSchema)

        worldA.dispatch({
            type: "entity.create",
            params: { entityType: "box", id: "a1" },
        })
        expect(worldA.query.count).toBe(1)
        expect(worldB.query.count).toBe(0)

        worldB.dispatch({
            type: "entity.create",
            params: { entityType: "box", id: "b1" },
        })
        expect(worldA.query.count).toBe(1)
        expect(worldB.query.count).toBe(1)
        expect(worldA.query.byId("b1")).toBeUndefined()
        expect(worldB.query.byId("a1")).toBeUndefined()
    })
})

// ── World.dispatch ───────────────────────────────────────────────

describe("World.dispatch", () => {
    let world: World

    beforeEach(() => {
        world = World.create(testSchema)
    })

    it("dispatches a valid intent and returns result", () => {
        const result = world.dispatch({
            type: "entity.create",
            params: { entityType: "box", id: "b1" },
        })
        expect(result.intent.type).toBe("entity.create")
        expect(result.intent.id).toBeTruthy()
        expect(result.data?.["entityId"]).toBe("b1")
    })

    it("rejects intent with invalid params", () => {
        expect(() =>
            world.dispatch({
                type: "entity.create",
                params: { entityType: 42 }, // wrong type
            }),
        ).toThrow("params invalid")
    })

    it("rejects unregistered intent type", () => {
        expect(() => world.dispatch({ type: "not.registered", params: {} })).toThrow(
            "not registered",
        )
    })

    it("mutates entity state", () => {
        world.dispatch({
            type: "entity.create",
            params: { entityType: "wall", id: "w1" },
        })
        expect(world.query.byId("w1")?.type).toBe("wall")
    })
})

// ── World.query ──────────────────────────────────────────────────

describe("World.query", () => {
    let world: World

    beforeEach(() => {
        world = World.create(testSchema)
        world.dispatch({
            type: "entity.create",
            params: { entityType: "wall", id: "w1" },
        })
        world.dispatch({
            type: "entity.create",
            params: { entityType: "wall", id: "w2" },
        })
        world.dispatch({
            type: "entity.create",
            params: { entityType: "door", id: "d1" },
        })
        // Give w1 a spatial trait and color; w2 just spatial
        world.dispatch({
            type: "trait.update",
            params: {
                entityId: "w1",
                traitName: "spatial",
                data: {
                    position: { x: 1, y: 0, z: 0 },
                    rotation: { x: 0, y: 0, z: 0, w: 1 },
                    scale: { x: 1, y: 1, z: 1 },
                },
            },
        })
        world.dispatch({
            type: "trait.update",
            params: { entityId: "w1", traitName: "color", data: { r: 255, g: 0, b: 0 } },
        })
        world.dispatch({
            type: "trait.update",
            params: {
                entityId: "w2",
                traitName: "spatial",
                data: {
                    position: { x: 2, y: 0, z: 0 },
                    rotation: { x: 0, y: 0, z: 0, w: 1 },
                    scale: { x: 1, y: 1, z: 1 },
                },
            },
        })
    })

    describe("all()", () => {
        it("returns all entities", () => {
            expect(world.query.all()).toHaveLength(3)
        })

        it("returns readonly array", () => {
            const all = world.query.all()
            expect(Array.isArray(all)).toBe(true)
        })
    })

    describe("byId()", () => {
        it("returns entity by id", () => {
            expect(world.query.byId("w1")?.id).toBe("w1")
        })

        it("returns undefined for missing id", () => {
            expect(world.query.byId("nonexistent")).toBeUndefined()
        })
    })

    describe("byType()", () => {
        it("returns entities of the given type", () => {
            expect(world.query.byType("wall")).toHaveLength(2)
            expect(world.query.byType("door")).toHaveLength(1)
            expect(world.query.byType("window")).toHaveLength(0)
        })
    })

    describe("byTrait()", () => {
        it("returns entities that have the trait", () => {
            const withSpatial = world.query.byTrait("spatial")
            expect(withSpatial).toHaveLength(2)
            expect(withSpatial.map((e) => e.id).sort()).toEqual(["w1", "w2"])
        })

        it("returns only entities with the color trait", () => {
            const withColor = world.query.byTrait("color")
            expect(withColor).toHaveLength(1)
            expect(withColor[0]?.id).toBe("w1")
        })

        it("returns empty array when no entities have the trait", () => {
            expect(world.query.byTrait("mass")).toHaveLength(0)
        })
    })

    describe("withTraits()", () => {
        it("returns entities having ALL specified traits", () => {
            const withBoth = world.query.withTraits(["spatial", "color"])
            expect(withBoth).toHaveLength(1)
            expect(withBoth[0]?.id).toBe("w1")
        })

        it("returns empty when no entity has all traits", () => {
            expect(world.query.withTraits(["spatial", "mass"])).toHaveLength(0)
        })

        it("returns all entities for empty trait list", () => {
            // Every entity has all zero traits requested
            expect(world.query.withTraits([])).toHaveLength(3)
        })
    })

    describe("count", () => {
        it("reflects current entity count", () => {
            expect(world.query.count).toBe(3)
        })
    })
})

// ── World.subscribe ──────────────────────────────────────────────

describe("World.subscribe", () => {
    let world: World

    beforeEach(() => {
        world = World.create(testSchema)
    })

    it("fires on dispatch", () => {
        const events: WorldEvent[] = []
        world.subscribe((e) => events.push(e))

        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })

        expect(events).toHaveLength(1)
        expect(events[0]?.type).toBe("dispatched")
    })

    it("dispatched event contains the intent and result", () => {
        const events: WorldEvent[] = []
        world.subscribe((e) => events.push(e))

        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })

        const event = events[0]
        expect(event?.type).toBe("dispatched")
        if (event?.type === "dispatched") {
            expect(event.intent.type).toBe("entity.create")
            expect(event.result.data?.["entityId"]).toBe("b1")
        }
    })

    it("fires on undo", () => {
        const events: WorldEvent[] = []
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })

        world.subscribe((e) => events.push(e))
        world.undo()

        expect(events).toHaveLength(1)
        expect(events[0]?.type).toBe("undone")
    })

    it("undone event contains the original intent", () => {
        const events: WorldEvent[] = []
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        world.subscribe((e) => events.push(e))
        world.undo()

        const event = events[0]
        expect(event?.type).toBe("undone")
        if (event?.type === "undone") {
            expect(event.intent.type).toBe("entity.create")
        }
    })

    it("fires on redo", () => {
        const events: WorldEvent[] = []
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        world.undo()

        world.subscribe((e) => events.push(e))
        world.redo()

        expect(events).toHaveLength(1)
        expect(events[0]?.type).toBe("redone")
    })

    it("does not fire when nothing to undo", () => {
        const handler = vi.fn()
        world.subscribe(handler)
        world.undo()
        expect(handler).not.toHaveBeenCalled()
    })

    it("does not fire when nothing to redo", () => {
        const handler = vi.fn()
        world.subscribe(handler)
        world.redo()
        expect(handler).not.toHaveBeenCalled()
    })

    it("unsubscribe stops event delivery", () => {
        const events: WorldEvent[] = []
        const unsub = world.subscribe((e) => events.push(e))

        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        expect(events).toHaveLength(1)

        unsub()

        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b2" } })
        expect(events).toHaveLength(1) // still 1 — second dispatch not received
    })

    it("unsubscribe is idempotent", () => {
        const unsub = world.subscribe(() => {})
        unsub()
        expect(() => unsub()).not.toThrow()
    })

    it("multiple subscribers all receive events", () => {
        const a: WorldEvent[] = []
        const b: WorldEvent[] = []
        world.subscribe((e) => a.push(e))
        world.subscribe((e) => b.push(e))

        world.dispatch({ type: "entity.create", params: { entityType: "box" } })
        expect(a).toHaveLength(1)
        expect(b).toHaveLength(1)
    })

    it("subscriberCount tracks active subscriptions", () => {
        expect(world.subscriberCount).toBe(0)
        const unsub1 = world.subscribe(() => {})
        const unsub2 = world.subscribe(() => {})
        expect(world.subscriberCount).toBe(2)
        unsub1()
        expect(world.subscriberCount).toBe(1)
        unsub2()
        expect(world.subscriberCount).toBe(0)
    })
})

// ── World.undo / redo ────────────────────────────────────────────

describe("World undo / redo", () => {
    let world: World

    beforeEach(() => {
        world = World.create(testSchema)
    })

    it("undo reverses a dispatch", () => {
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        expect(world.query.count).toBe(1)

        world.undo()
        expect(world.query.count).toBe(0)
    })

    it("redo re-applies after undo", () => {
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        world.undo()
        world.redo()
        expect(world.query.count).toBe(1)
        expect(world.query.byId("b1")).toBeDefined()
    })

    it("canUndo/canRedo reflect stack state", () => {
        expect(world.canUndo).toBe(false)
        expect(world.canRedo).toBe(false)

        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        expect(world.canUndo).toBe(true)
        expect(world.canRedo).toBe(false)

        world.undo()
        expect(world.canUndo).toBe(false)
        expect(world.canRedo).toBe(true)

        world.redo()
        expect(world.canUndo).toBe(true)
        expect(world.canRedo).toBe(false)
    })

    it("undo returns false when stack is empty", () => {
        expect(world.undo()).toBe(false)
    })

    it("redo returns false when stack is empty", () => {
        expect(world.redo()).toBe(false)
    })

    it("new dispatch clears redo stack", () => {
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "a" } })
        world.undo()
        expect(world.canRedo).toBe(true)

        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b" } })
        expect(world.canRedo).toBe(false)
    })

    it("undo trait update restores previous value", () => {
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        world.dispatch({
            type: "trait.update",
            params: { entityId: "b1", traitName: "color", data: { r: 255, g: 0, b: 0 } },
        })
        expect((world.query.byId("b1")?.traits["color"] as { r: number })?.r).toBe(255)

        world.undo()
        expect(world.query.byId("b1")?.traits["color"]).toBeUndefined()
    })
})

// ── World.serialize / deserialize ────────────────────────────────

describe("World.serialize / deserialize", () => {
    let world: World

    beforeEach(() => {
        world = World.create(testSchema)
    })

    it("serialize returns a snapshot with schema info", () => {
        const snap = world.serialize()
        expect(snap.schemaName).toBe("test-schema")
        expect(snap.schemaVersion).toBe("0.1.0")
        expect(snap.entities).toEqual([])
    })

    it("snapshot captures all entities", () => {
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        world.dispatch({
            type: "entity.create",
            params: { entityType: "wall", id: "w1" },
        })

        const snap = world.serialize()
        expect(snap.entities).toHaveLength(2)
        const ids = snap.entities.map((e) => e.id).sort()
        expect(ids).toEqual(["b1", "w1"])
    })

    it("snapshot captures trait data", () => {
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        world.dispatch({
            type: "trait.update",
            params: {
                entityId: "b1",
                traitName: "color",
                data: { r: 200, g: 100, b: 50 },
            },
        })

        const snap = world.serialize()
        const entity = snap.entities.find((e) => e.id === "b1")
        expect(entity?.traits["color"]).toEqual({ r: 200, g: 100, b: 50 })
    })

    it("snapshot captures parent/child relationships", () => {
        world.dispatch({
            type: "entity.create",
            params: { entityType: "group", id: "g1" },
        })
        world.dispatch({
            type: "entity.create",
            params: { entityType: "box", id: "b1", parent: "g1" },
        })

        const snap = world.serialize()
        const group = snap.entities.find((e) => e.id === "g1")
        const child = snap.entities.find((e) => e.id === "b1")

        expect(group?.children).toContain("b1")
        expect(child?.parent).toBe("g1")
    })

    it("snapshot is JSON-serializable", () => {
        world.dispatch({
            type: "entity.create",
            params: {
                entityType: "box",
                id: "b1",
                traits: {
                    spatial: {
                        position: { x: 1, y: 2, z: 3 },
                        rotation: { x: 0, y: 0, z: 0, w: 1 },
                        scale: { x: 1, y: 1, z: 1 },
                    },
                },
            },
        })
        const snap = world.serialize()
        expect(() => JSON.stringify(snap)).not.toThrow()
        expect(JSON.parse(JSON.stringify(snap))).toEqual(snap)
    })

    it("deserialize recreates all entities", () => {
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        world.dispatch({
            type: "entity.create",
            params: { entityType: "wall", id: "w1" },
        })

        const snap = world.serialize()
        const restored = World.deserialize(snap, testSchema)

        expect(restored.query.count).toBe(2)
        expect(restored.query.byId("b1")?.type).toBe("box")
        expect(restored.query.byId("w1")?.type).toBe("wall")
    })

    it("deserialize restores trait data", () => {
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        world.dispatch({
            type: "trait.update",
            params: {
                entityId: "b1",
                traitName: "color",
                data: { r: 42, g: 84, b: 168 },
            },
        })

        const snap = world.serialize()
        const restored = World.deserialize(snap, testSchema)

        expect(restored.query.byId("b1")?.traits["color"]).toEqual({
            r: 42,
            g: 84,
            b: 168,
        })
    })

    it("deserialize restores parent/child relationships", () => {
        world.dispatch({
            type: "entity.create",
            params: { entityType: "group", id: "g1" },
        })
        world.dispatch({
            type: "entity.create",
            params: { entityType: "box", id: "b1", parent: "g1" },
        })
        world.dispatch({
            type: "entity.create",
            params: { entityType: "box", id: "b2", parent: "g1" },
        })

        const snap = world.serialize()
        const restored = World.deserialize(snap, testSchema)

        const group = restored.query.byId("g1")
        const child1 = restored.query.byId("b1")
        const child2 = restored.query.byId("b2")

        expect(group?.children).toContain("b1")
        expect(group?.children).toContain("b2")
        expect(child1?.parent).toBe("g1")
        expect(child2?.parent).toBe("g1")
    })

    it("deserialize starts with empty undo/redo history", () => {
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        const snap = world.serialize()

        const restored = World.deserialize(snap, testSchema)
        expect(restored.canUndo).toBe(false)
        expect(restored.canRedo).toBe(false)
    })

    it("restored world is fully functional — can dispatch further intents", () => {
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        const snap = world.serialize()

        const restored = World.deserialize(snap, testSchema)
        restored.dispatch({
            type: "entity.create",
            params: { entityType: "wall", id: "w1" },
        })
        expect(restored.query.count).toBe(2)
    })

    it("deserialize rejects snapshot from a different schema", () => {
        const otherSchema = defineSchema({
            name: "other-schema",
            version: "1.0.0",
            traits: [],
        })
        const snap = world.serialize()

        expect(() => World.deserialize(snap, otherSchema)).toThrow(
            'Snapshot schema "test-schema" does not match provided schema "other-schema"',
        )
    })

    it("round-trip preserves deep spatial data", () => {
        world.dispatch({
            type: "entity.create",
            params: {
                entityType: "object",
                id: "obj1",
                traits: {
                    spatial: {
                        position: { x: 10.5, y: -3.14, z: 100 },
                        rotation: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
                        scale: { x: 2, y: 2, z: 2 },
                    },
                },
            },
        })

        const snap = world.serialize()
        const restored = World.deserialize(snap, testSchema)

        const spatial = restored.query.byId("obj1")?.traits["spatial"] as SpatialData
        expect(spatial.position).toEqual({ x: 10.5, y: -3.14, z: 100 })
        expect(spatial.rotation).toEqual({ x: 0.1, y: 0.2, z: 0.3, w: 0.9 })
        expect(spatial.scale).toEqual({ x: 2, y: 2, z: 2 })
    })
})

// ── Two independent World instances ─────────────────────────────

describe("World isolation", () => {
    it("two worlds share no state", () => {
        const worldA = World.create(testSchema)
        const worldB = World.create(testSchema)

        worldA.dispatch({
            type: "entity.create",
            params: { entityType: "box", id: "shared-id" },
        })
        expect(worldA.query.byId("shared-id")).toBeDefined()
        expect(worldB.query.byId("shared-id")).toBeUndefined()
    })

    it("undo in one world doesn't affect the other", () => {
        const worldA = World.create(testSchema)
        const worldB = World.create(testSchema)

        worldA.dispatch({ type: "entity.create", params: { entityType: "box", id: "a" } })
        worldB.dispatch({ type: "entity.create", params: { entityType: "box", id: "b" } })

        worldA.undo()
        expect(worldA.query.count).toBe(0)
        expect(worldB.query.count).toBe(1) // B is unaffected
    })

    it("subscribers on one world don't receive events from another", () => {
        const worldA = World.create(testSchema)
        const worldB = World.create(testSchema)

        const eventsOnA: WorldEvent[] = []
        worldA.subscribe((e) => eventsOnA.push(e))

        worldB.dispatch({ type: "entity.create", params: { entityType: "box" } })
        expect(eventsOnA).toHaveLength(0)
    })

    it("deserializing a world into a new instance is independent", () => {
        const original = World.create(testSchema)
        original.dispatch({
            type: "entity.create",
            params: { entityType: "box", id: "orig" },
        })

        const restored = World.deserialize(original.serialize(), testSchema)
        restored.dispatch({ type: "entity.delete", params: { id: "orig" } })

        expect(original.query.count).toBe(1) // original unaffected
        expect(restored.query.count).toBe(0)
    })
})

// ── defineSchema validation ──────────────────────────────────────

describe("defineSchema", () => {
    it("rejects empty name", () => {
        expect(() => defineSchema({ name: "", version: "1.0.0", traits: [] })).toThrow(
            "name must not be empty",
        )
    })

    it("rejects empty version", () => {
        expect(() => defineSchema({ name: "test", version: "", traits: [] })).toThrow(
            "version must not be empty",
        )
    })

    it("rejects duplicate trait names", () => {
        const trait = defineTrait({
            name: "dupe",
            schema: z.object({ x: z.number() }),
            defaults: { x: 0 },
        })
        expect(() =>
            defineSchema({ name: "test", version: "1.0.0", traits: [trait, trait] }),
        ).toThrow("DUPLICATE_TRAIT_NAME")
    })

    it("accepts schema with no domain traits", () => {
        expect(() =>
            defineSchema({ name: "minimal", version: "0.0.1", traits: [] }),
        ).not.toThrow()
    })
})
