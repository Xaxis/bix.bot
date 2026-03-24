import { describe, it, expect, beforeEach, vi } from "vitest"
import { z } from "zod"
import { World } from "../world/world.js"
import { defineSchema } from "../schema/schema.js"
import { defineTrait } from "../trait/trait-definition.js"
import { defineConstraint } from "./constraint-definition.js"
import { ConstraintGraph } from "./constraint-graph.js"
import { ConstraintSolver } from "./constraint-solver.js"
import type {
    ConstraintContext,
    ConstraintDefinition,
    Violation,
} from "./constraint-definition.js"
import type { WorldEvent } from "../world/world.js"

// ── Test schema helpers ──────────────────────────────────────────

const lengthTrait = defineTrait({
    name: "length",
    schema: z.object({ meters: z.number().positive() }),
    defaults: { meters: 1 },
})

const loadTrait = defineTrait({
    name: "load",
    schema: z.object({ kg: z.number().nonnegative() }),
    defaults: { kg: 0 },
})

const capacityTrait = defineTrait({
    name: "capacity",
    schema: z.object({ maxKg: z.number().positive() }),
    defaults: { maxKg: 100 },
})

const counterTrait = defineTrait({
    name: "counter",
    schema: z.object({ value: z.number() }),
    defaults: { value: 0 },
})

// ── ConstraintGraph ──────────────────────────────────────────────

describe("ConstraintGraph", () => {
    let graph: ConstraintGraph

    const wallLengthConstraint = defineConstraint({
        name: "min-wall-length",
        description: "Walls must be at least 0.5m",
        priority: 10,
        scope: "local",
        effect: "prevent",
        watch: { entityTypes: ["wall"], traitNames: ["length"] },
        evaluate: () => ({ valid: true, violations: [] }),
    })

    const globalInvariant = defineConstraint({
        name: "world-invariant",
        description: "Always runs",
        priority: 5,
        scope: "global",
        effect: "warn",
        evaluate: () => ({ valid: true, violations: [] }),
    })

    const doorConstraint = defineConstraint({
        name: "door-on-wall",
        description: "Doors attach to walls",
        priority: 8,
        scope: "local",
        effect: "prevent",
        watch: { intentTypes: ["entity.create"], entityTypes: ["door"] },
        evaluate: () => ({ valid: true, violations: [] }),
    })

    beforeEach(() => {
        graph = new ConstraintGraph()
    })

    it("registers constraints", () => {
        graph.register(wallLengthConstraint)
        expect(graph.has("min-wall-length")).toBe(true)
        expect(graph.count).toBe(1)
    })

    it("rejects duplicate names", () => {
        graph.register(wallLengthConstraint)
        expect(() => graph.register(wallLengthConstraint)).toThrow("already registered")
    })

    it("registerAll registers multiple", () => {
        graph.registerAll([wallLengthConstraint, globalInvariant])
        expect(graph.count).toBe(2)
    })

    it("global constraint always appears in relevant results", () => {
        graph.register(globalInvariant)
        const fakeIntent = {
            id: "i1",
            type: "entity.create",
            params: {},
            source: "user" as const,
            timestamp: 0,
        }
        const relevant = graph.getRelevant(fakeIntent, [], [])
        expect(relevant).toContain(globalInvariant)
    })

    it("local constraint appears when entity type matches", () => {
        graph.register(wallLengthConstraint)
        const fakeIntent = {
            id: "i1",
            type: "trait.update",
            params: {},
            source: "user" as const,
            timestamp: 0,
        }
        const relevant = graph.getRelevant(fakeIntent, ["wall"], [])
        expect(relevant).toContain(wallLengthConstraint)
    })

    it("local constraint appears when trait name matches", () => {
        graph.register(wallLengthConstraint)
        const fakeIntent = {
            id: "i1",
            type: "trait.update",
            params: {},
            source: "user" as const,
            timestamp: 0,
        }
        const relevant = graph.getRelevant(fakeIntent, [], ["length"])
        expect(relevant).toContain(wallLengthConstraint)
    })

    it("local constraint appears when intent type matches", () => {
        graph.register(doorConstraint)
        const fakeIntent = {
            id: "i1",
            type: "entity.create",
            params: {},
            source: "user" as const,
            timestamp: 0,
        }
        const relevant = graph.getRelevant(fakeIntent, [], [])
        expect(relevant).toContain(doorConstraint)
    })

    it("local constraint NOT returned for unrelated intent", () => {
        graph.register(wallLengthConstraint) // watches wall + length
        const fakeIntent = {
            id: "i1",
            type: "entity.delete",
            params: {},
            source: "user" as const,
            timestamp: 0,
        }
        const relevant = graph.getRelevant(fakeIntent, ["door"], ["spatial"])
        expect(relevant).not.toContain(wallLengthConstraint)
    })

    it("deduplicates when constraint matches on multiple keys", () => {
        graph.register(wallLengthConstraint) // watches both entityType AND traitName
        const fakeIntent = {
            id: "i1",
            type: "trait.update",
            params: {},
            source: "user" as const,
            timestamp: 0,
        }
        const relevant = graph.getRelevant(fakeIntent, ["wall"], ["length"])
        const matchCount = relevant.filter((c) => c.name === "min-wall-length").length
        expect(matchCount).toBe(1)
    })

    it("sorts results by priority descending", () => {
        graph.registerAll([wallLengthConstraint, globalInvariant, doorConstraint])
        const fakeIntent = {
            id: "i1",
            type: "entity.create",
            params: {},
            source: "user" as const,
            timestamp: 0,
        }
        const relevant = graph.getRelevant(fakeIntent, ["wall", "door"], ["length"])
        const priorities = relevant.map((c) => c.priority)
        for (let i = 1; i < priorities.length; i++) {
            expect(priorities[i]!).toBeLessThanOrEqual(priorities[i - 1]!)
        }
    })
})

// ── Constraint effect: prevent ───────────────────────────────────

describe("constraint effect: prevent", () => {
    it("blocks mutation and returns prevented=true", () => {
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [lengthTrait],
            constraints: [
                defineConstraint({
                    name: "min-length",
                    description: "Walls must be at least 0.5m",
                    priority: 10,
                    scope: "local",
                    effect: "prevent",
                    watch: { entityTypes: ["wall"] },
                    evaluate(ctx) {
                        const intent = ctx.trigger.intent
                        if (
                            intent.type === "entity.create" &&
                            intent.params["entityType"] === "wall"
                        ) {
                            const traits = intent.params["traits"] as
                                | Record<string, unknown>
                                | undefined
                            const length =
                                (traits?.["length"] as { meters: number } | undefined)
                                    ?.meters ?? 1
                            if (length < 0.5) {
                                return {
                                    valid: false,
                                    violations: [
                                        {
                                            constraintName: "min-length",
                                            message: `Wall length ${length}m is below minimum 0.5m`,
                                            entityIds: [],
                                            effect: "prevent",
                                        },
                                    ],
                                }
                            }
                        }
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        const world = World.create(schema)

        // Valid wall: 1m — should succeed
        const ok = world.dispatch({
            type: "entity.create",
            params: { entityType: "wall", id: "w1", traits: { length: { meters: 1 } } },
        })
        expect(ok.prevented).toBeUndefined()
        expect(world.query.count).toBe(1)

        // Too short: 0.2m — should be prevented
        const blocked = world.dispatch({
            type: "entity.create",
            params: { entityType: "wall", id: "w2", traits: { length: { meters: 0.2 } } },
        })
        expect(blocked.prevented).toBe(true)
        expect(blocked.violations).toHaveLength(1)
        expect(blocked.violations![0]!.constraintName).toBe("min-length")
        expect(world.query.count).toBe(1) // w2 was not created
    })

    it("prevented dispatch does not emit a world event", () => {
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [],
            constraints: [
                defineConstraint({
                    name: "no-doors",
                    description: "Doors are not allowed",
                    priority: 1,
                    scope: "global",
                    effect: "prevent",
                    evaluate(ctx) {
                        if (ctx.trigger.intent.params["entityType"] === "door") {
                            return {
                                valid: false,
                                violations: [
                                    {
                                        constraintName: "no-doors",
                                        message: "Doors not allowed",
                                        entityIds: [],
                                        effect: "prevent",
                                    },
                                ],
                            }
                        }
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        const world = World.create(schema)
        const events: WorldEvent[] = []
        world.subscribe((e) => events.push(e))

        world.dispatch({ type: "entity.create", params: { entityType: "door" } })
        expect(events).toHaveLength(0) // no event — nothing changed
    })

    it("prevented dispatch does not go on the undo stack", () => {
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [],
            constraints: [
                defineConstraint({
                    name: "block-all",
                    description: "Block everything",
                    priority: 1,
                    scope: "global",
                    effect: "prevent",
                    evaluate() {
                        return {
                            valid: false,
                            violations: [
                                {
                                    constraintName: "block-all",
                                    message: "Blocked",
                                    entityIds: [],
                                    effect: "prevent",
                                },
                            ],
                        }
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({ type: "entity.create", params: { entityType: "box" } })
        expect(world.canUndo).toBe(false)
    })

    it("can prevent entity.delete by inspecting entity before deletion", () => {
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [loadTrait],
            constraints: [
                defineConstraint({
                    name: "no-delete-loaded",
                    description: "Cannot delete entities with load > 0",
                    priority: 10,
                    scope: "local",
                    effect: "prevent",
                    watch: { intentTypes: ["entity.delete"] },
                    evaluate(ctx) {
                        const id = ctx.trigger.intent.params["id"] as string | undefined
                        if (!id) return { valid: true, violations: [] }

                        const entity = ctx.entities.byId(id)
                        const currentLoad =
                            (entity?.traits["load"] as { kg: number } | undefined)?.kg ??
                            0

                        if (currentLoad > 0) {
                            return {
                                valid: false,
                                violations: [
                                    {
                                        constraintName: "no-delete-loaded",
                                        message: `Cannot delete entity "${id}" — it has ${currentLoad}kg of load`,
                                        entityIds: [id],
                                        effect: "prevent",
                                    },
                                ],
                            }
                        }
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({
            type: "entity.create",
            params: { entityType: "shelf", id: "s1" },
        })
        world.dispatch({
            type: "trait.update",
            params: { entityId: "s1", traitName: "load", data: { kg: 50 } },
        })

        // Should be prevented — entity has load
        const blocked = world.dispatch({ type: "entity.delete", params: { id: "s1" } })
        expect(blocked.prevented).toBe(true)
        expect(world.query.byId("s1")).toBeDefined() // still exists

        // Remove the load, then delete should succeed
        world.dispatch({
            type: "trait.update",
            params: { entityId: "s1", traitName: "load", data: { kg: 0 } },
        })
        const ok = world.dispatch({ type: "entity.delete", params: { id: "s1" } })
        expect(ok.prevented).toBeUndefined()
        expect(world.query.byId("s1")).toBeUndefined()
    })
})

// ── Constraint effect: warn ──────────────────────────────────────

describe("constraint effect: warn", () => {
    it("allows mutation but includes violations in result", () => {
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [lengthTrait],
            constraints: [
                defineConstraint({
                    name: "recommended-length",
                    description: "Walls ideally > 1m, but not required",
                    priority: 5,
                    scope: "local",
                    effect: "warn",
                    watch: { entityTypes: ["wall"] },
                    evaluate(ctx) {
                        const intent = ctx.trigger.intent
                        if (
                            intent.type === "entity.create" &&
                            intent.params["entityType"] === "wall"
                        ) {
                            const traits = intent.params["traits"] as
                                | Record<string, unknown>
                                | undefined
                            const length =
                                (traits?.["length"] as { meters: number } | undefined)
                                    ?.meters ?? 1
                            if (length < 1) {
                                return {
                                    valid: false,
                                    violations: [
                                        {
                                            constraintName: "recommended-length",
                                            message: "Wall shorter than recommended 1m",
                                            entityIds: [],
                                            effect: "warn",
                                        },
                                    ],
                                }
                            }
                        }
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        const world = World.create(schema)
        const result = world.dispatch({
            type: "entity.create",
            params: { entityType: "wall", id: "w1", traits: { length: { meters: 0.7 } } },
        })

        expect(result.prevented).toBeUndefined()
        expect(result.violations).toHaveLength(1)
        expect(result.violations![0]!.effect).toBe("warn")
        expect(world.query.count).toBe(1) // entity was created despite warning
    })

    it("warn violations are included in dispatch event", () => {
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [],
            constraints: [
                defineConstraint({
                    name: "always-warn",
                    description: "Always warn",
                    priority: 1,
                    scope: "global",
                    effect: "warn",
                    evaluate() {
                        return {
                            valid: false,
                            violations: [
                                {
                                    constraintName: "always-warn",
                                    message: "Warning",
                                    entityIds: [],
                                    effect: "warn",
                                },
                            ],
                        }
                    },
                }),
            ],
        })

        const world = World.create(schema)
        const events: WorldEvent[] = []
        world.subscribe((e) => events.push(e))

        world.dispatch({ type: "entity.create", params: { entityType: "box" } })
        expect(events).toHaveLength(1)
        const dispatched = events[0]
        if (dispatched?.type === "dispatched") {
            expect(dispatched.result.violations).toHaveLength(1)
        }
    })
})

// ── Constraint effect: adjust ────────────────────────────────────

describe("constraint effect: adjust", () => {
    it("dispatches fix intents after execution", () => {
        // Constraint: when an entity is created with counter trait,
        // set counter to 42 (a trivial but testable adjustment)
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [counterTrait],
            constraints: [
                defineConstraint({
                    name: "init-counter",
                    description: "Always initialize counter to 42",
                    priority: 5,
                    scope: "local",
                    effect: "adjust",
                    watch: { entityTypes: ["counted"], intentTypes: ["entity.create"] },
                    evaluate(ctx) {
                        const intent = ctx.trigger.intent
                        if (
                            intent.type === "entity.create" &&
                            intent.params["entityType"] === "counted"
                        ) {
                            const id = intent.params["id"] as string | undefined
                            if (id) {
                                return {
                                    valid: true,
                                    violations: [],
                                    suggestions: [
                                        {
                                            type: "trait.update",
                                            params: {
                                                entityId: id,
                                                traitName: "counter",
                                                data: { value: 42 },
                                            },
                                            source: "system" as const,
                                        },
                                    ],
                                }
                            }
                        }
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({
            type: "entity.create",
            params: { entityType: "counted", id: "c1" },
        })

        const entity = world.query.byId("c1")
        expect(entity).toBeDefined()
        const counter = entity?.traits["counter"] as { value: number } | undefined
        expect(counter?.value).toBe(42)
    })

    it("adjust does not prevent the original intent", () => {
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [counterTrait],
            constraints: [
                defineConstraint({
                    name: "snap-counter",
                    description: "Snaps counter to nearest 10",
                    priority: 1,
                    scope: "global",
                    effect: "adjust",
                    evaluate(ctx) {
                        return {
                            valid: true,
                            violations: [],
                            suggestions: ctx.entities.byTrait("counter").map((e) => ({
                                type: "trait.update",
                                params: {
                                    entityId: e.id,
                                    traitName: "counter",
                                    data: {
                                        value:
                                            Math.round(
                                                (e.traits["counter"] as { value: number })
                                                    .value / 10,
                                            ) * 10,
                                    },
                                },
                                source: "system" as const,
                            })),
                        }
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        expect(world.query.count).toBe(1) // entity created
    })
})

// ── Priority resolution ──────────────────────────────────────────

describe("priority resolution", () => {
    it("higher priority constraint is evaluated first", () => {
        const evaluationOrder: string[] = []

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [],
            constraints: [
                defineConstraint({
                    name: "low-priority",
                    description: "Low priority",
                    priority: 1,
                    scope: "global",
                    effect: "warn",
                    evaluate() {
                        evaluationOrder.push("low")
                        return { valid: true, violations: [] }
                    },
                }),
                defineConstraint({
                    name: "high-priority",
                    description: "High priority",
                    priority: 100,
                    scope: "global",
                    effect: "warn",
                    evaluate() {
                        evaluationOrder.push("high")
                        return { valid: true, violations: [] }
                    },
                }),
                defineConstraint({
                    name: "mid-priority",
                    description: "Mid priority",
                    priority: 50,
                    scope: "global",
                    effect: "warn",
                    evaluate() {
                        evaluationOrder.push("mid")
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        World.create(schema).dispatch({
            type: "entity.create",
            params: { entityType: "box" },
        })

        expect(evaluationOrder).toEqual(["high", "mid", "low"])
    })

    it("when higher priority prevent fires, all prevent violations are collected", () => {
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [],
            constraints: [
                defineConstraint({
                    name: "block-a",
                    description: "Block A",
                    priority: 100,
                    scope: "global",
                    effect: "prevent",
                    evaluate() {
                        return {
                            valid: false,
                            violations: [
                                {
                                    constraintName: "block-a",
                                    message: "A blocked",
                                    entityIds: [],
                                    effect: "prevent",
                                },
                            ],
                        }
                    },
                }),
                defineConstraint({
                    name: "block-b",
                    description: "Block B",
                    priority: 1,
                    scope: "global",
                    effect: "prevent",
                    evaluate() {
                        return {
                            valid: false,
                            violations: [
                                {
                                    constraintName: "block-b",
                                    message: "B blocked",
                                    entityIds: [],
                                    effect: "prevent",
                                },
                            ],
                        }
                    },
                }),
            ],
        })

        const world = World.create(schema)
        const result = world.dispatch({
            type: "entity.create",
            params: { entityType: "box" },
        })

        expect(result.prevented).toBe(true)
        // Both violations reported for richer error info
        expect(result.violations?.map((v) => v.constraintName).sort()).toEqual([
            "block-a",
            "block-b",
        ])
        expect(world.query.count).toBe(0)
    })
})

// ── Global vs local scope ────────────────────────────────────────

describe("global vs local scope", () => {
    it("global constraint fires on every intent", () => {
        const evaluations: string[] = []

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [lengthTrait],
            constraints: [
                defineConstraint({
                    name: "global-counter",
                    description: "Counts evaluations",
                    priority: 1,
                    scope: "global",
                    effect: "warn",
                    evaluate(ctx) {
                        evaluations.push(ctx.trigger.intent.type)
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        world.dispatch({
            type: "trait.update",
            params: { entityId: "b1", traitName: "length", data: { meters: 2 } },
        })
        world.dispatch({ type: "entity.delete", params: { id: "b1" } })

        expect(evaluations).toEqual(["entity.create", "trait.update", "entity.delete"])
    })

    it("local constraint only fires for watched entity types", () => {
        const evaluations: string[] = []

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [],
            constraints: [
                defineConstraint({
                    name: "wall-watcher",
                    description: "Only watches walls",
                    priority: 1,
                    scope: "local",
                    effect: "warn",
                    watch: { entityTypes: ["wall"] },
                    evaluate(ctx) {
                        evaluations.push(
                            ctx.trigger.intent.params["entityType"] as string,
                        )
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({
            type: "entity.create",
            params: { entityType: "door", id: "d1" },
        })
        world.dispatch({
            type: "entity.create",
            params: { entityType: "wall", id: "w1" },
        })
        world.dispatch({
            type: "entity.create",
            params: { entityType: "window", id: "win1" },
        })

        expect(evaluations).toEqual(["wall"]) // only the wall create triggered it
    })
})

// ── Multi-conditional constraint ─────────────────────────────────

describe("multi-conditional constraint", () => {
    it("constraint checks relationships between multiple entities", () => {
        // Rule: total load on any shelf cannot exceed its capacity
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [loadTrait, capacityTrait],
            constraints: [
                defineConstraint({
                    name: "shelf-capacity",
                    description:
                        "Total load on shelf children must not exceed shelf capacity",
                    priority: 20,
                    scope: "local",
                    effect: "prevent",
                    watch: { traitNames: ["load"], intentTypes: ["trait.update"] },
                    evaluate(ctx) {
                        const intent = ctx.trigger.intent
                        if (
                            intent.type !== "trait.update" ||
                            intent.params["traitName"] !== "load"
                        ) {
                            return { valid: true, violations: [] }
                        }

                        const entityId = intent.params["entityId"] as string
                        const entity = ctx.entities.byId(entityId)
                        if (!entity?.parent) return { valid: true, violations: [] }

                        const shelf = ctx.entities.byId(entity.parent)
                        if (!shelf) return { valid: true, violations: [] }

                        const maxKg =
                            (shelf.traits["capacity"] as { maxKg: number } | undefined)
                                ?.maxKg ?? Infinity

                        // Sum up proposed load from all children
                        const proposedLoad = intent.params["data"] as { kg: number }
                        let totalLoad = proposedLoad.kg
                        for (const childId of shelf.children) {
                            if (childId === entityId) continue // skip target — using proposed value
                            const sibling = ctx.entities.byId(childId)
                            totalLoad +=
                                (sibling?.traits["load"] as { kg: number } | undefined)
                                    ?.kg ?? 0
                        }

                        if (totalLoad > maxKg) {
                            return {
                                valid: false,
                                violations: [
                                    {
                                        constraintName: "shelf-capacity",
                                        message: `Total load ${totalLoad}kg exceeds shelf capacity ${maxKg}kg`,
                                        entityIds: [entity.parent, entityId],
                                        effect: "prevent",
                                    },
                                ],
                            }
                        }
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        const world = World.create(schema)

        // Build: shelf with two items
        world.dispatch({
            type: "entity.create",
            params: { entityType: "shelf", id: "shelf1" },
        })
        world.dispatch({
            type: "trait.update",
            params: { entityId: "shelf1", traitName: "capacity", data: { maxKg: 100 } },
        })

        world.dispatch({
            type: "entity.create",
            params: { entityType: "item", id: "item1", parent: "shelf1" },
        })
        world.dispatch({
            type: "entity.create",
            params: { entityType: "item", id: "item2", parent: "shelf1" },
        })

        // Put 60kg on item1 — ok (60 < 100)
        const ok1 = world.dispatch({
            type: "trait.update",
            params: { entityId: "item1", traitName: "load", data: { kg: 60 } },
        })
        expect(ok1.prevented).toBeUndefined()

        // Try to put 50kg on item2 — would total 110kg, exceeds capacity
        const blocked = world.dispatch({
            type: "trait.update",
            params: { entityId: "item2", traitName: "load", data: { kg: 50 } },
        })
        expect(blocked.prevented).toBe(true)
        expect(blocked.violations![0]!.message).toContain(
            "110kg exceeds shelf capacity 100kg",
        )

        // 30kg on item2 — ok (60+30=90 < 100)
        const ok2 = world.dispatch({
            type: "trait.update",
            params: { entityId: "item2", traitName: "load", data: { kg: 30 } },
        })
        expect(ok2.prevented).toBeUndefined()
    })
})

// ── Context-sensitive: references other entities' traits ─────────

describe("context-sensitive constraint", () => {
    it("constraint queries world state to make its decision", () => {
        // Rule: an "attachment" entity can only exist if there's a "host" entity
        // This is a global invariant checked on every entity.create
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [],
            constraints: [
                defineConstraint({
                    name: "attachment-needs-host",
                    description: "Attachments require at least one host entity to exist",
                    priority: 15,
                    scope: "global",
                    effect: "prevent",
                    evaluate(ctx) {
                        const intent = ctx.trigger.intent
                        if (
                            intent.type !== "entity.create" ||
                            intent.params["entityType"] !== "attachment"
                        ) {
                            return { valid: true, violations: [] }
                        }
                        const hosts = ctx.entities.byType("host")
                        if (hosts.length === 0) {
                            return {
                                valid: false,
                                violations: [
                                    {
                                        constraintName: "attachment-needs-host",
                                        message:
                                            "Cannot create attachment — no host entity exists",
                                        entityIds: [],
                                        effect: "prevent",
                                    },
                                ],
                            }
                        }
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        const world = World.create(schema)

        // No host exists yet — attachment should be blocked
        const blocked = world.dispatch({
            type: "entity.create",
            params: { entityType: "attachment", id: "a1" },
        })
        expect(blocked.prevented).toBe(true)
        expect(world.query.count).toBe(0)

        // Create a host
        world.dispatch({
            type: "entity.create",
            params: { entityType: "host", id: "h1" },
        })

        // Now attachment should succeed
        const ok = world.dispatch({
            type: "entity.create",
            params: { entityType: "attachment", id: "a1" },
        })
        expect(ok.prevented).toBeUndefined()
        expect(world.query.count).toBe(2)
    })
})

// ── Targeted re-evaluation ───────────────────────────────────────

describe("targeted re-evaluation", () => {
    it("only relevant constraints run — unrelated ones do not fire", () => {
        const wallConstraintEvals: number[] = []
        const doorConstraintEvals: number[] = []

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [],
            constraints: [
                defineConstraint({
                    name: "wall-only",
                    description: "Only for wall entities",
                    priority: 1,
                    scope: "local",
                    effect: "warn",
                    watch: { entityTypes: ["wall"] },
                    evaluate() {
                        wallConstraintEvals.push(1)
                        return { valid: true, violations: [] }
                    },
                }),
                defineConstraint({
                    name: "door-only",
                    description: "Only for door entities",
                    priority: 1,
                    scope: "local",
                    effect: "warn",
                    watch: { entityTypes: ["door"] },
                    evaluate() {
                        doorConstraintEvals.push(1)
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        const world = World.create(schema)

        // Creating a wall: wall constraint should fire, door should NOT
        world.dispatch({ type: "entity.create", params: { entityType: "wall" } })
        expect(wallConstraintEvals).toHaveLength(1)
        expect(doorConstraintEvals).toHaveLength(0)

        // Creating a door: door constraint fires, wall should NOT fire
        world.dispatch({ type: "entity.create", params: { entityType: "door" } })
        expect(wallConstraintEvals).toHaveLength(1) // unchanged
        expect(doorConstraintEvals).toHaveLength(1)
    })

    it("trait-watching constraint only fires when that trait changes", () => {
        const evals: string[] = []

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [lengthTrait, loadTrait],
            constraints: [
                defineConstraint({
                    name: "length-watcher",
                    description: "Only when length trait changes",
                    priority: 1,
                    scope: "local",
                    effect: "warn",
                    watch: { traitNames: ["length"] },
                    evaluate(ctx) {
                        evals.push(ctx.trigger.intent.params["traitName"] as string)
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })

        // Update length — should trigger
        world.dispatch({
            type: "trait.update",
            params: { entityId: "b1", traitName: "length", data: { meters: 2 } },
        })
        // Update load — should NOT trigger
        world.dispatch({
            type: "trait.update",
            params: { entityId: "b1", traitName: "load", data: { kg: 10 } },
        })

        expect(evals).toEqual(["length"]) // only the length update triggered it
    })
})

// ── Undo/redo with constraints ───────────────────────────────────

describe("undo/redo with constraints", () => {
    it("undo is available after a dispatch that passes constraints", () => {
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [],
            constraints: [
                defineConstraint({
                    name: "ok-constraint",
                    description: "Always passes",
                    priority: 1,
                    scope: "global",
                    effect: "warn",
                    evaluate() {
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
        expect(world.canUndo).toBe(true)

        world.undo()
        expect(world.query.count).toBe(0)
    })

    it("undo still works after constraints are registered", () => {
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [lengthTrait],
            constraints: [
                defineConstraint({
                    name: "min-length",
                    description: "Min length",
                    priority: 1,
                    scope: "local",
                    effect: "prevent",
                    watch: { entityTypes: ["wall"] },
                    evaluate() {
                        return { valid: true, violations: [] }
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({
            type: "entity.create",
            params: { entityType: "wall", id: "w1" },
        })
        world.dispatch({
            type: "trait.update",
            params: { entityId: "w1", traitName: "length", data: { meters: 3 } },
        })

        world.undo() // undo trait update
        const entity = world.query.byId("w1")
        expect(entity?.traits["length"]).toBeUndefined()

        world.undo() // undo entity create
        expect(world.query.count).toBe(0)
    })
})
