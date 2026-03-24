import { describe, it, expect, beforeEach, vi } from "vitest"
import { z } from "zod"
import { World } from "../world/world.js"
import { defineSchema } from "../schema/schema.js"
import { defineTrait } from "../trait/trait-definition.js"
import { defineSystem } from "./system-definition.js"
import { SystemRunner } from "./system-runner.js"
import { defineConstraint } from "../constraint/constraint-definition.js"
import type { SystemDefinition } from "./system-definition.js"
import type { Entity } from "../entity/entity.js"
import type { IntentInput } from "../intent/intent.js"

// ── Test traits ──────────────────────────────────────────────────

const velocityTrait = defineTrait({
    name: "velocity",
    schema: z.object({ vx: z.number(), vy: z.number() }),
    defaults: { vx: 0, vy: 0 },
})

const positionTrait = defineTrait({
    name: "position",
    schema: z.object({ x: z.number(), y: z.number() }),
    defaults: { x: 0, y: 0 },
})

const healthTrait = defineTrait({
    name: "health",
    schema: z.object({ hp: z.number() }),
    defaults: { hp: 100 },
})

const counterTrait = defineTrait({
    name: "counter",
    schema: z.object({ value: z.number() }),
    defaults: { value: 0 },
})

// ── Base schema ──────────────────────────────────────────────────

const baseSchema = defineSchema({
    name: "test",
    version: "0.1.0",
    traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
})

// ── defineSystem helper ──────────────────────────────────────────

describe("defineSystem", () => {
    it("creates a valid SystemDefinition", () => {
        const sys = defineSystem({
            name: "gravity",
            requiredTraits: ["velocity"],
            phase: "physics",
            priority: 10,
            update: () => [],
        })
        expect(sys.name).toBe("gravity")
        expect(sys.phase).toBe("physics")
        expect(sys.priority).toBe(10)
    })

    it("rejects empty name", () => {
        expect(() =>
            defineSystem({
                name: "",
                requiredTraits: [],
                phase: "physics",
                priority: 0,
                update: () => [],
            }),
        ).toThrow("name must not be empty")
    })

    it("rejects unknown phase", () => {
        expect(() =>
            defineSystem({
                name: "bad",
                requiredTraits: [],
                phase: "unknown-phase" as never,
                priority: 0,
                update: () => [],
            }),
        ).toThrow("unknown phase")
    })
})

// ── SystemRunner registration ────────────────────────────────────

describe("SystemRunner registration", () => {
    let runner: SystemRunner

    beforeEach(() => {
        runner = new SystemRunner()
    })

    it("registers a system", () => {
        const sys = defineSystem({
            name: "s",
            requiredTraits: [],
            phase: "physics",
            priority: 0,
            update: () => [],
        })
        runner.register(sys)
        expect(runner.has("s")).toBe(true)
        expect(runner.count).toBe(1)
    })

    it("rejects duplicate name", () => {
        const sys = defineSystem({
            name: "s",
            requiredTraits: [],
            phase: "physics",
            priority: 0,
            update: () => [],
        })
        runner.register(sys)
        expect(() => runner.register(sys)).toThrow("already registered")
    })

    it("registerAll registers multiple", () => {
        const s1 = defineSystem({
            name: "a",
            requiredTraits: [],
            phase: "physics",
            priority: 0,
            update: () => [],
        })
        const s2 = defineSystem({
            name: "b",
            requiredTraits: [],
            phase: "render-prep",
            priority: 0,
            update: () => [],
        })
        runner.registerAll([s1, s2])
        expect(runner.count).toBe(2)
    })
})

// ── trait filtering ──────────────────────────────────────────────

describe("system trait filtering", () => {
    it("system only runs on entities with all required traits", () => {
        const touched: string[] = []

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
            systems: [
                defineSystem({
                    name: "motion",
                    requiredTraits: ["velocity", "position"],
                    phase: "physics",
                    priority: 0,
                    update(entities) {
                        touched.push(...entities.map((e) => e.id))
                        return []
                    },
                }),
            ],
        })

        const world = World.create(schema)

        // has both → should be touched
        world.dispatch({
            type: "entity.create",
            params: { entityType: "mover", id: "m1" },
        })
        world.dispatch({
            type: "trait.update",
            params: { entityId: "m1", traitName: "velocity", data: { vx: 1, vy: 0 } },
        })
        world.dispatch({
            type: "trait.update",
            params: { entityId: "m1", traitName: "position", data: { x: 0, y: 0 } },
        })

        // has only velocity → should NOT be touched
        world.dispatch({
            type: "entity.create",
            params: { entityType: "mover", id: "m2" },
        })
        world.dispatch({
            type: "trait.update",
            params: { entityId: "m2", traitName: "velocity", data: { vx: 1, vy: 0 } },
        })

        // has neither → should NOT be touched
        world.dispatch({
            type: "entity.create",
            params: { entityType: "static", id: "s1" },
        })

        world.tick(0.016)

        expect(touched).toContain("m1")
        expect(touched).not.toContain("m2")
        expect(touched).not.toContain("s1")
    })

    it("system with empty requiredTraits runs on all entities", () => {
        const touched: string[] = []

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
            systems: [
                defineSystem({
                    name: "tick-all",
                    requiredTraits: [],
                    phase: "pre-physics",
                    priority: 0,
                    update(entities) {
                        touched.push(...entities.map((e) => e.id))
                        return []
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({ type: "entity.create", params: { entityType: "a", id: "a1" } })
        world.dispatch({ type: "entity.create", params: { entityType: "b", id: "b1" } })

        world.tick(0.016)

        expect(touched).toContain("a1")
        expect(touched).toContain("b1")
    })

    it("no matching entities is a no-op, not an error", () => {
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
            systems: [
                defineSystem({
                    name: "motion",
                    requiredTraits: ["velocity", "position"],
                    phase: "physics",
                    priority: 0,
                    update: () => [],
                }),
            ],
        })

        const world = World.create(schema)
        // No entities created — tick should not throw
        expect(() => world.tick(0.016)).not.toThrow()
    })
})

// ── Phase and priority ordering ──────────────────────────────────

describe("execution order", () => {
    it("systems run in phase order", () => {
        const order: string[] = []

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
            systems: [
                defineSystem({
                    name: "render",
                    requiredTraits: [],
                    phase: "render-prep",
                    priority: 0,
                    update() {
                        order.push("render-prep")
                        return []
                    },
                }),
                defineSystem({
                    name: "physics",
                    requiredTraits: [],
                    phase: "physics",
                    priority: 0,
                    update() {
                        order.push("physics")
                        return []
                    },
                }),
                defineSystem({
                    name: "pre",
                    requiredTraits: [],
                    phase: "pre-physics",
                    priority: 0,
                    update() {
                        order.push("pre-physics")
                        return []
                    },
                }),
                defineSystem({
                    name: "post",
                    requiredTraits: [],
                    phase: "post-physics",
                    priority: 0,
                    update() {
                        order.push("post-physics")
                        return []
                    },
                }),
                defineSystem({
                    name: "constraints",
                    requiredTraits: [],
                    phase: "constraints",
                    priority: 0,
                    update() {
                        order.push("constraints")
                        return []
                    },
                }),
            ],
        })

        // Need at least one entity for requiredTraits=[] systems to run
        const world = World.create(schema)
        world.dispatch({ type: "entity.create", params: { entityType: "any", id: "x" } })
        world.tick(0.016)

        expect(order).toEqual([
            "pre-physics",
            "physics",
            "post-physics",
            "constraints",
            "render-prep",
        ])
    })

    it("within a phase, higher priority runs first", () => {
        const order: string[] = []

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
            systems: [
                defineSystem({
                    name: "low",
                    requiredTraits: [],
                    phase: "physics",
                    priority: 1,
                    update() {
                        order.push("low")
                        return []
                    },
                }),
                defineSystem({
                    name: "high",
                    requiredTraits: [],
                    phase: "physics",
                    priority: 100,
                    update() {
                        order.push("high")
                        return []
                    },
                }),
                defineSystem({
                    name: "mid",
                    requiredTraits: [],
                    phase: "physics",
                    priority: 50,
                    update() {
                        order.push("mid")
                        return []
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({ type: "entity.create", params: { entityType: "any", id: "x" } })
        world.tick(0.016)

        expect(order).toEqual(["high", "mid", "low"])
    })

    it("getSortedSystems reflects phase + priority order", () => {
        const runner = new SystemRunner()
        runner.registerAll([
            defineSystem({
                name: "b-render",
                requiredTraits: [],
                phase: "render-prep",
                priority: 10,
                update: () => [],
            }),
            defineSystem({
                name: "a-physics",
                requiredTraits: [],
                phase: "physics",
                priority: 5,
                update: () => [],
            }),
            defineSystem({
                name: "c-physics",
                requiredTraits: [],
                phase: "physics",
                priority: 100,
                update: () => [],
            }),
        ])

        const sorted = runner.getSortedSystems()
        expect(sorted[0]!.name).toBe("c-physics") // physics, priority 100
        expect(sorted[1]!.name).toBe("a-physics") // physics, priority 5
        expect(sorted[2]!.name).toBe("b-render") // render-prep
    })
})

// ── System emitting intents ──────────────────────────────────────

describe("system emitting intents", () => {
    it("system can mutate world state by returning intents", () => {
        // Motion system: updates position based on velocity each tick
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
            systems: [
                defineSystem({
                    name: "motion",
                    requiredTraits: ["velocity", "position"],
                    phase: "physics",
                    priority: 10,
                    update(entities, _world, dt): IntentInput[] {
                        return entities.flatMap((e) => {
                            const vel = e.traits["velocity"] as { vx: number; vy: number }
                            const pos = e.traits["position"] as { x: number; y: number }
                            return [
                                {
                                    type: "trait.update",
                                    params: {
                                        entityId: e.id,
                                        traitName: "position",
                                        data: {
                                            x: pos.x + vel.vx * dt,
                                            y: pos.y + vel.vy * dt,
                                        },
                                    },
                                },
                            ]
                        })
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({
            type: "entity.create",
            params: { entityType: "ball", id: "ball1" },
        })
        world.dispatch({
            type: "trait.update",
            params: { entityId: "ball1", traitName: "velocity", data: { vx: 10, vy: 5 } },
        })
        world.dispatch({
            type: "trait.update",
            params: { entityId: "ball1", traitName: "position", data: { x: 0, y: 0 } },
        })

        world.tick(1.0) // 1 second
        const pos = world.query.byId("ball1")?.traits["position"] as {
            x: number
            y: number
        }
        expect(pos.x).toBeCloseTo(10)
        expect(pos.y).toBeCloseTo(5)

        world.tick(1.0) // another second
        const pos2 = world.query.byId("ball1")?.traits["position"] as {
            x: number
            y: number
        }
        expect(pos2.x).toBeCloseTo(20)
        expect(pos2.y).toBeCloseTo(10)
    })

    it("multiple ticks accumulate correctly", () => {
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
            systems: [
                defineSystem({
                    name: "counter-increment",
                    requiredTraits: ["counter"],
                    phase: "pre-physics",
                    priority: 0,
                    update(entities): IntentInput[] {
                        return entities.map((e) => {
                            const current = (e.traits["counter"] as { value: number })
                                .value
                            return {
                                type: "trait.update",
                                params: {
                                    entityId: e.id,
                                    traitName: "counter",
                                    data: { value: current + 1 },
                                },
                            }
                        })
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({
            type: "entity.create",
            params: { entityType: "ticker", id: "t1" },
        })
        world.dispatch({
            type: "trait.update",
            params: { entityId: "t1", traitName: "counter", data: { value: 0 } },
        })

        world.tick(0.016)
        world.tick(0.016)
        world.tick(0.016)

        const counter = world.query.byId("t1")?.traits["counter"] as { value: number }
        expect(counter.value).toBe(3)
    })

    it("dt is passed correctly to update function", () => {
        const receivedDts: number[] = []

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
            systems: [
                defineSystem({
                    name: "dt-recorder",
                    requiredTraits: [],
                    phase: "pre-physics",
                    priority: 0,
                    update(_entities, _world, dt) {
                        receivedDts.push(dt)
                        return []
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({ type: "entity.create", params: { entityType: "any", id: "x" } })

        world.tick(0.016)
        world.tick(0.033)
        world.tick(0.1)

        expect(receivedDts).toEqual([0.016, 0.033, 0.1])
    })

    it("system intent prevented by constraint does not crash tick", () => {
        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
            constraints: [
                defineConstraint({
                    name: "no-system-updates",
                    description: "Block all system-source trait updates",
                    priority: 1,
                    scope: "global",
                    effect: "prevent",
                    evaluate(ctx) {
                        if (ctx.trigger.intent.source === "system") {
                            return {
                                valid: false,
                                violations: [
                                    {
                                        constraintName: "no-system-updates",
                                        message:
                                            "System updates blocked by test constraint",
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
            systems: [
                defineSystem({
                    name: "blocked-system",
                    requiredTraits: ["counter"],
                    phase: "physics",
                    priority: 0,
                    update(entities): IntentInput[] {
                        return entities.map((e) => {
                            const v = (e.traits["counter"] as { value: number }).value
                            return {
                                type: "trait.update",
                                params: {
                                    entityId: e.id,
                                    traitName: "counter",
                                    data: { value: v + 1 },
                                },
                            }
                        })
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({
            type: "entity.create",
            params: { entityType: "ticker", id: "t1" },
        })
        world.dispatch({
            type: "trait.update",
            params: { entityId: "t1", traitName: "counter", data: { value: 0 } },
        })

        // Should not throw even though every system intent is prevented
        expect(() => world.tick(0.016)).not.toThrow()

        // Counter should remain 0 — all system updates were blocked
        const counter = world.query.byId("t1")?.traits["counter"] as { value: number }
        expect(counter.value).toBe(0)
    })
})

// ── SystemWorldView ──────────────────────────────────────────────

describe("SystemWorldView in update", () => {
    it("provides query access to world state", () => {
        let queriedEntities: readonly Entity[] = []

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
            systems: [
                defineSystem({
                    name: "observer",
                    requiredTraits: [],
                    phase: "pre-physics",
                    priority: 0,
                    update(_entities, world) {
                        queriedEntities = world.query.byType("target")
                        return []
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({
            type: "entity.create",
            params: { entityType: "target", id: "t1" },
        })
        world.dispatch({
            type: "entity.create",
            params: { entityType: "target", id: "t2" },
        })
        world.dispatch({
            type: "entity.create",
            params: { entityType: "other", id: "o1" },
        })

        world.tick(0.016)
        expect(queriedEntities).toHaveLength(2)
        expect(queriedEntities.map((e) => e.id).sort()).toEqual(["t1", "t2"])
    })
})

// ── Schema-defined systems auto-registered ───────────────────────

describe("schema-defined systems", () => {
    it("systems in schema are auto-registered and run on tick", () => {
        const ran = vi.fn()

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
            systems: [
                defineSystem({
                    name: "auto-system",
                    requiredTraits: [],
                    phase: "physics",
                    priority: 0,
                    update() {
                        ran()
                        return []
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({ type: "entity.create", params: { entityType: "any", id: "x" } })
        world.tick(0.016)

        expect(ran).toHaveBeenCalledOnce()
    })

    it("world with no systems in schema ticks without error", () => {
        const schema = defineSchema({ name: "test", version: "0.1.0", traits: [] })
        const world = World.create(schema)
        expect(() => world.tick(0.016)).not.toThrow()
    })

    it("multiple schema systems each run", () => {
        const ran = { a: 0, b: 0, c: 0 }

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
            systems: [
                defineSystem({
                    name: "sys-a",
                    requiredTraits: [],
                    phase: "pre-physics",
                    priority: 0,
                    update() {
                        ran.a++
                        return []
                    },
                }),
                defineSystem({
                    name: "sys-b",
                    requiredTraits: [],
                    phase: "physics",
                    priority: 0,
                    update() {
                        ran.b++
                        return []
                    },
                }),
                defineSystem({
                    name: "sys-c",
                    requiredTraits: [],
                    phase: "render-prep",
                    priority: 0,
                    update() {
                        ran.c++
                        return []
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({ type: "entity.create", params: { entityType: "any", id: "x" } })
        world.tick(0.016)

        expect(ran.a).toBe(1)
        expect(ran.b).toBe(1)
        expect(ran.c).toBe(1)
    })
})

// ── Throwing system does not crash tick loop ─────────────────────

describe("error isolation", () => {
    it("system that throws does not crash the tick or other systems", () => {
        const goodRan = vi.fn()

        const schema = defineSchema({
            name: "test",
            version: "0.1.0",
            traits: [velocityTrait, positionTrait, healthTrait, counterTrait],
            systems: [
                defineSystem({
                    name: "bad-system",
                    requiredTraits: [],
                    phase: "pre-physics",
                    priority: 100,
                    update() {
                        throw new Error("intentional system error")
                    },
                }),
                defineSystem({
                    name: "good-system",
                    requiredTraits: [],
                    phase: "pre-physics",
                    priority: 1,
                    update() {
                        goodRan()
                        return []
                    },
                }),
            ],
        })

        const world = World.create(schema)
        world.dispatch({ type: "entity.create", params: { entityType: "any", id: "x" } })

        // Should not throw despite bad-system throwing
        expect(() => world.tick(0.016)).not.toThrow()

        // good-system still ran
        expect(goodRan).toHaveBeenCalledOnce()
    })
})
