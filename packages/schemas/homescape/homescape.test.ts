/**
 * Homescape Integration Tests — Phase 4b
 *
 * Exercises the FULL engine stack (Entity, Trait, Constraint, Intent, World,
 * Schema, Agent) against the Homescape domain schema. If these pass,
 * the engine kernel is proven for real-world domain complexity.
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
    World,
    generateToolDefinitions,
    executeAgentTool,
    generateGlossary,
} from "@bix/engine"
import homescapeSchema from "./index.js"
import type { DimensionalData, StructuralData } from "./traits.js"

// ── Helpers ──────────────────────────────────────────────────────

/** Create a wall with dimensional and structural traits in one call. */
function createWall(
    world: World,
    id: string,
    opts: {
        length?: number
        height?: number
        loadBearing?: boolean
        parent?: string
    } = {},
) {
    world.dispatch({
        type: "entity.create",
        params: {
            entityType: "wall",
            id,
            parent: opts.parent,
            traits: {
                dimensional: {
                    width: 0.15,
                    height: opts.height ?? 2.4,
                    length: opts.length ?? 3.0,
                },
                structural: {
                    loadBearing: opts.loadBearing ?? false,
                    material: "wood",
                    thickness: 0.15,
                },
            },
        },
    })
}

/** Create a door as a child of the given wall. */
function createDoor(world: World, id: string, parentWallId: string, width = 0.9) {
    world.dispatch({
        type: "entity.create",
        params: {
            entityType: "door",
            id,
            parent: parentWallId,
            traits: {
                dimensional: { width, height: 2.1, length: 0.05 },
            },
        },
    })
}

/** Create a roof with optional structural traits. */
function createRoof(world: World, id: string, parent?: string) {
    world.dispatch({
        type: "entity.create",
        params: {
            entityType: "roof",
            id,
            parent,
            traits: {
                dimensional: { width: 5.0, height: 0.3, length: 6.0 },
                structural: {
                    loadBearing: false,
                    material: "wood",
                    thickness: 0.2,
                },
            },
        },
    })
}

// ── 4b-1. World creation ──────────────────────────────────────────

describe("World creation", () => {
    it("creates World from homescape schema without error", () => {
        const world = World.create(homescapeSchema)
        expect(world.schema.name).toBe("homescape")
        expect(world.schema.version).toBe("0.1.0")
    })

    it("schema declares all 6 entity types", () => {
        const types = homescapeSchema.entityTypes?.map((e) => e.type) ?? []
        expect(types).toContain("wall")
        expect(types).toContain("door")
        expect(types).toContain("window")
        expect(types).toContain("floor")
        expect(types).toContain("roof")
        expect(types).toContain("pillar")
    })

    it("schema declares both domain traits", () => {
        const names = homescapeSchema.traits.map((t) => t.name)
        expect(names).toContain("structural")
        expect(names).toContain("dimensional")
    })

    it("schema declares all 6 constraints", () => {
        const names = homescapeSchema.constraints?.map((c) => c.name) ?? []
        expect(names).toContain("door-requires-wall")
        expect(names).toContain("window-requires-wall")
        expect(names).toContain("wall-min-length")
        expect(names).toContain("door-fits-in-wall")
        expect(names).toContain("load-bearing-deletion-blocked")
        expect(names).toContain("roof-needs-support")
    })

    it("Gap 1: entity type defaults auto-apply on entity.create", () => {
        const world = World.create(homescapeSchema)

        // Create a wall with NO explicit trait data
        world.dispatch({
            type: "entity.create",
            params: { entityType: "wall", id: "w1" },
        })

        const wall = world.query.byId("w1")!

        // dimensional should be auto-attached from Wall.defaults
        const dim = wall.traits["dimensional"] as DimensionalData
        expect(dim).toBeDefined()
        expect(dim.height).toBe(2.4) // Wall entity type default
        expect(dim.length).toBe(3.0) // Wall entity type default
        expect(dim.width).toBe(0.15) // Wall entity type default

        // structural should be auto-attached from Wall.defaults
        const structural = wall.traits["structural"] as StructuralData
        expect(structural).toBeDefined()
        expect(structural.loadBearing).toBe(false) // Wall entity type default
        expect(structural.material).toBe("wood") // Wall entity type default

        // built-in traits (spatial, renderable, etc.) auto-attached too
        expect("spatial" in wall.traits).toBe(true)
        expect("renderable" in wall.traits).toBe(true)
    })

    it("Gap 1: explicit traits override entity type defaults", () => {
        const world = World.create(homescapeSchema)

        world.dispatch({
            type: "entity.create",
            params: {
                entityType: "wall",
                id: "w1",
                traits: {
                    dimensional: { width: 0.3, height: 3.0, length: 5.0 },
                    structural: { loadBearing: true, material: "steel", thickness: 0.3 },
                },
            },
        })

        const wall = world.query.byId("w1")!
        const dim = wall.traits["dimensional"] as DimensionalData
        expect(dim.length).toBe(5.0) // explicit override
        expect(dim.height).toBe(3.0) // explicit override

        const structural = wall.traits["structural"] as StructuralData
        expect(structural.loadBearing).toBe(true) // explicit override
        expect(structural.material).toBe("steel") // explicit override
    })

    it("Gap 1: door auto-gets dimensional defaults allowing constraint checks at creation", () => {
        const world = World.create(homescapeSchema)
        createWall(world, "wall1", { length: 3.0 })

        // Create door with no explicit dimensional — auto-defaults apply
        // Door default: { width: 0.9, height: 2.1, length: 0.05 }
        // Wall length is 3.0m, door auto-default width 0.9m — fits, no constraint violation
        const result = world.dispatch({
            type: "entity.create",
            params: { entityType: "door", id: "d1", parent: "wall1" },
        })
        expect(result.prevented).toBeUndefined()

        const door = world.query.byId("d1")!
        const dim = door.traits["dimensional"] as DimensionalData
        expect(dim.width).toBe(0.9) // Door entity type default
    })

    it("Gap 1: wall-min-length fires on entity.create with short length (now that defaults apply)", () => {
        const world = World.create(homescapeSchema)

        const result = world.dispatch({
            type: "entity.create",
            params: {
                entityType: "wall",
                id: "w1",
                traits: { dimensional: { width: 0.15, height: 2.4, length: 0.3 } },
            },
        })

        expect(result.prevented).toBe(true)
        expect(result.violations?.[0]?.constraintName).toBe("wall-min-length")
        expect(world.query.byId("w1")).toBeUndefined()
    })

    it("Gap 2: ctx.world.getTrait/getParent/getChildren work in constraints", () => {
        // Verify load-bearing-deletion-blocked uses ctx.world correctly
        const world = World.create(homescapeSchema)
        createWall(world, "load-wall", { loadBearing: true })
        createRoof(world, "the-roof", "load-wall")

        const result = world.dispatch({
            type: "entity.delete",
            params: { id: "load-wall" },
        })
        // Constraint used ctx.world.getTrait to read loadBearing,
        // and ctx.world.getChildren to find the dependent roof
        expect(result.prevented).toBe(true)
        expect(result.violations?.[0]?.entityIds).toContain("the-roof")
    })

    it("Gap 4: schema.palette.categories are defined", () => {
        expect(homescapeSchema.palette?.categories).toHaveLength(3)
        const names = homescapeSchema.palette!.categories.map((c) => c.name)
        expect(names).toContain("Structure")
        expect(names).toContain("Openings")
        expect(names).toContain("Roof")

        const structure = homescapeSchema.palette!.categories.find(
            (c) => c.name === "Structure",
        )!
        expect(structure.types).toContain("wall")
        expect(structure.types).toContain("pillar")
        expect(structure.types).toContain("floor")
    })

    it("Gap 4: schema.viewports are defined", () => {
        expect(homescapeSchema.viewports).toHaveLength(2)
        const types = homescapeSchema.viewports!.map((v) => v.type)
        expect(types).toContain("3d")
        expect(types).toContain("2d")
    })

    it("can create each entity type via dispatch", () => {
        const world = World.create(homescapeSchema)

        const types = ["wall", "door", "window", "floor", "roof", "pillar"]
        for (const entityType of types) {
            // Most entity types can be created without parent constraints
            // (door/window need a wall parent, tested in constraint section)
            if (entityType === "door" || entityType === "window") continue

            world.dispatch({
                type: "entity.create",
                params: { entityType, id: `${entityType}-1` },
            })
            expect(world.query.byId(`${entityType}-1`)?.type).toBe(entityType)
        }

        expect(world.query.count).toBe(4) // wall, floor, roof, pillar
    })

    it("structural trait validates material enum", () => {
        const world = World.create(homescapeSchema)
        world.dispatch({
            type: "entity.create",
            params: { entityType: "wall", id: "w1" },
        })

        // Valid material
        expect(() =>
            world.dispatch({
                type: "trait.update",
                params: {
                    entityId: "w1",
                    traitName: "structural",
                    data: { loadBearing: true, material: "concrete", thickness: 0.3 },
                },
            }),
        ).not.toThrow()

        // Invalid material
        expect(() =>
            world.dispatch({
                type: "trait.update",
                params: {
                    entityId: "w1",
                    traitName: "structural",
                    data: { loadBearing: false, material: "glass", thickness: 0.1 },
                },
            }),
        ).toThrow()
    })
})

// ── 4b-2. Constraint: door/window placement ───────────────────────

describe("constraint: door-requires-wall", () => {
    let world: World

    beforeEach(() => {
        world = World.create(homescapeSchema)
    })

    it("blocks door creation without a parent", () => {
        const result = world.dispatch({
            type: "entity.create",
            params: { entityType: "door", id: "door1" },
        })

        expect(result.prevented).toBe(true)
        expect(result.violations?.[0]?.constraintName).toBe("door-requires-wall")
        expect(world.query.byId("door1")).toBeUndefined()
    })

    it("blocks door parented to a non-wall entity", () => {
        world.dispatch({
            type: "entity.create",
            params: { entityType: "floor", id: "floor1" },
        })

        const result = world.dispatch({
            type: "entity.create",
            params: { entityType: "door", id: "door1", parent: "floor1" },
        })

        expect(result.prevented).toBe(true)
        expect(result.violations?.[0]?.message).toContain("floor")
        expect(world.query.byId("door1")).toBeUndefined()
    })

    it("allows door parented to a wall", () => {
        createWall(world, "wall1")
        createDoor(world, "door1", "wall1")

        const door = world.query.byId("door1")
        expect(door).toBeDefined()
        expect(door?.parent).toBe("wall1")
        expect(world.query.byId("wall1")?.children).toContain("door1")
    })

    it("blocks reparenting a door to a non-wall", () => {
        createWall(world, "wall1")
        createDoor(world, "door1", "wall1")
        world.dispatch({
            type: "entity.create",
            params: { entityType: "floor", id: "floor1" },
        })

        const result = world.dispatch({
            type: "entity.reparent",
            params: { entityId: "door1", newParentId: "floor1" },
        })

        expect(result.prevented).toBe(true)
        expect(world.query.byId("door1")?.parent).toBe("wall1")
    })
})

describe("constraint: window-requires-wall", () => {
    let world: World

    beforeEach(() => {
        world = World.create(homescapeSchema)
    })

    it("blocks window creation without a parent", () => {
        const result = world.dispatch({
            type: "entity.create",
            params: { entityType: "window", id: "win1" },
        })
        expect(result.prevented).toBe(true)
        expect(result.violations?.[0]?.constraintName).toBe("window-requires-wall")
    })

    it("allows window parented to a wall", () => {
        createWall(world, "wall1")
        world.dispatch({
            type: "entity.create",
            params: {
                entityType: "window",
                id: "win1",
                parent: "wall1",
                traits: { dimensional: { width: 1.2, height: 1.2, length: 0.05 } },
            },
        })

        expect(world.query.byId("win1")?.parent).toBe("wall1")
    })
})

// ── 4b-3. Constraint: wall-min-length ────────────────────────────

describe("constraint: wall-min-length", () => {
    let world: World

    beforeEach(() => {
        world = World.create(homescapeSchema)
    })

    it("blocks setting wall length below 0.5m", () => {
        createWall(world, "wall1", { length: 3.0 })

        const result = world.dispatch({
            type: "trait.update",
            params: {
                entityId: "wall1",
                traitName: "dimensional",
                data: { width: 0.15, height: 2.4, length: 0.3 },
            },
        })

        expect(result.prevented).toBe(true)
        expect(result.violations?.[0]?.constraintName).toBe("wall-min-length")
        expect(result.violations?.[0]?.message).toContain("0.3m")

        // Trait unchanged — wall still has original length
        const dim = world.query.byId("wall1")?.traits["dimensional"] as
            | DimensionalData
            | undefined
        expect(dim?.length).toBe(3.0)
    })

    it("allows setting wall length to exactly 0.5m", () => {
        createWall(world, "wall1", { length: 3.0 })

        const result = world.dispatch({
            type: "trait.update",
            params: {
                entityId: "wall1",
                traitName: "dimensional",
                data: { width: 0.15, height: 2.4, length: 0.5 },
            },
        })

        expect(result.prevented).toBeUndefined()
        const dim = world.query.byId("wall1")?.traits["dimensional"] as DimensionalData
        expect(dim.length).toBe(0.5)
    })

    it("does not apply to non-wall entities updating dimensional", () => {
        world.dispatch({
            type: "entity.create",
            params: { entityType: "floor", id: "floor1" },
        })

        // Floors can have any dimensional length
        const result = world.dispatch({
            type: "trait.update",
            params: {
                entityId: "floor1",
                traitName: "dimensional",
                data: { width: 4.0, height: 0.1, length: 0.1 },
            },
        })

        expect(result.prevented).toBeUndefined()
    })
})

// ── 4b-4. Constraint: door-fits-in-wall ──────────────────────────

describe("constraint: door-fits-in-wall", () => {
    let world: World

    beforeEach(() => {
        world = World.create(homescapeSchema)
        createWall(world, "wall1", { length: 2.0 }) // 2m wall
    })

    it("blocks door wider than its parent wall on creation", () => {
        const result = world.dispatch({
            type: "entity.create",
            params: {
                entityType: "door",
                id: "door1",
                parent: "wall1",
                traits: { dimensional: { width: 2.5, height: 2.1, length: 0.05 } },
            },
        })

        expect(result.prevented).toBe(true)
        expect(result.violations?.[0]?.constraintName).toBe("door-fits-in-wall")
        expect(result.violations?.[0]?.message).toContain("2.5m")
        expect(result.violations?.[0]?.message).toContain("2m")
    })

    it("allows door narrower than its parent wall", () => {
        const result = world.dispatch({
            type: "entity.create",
            params: {
                entityType: "door",
                id: "door1",
                parent: "wall1",
                traits: { dimensional: { width: 0.9, height: 2.1, length: 0.05 } },
            },
        })

        expect(result.prevented).toBeUndefined()
        expect(world.query.byId("door1")).toBeDefined()
    })

    it("blocks door width update that would exceed wall length", () => {
        createDoor(world, "door1", "wall1", 0.9)

        const result = world.dispatch({
            type: "trait.update",
            params: {
                entityId: "door1",
                traitName: "dimensional",
                data: { width: 2.5, height: 2.1, length: 0.05 },
            },
        })

        expect(result.prevented).toBe(true)
        expect(result.violations?.[0]?.constraintName).toBe("door-fits-in-wall")
    })
})

// ── 4b-5. Constraint: load-bearing-deletion-blocked ───────────────

describe("constraint: load-bearing-deletion-blocked", () => {
    let world: World

    beforeEach(() => {
        world = World.create(homescapeSchema)
    })

    it("blocks deletion of load-bearing wall with roof child", () => {
        createWall(world, "wall1", { loadBearing: true })
        createRoof(world, "roof1", "wall1") // roof is child of wall

        const result = world.dispatch({
            type: "entity.delete",
            params: { id: "wall1" },
        })

        expect(result.prevented).toBe(true)
        expect(result.violations?.[0]?.constraintName).toBe(
            "load-bearing-deletion-blocked",
        )
        expect(result.violations?.[0]?.message).toContain("roof1")
        expect(world.query.byId("wall1")).toBeDefined()
        expect(world.query.byId("roof1")).toBeDefined()
    })

    it("blocks deletion of load-bearing wall with floor child", () => {
        createWall(world, "wall1", { loadBearing: true })
        world.dispatch({
            type: "entity.create",
            params: {
                entityType: "floor",
                id: "floor1",
                parent: "wall1",
                traits: { dimensional: { width: 4.0, height: 0.1, length: 5.0 } },
            },
        })

        const result = world.dispatch({
            type: "entity.delete",
            params: { id: "wall1" },
        })

        expect(result.prevented).toBe(true)
        expect(world.query.byId("wall1")).toBeDefined()
    })

    it("allows deletion of load-bearing wall with NO dependents", () => {
        createWall(world, "wall1", { loadBearing: true })
        // No roof or floor children

        const result = world.dispatch({
            type: "entity.delete",
            params: { id: "wall1" },
        })

        expect(result.prevented).toBeUndefined()
        expect(world.query.byId("wall1")).toBeUndefined()
    })

    it("allows deletion of NON-load-bearing wall even with roof child", () => {
        createWall(world, "wall1", { loadBearing: false })
        createRoof(world, "roof1", "wall1")

        const result = world.dispatch({
            type: "entity.delete",
            params: { id: "wall1" },
        })

        // Not load-bearing → no constraint fires
        expect(result.prevented).toBeUndefined()
        // Cascade delete removes wall and roof
        expect(world.query.byId("wall1")).toBeUndefined()
        expect(world.query.byId("roof1")).toBeUndefined()
    })
})

// ── 4b-6. Constraint: roof-needs-support (warn) ───────────────────

describe("constraint: roof-needs-support", () => {
    let world: World

    beforeEach(() => {
        world = World.create(homescapeSchema)
    })

    it("warns when roof exists with no wall connections on next operation", () => {
        // First: create a roof without walls — no warning yet (pre-execution gap)
        createRoof(world, "roof1")
        // roof1 has no walls

        // Now trigger an operation that fires the roof-needs-support constraint
        // The constraint will find existing roof1 and warn
        world.dispatch({
            type: "entity.create",
            params: { entityType: "pillar", id: "pillar1" },
        })
        // After this dispatch the roof constraint evaluated — roof1 has no walls
        // Verify by checking: next dispatch returns violations

        const result = world.dispatch({
            type: "entity.create",
            params: { entityType: "floor", id: "floor1" },
        })

        // roof1 still has no walls — warn fires
        expect(
            result.violations?.some((v) => v.constraintName === "roof-needs-support"),
        ).toBe(true)
        expect(
            result.violations?.find((v) => v.constraintName === "roof-needs-support")
                ?.effect,
        ).toBe("warn")
        // But the operation was NOT prevented
        expect(result.prevented).toBeUndefined()
        expect(world.query.byId("floor1")).toBeDefined()
    })

    it("does not warn when roof has wall children", () => {
        createRoof(world, "roof1")
        createWall(world, "wall1", { parent: "roof1" })

        // Roof has wall1 as child — warning should NOT fire
        const result = world.dispatch({
            type: "entity.create",
            params: { entityType: "pillar", id: "pillar1" },
        })

        expect(
            result.violations?.some((v) => v.constraintName === "roof-needs-support"),
        ).toBe(false)
    })

    it("does not warn when roof has wall as parent", () => {
        createWall(world, "wall1")
        createRoof(world, "roof1", "wall1") // roof is child of wall

        // roof1's parent is wall1 — warning should NOT fire
        const result = world.dispatch({
            type: "entity.create",
            params: { entityType: "pillar", id: "pillar1" },
        })

        expect(
            result.violations?.some((v) => v.constraintName === "roof-needs-support"),
        ).toBe(false)
    })

    it("roof-needs-support is a warn, not prevent — roof creation is not blocked", () => {
        createRoof(world, "roof1")
        // Roof was created — it exists even though it has no walls
        expect(world.query.byId("roof1")).toBeDefined()
    })
})

// ── 4b-7. Agent tools ─────────────────────────────────────────────

describe("agent tools", () => {
    it("generateToolDefinitions includes all entity type create tools", () => {
        const tools = generateToolDefinitions(homescapeSchema)
        const names = tools.map((t) => t.name)

        expect(names).toContain("create_wall")
        expect(names).toContain("create_door")
        expect(names).toContain("create_window")
        expect(names).toContain("create_floor")
        expect(names).toContain("create_roof")
        expect(names).toContain("create_pillar")
    })

    it("create_wall tool has structural and dimensional parameters", () => {
        const tools = generateToolDefinitions(homescapeSchema)
        const createWallTool = tools.find((t) => t.name === "create_wall")!
        expect(createWallTool.parameters.properties["structural"]).toBeDefined()
        expect(createWallTool.parameters.properties["dimensional"]).toBeDefined()
        expect(createWallTool.parameters.properties["position"]).toBeDefined()
    })

    it("create_wall structural param includes loadBearing and material enum", () => {
        const tools = generateToolDefinitions(homescapeSchema)
        const createWallTool = tools.find((t) => t.name === "create_wall")!
        const structuralParam = createWallTool.parameters.properties["structural"]
        expect(structuralParam?.properties?.["material"]?.enum).toContain("wood")
        expect(structuralParam?.properties?.["material"]?.enum).toContain("steel")
        expect(structuralParam?.properties?.["loadBearing"]?.type).toBe("boolean")
    })

    it("executeAgentTool builds a simple 4-wall room with door and roof", () => {
        const world = World.create(homescapeSchema)

        // Build north wall
        const r1 = executeAgentTool(world, homescapeSchema, "create_wall", {
            id: "north",
            position: { x: 0, y: 0, z: -2.5 },
            dimensional: { width: 0.15, height: 2.4, length: 5.0 },
            structural: { loadBearing: true, material: "wood", thickness: 0.15 },
        })
        expect(r1.success).toBe(true)
        expect(r1.data).toMatchObject({ entityId: "north" })

        // Build south wall
        const r2 = executeAgentTool(world, homescapeSchema, "create_wall", {
            id: "south",
            position: { x: 0, y: 0, z: 2.5 },
            dimensional: { width: 0.15, height: 2.4, length: 5.0 },
            structural: { loadBearing: true, material: "wood", thickness: 0.15 },
        })
        expect(r2.success).toBe(true)

        // Build east wall
        executeAgentTool(world, homescapeSchema, "create_wall", {
            id: "east",
            position: { x: 2.5, y: 0, z: 0 },
            dimensional: { width: 0.15, height: 2.4, length: 5.0 },
            structural: { loadBearing: false, material: "wood", thickness: 0.15 },
        })

        // Build west wall
        executeAgentTool(world, homescapeSchema, "create_wall", {
            id: "west",
            position: { x: -2.5, y: 0, z: 0 },
            dimensional: { width: 0.15, height: 2.4, length: 5.0 },
            structural: { loadBearing: false, material: "wood", thickness: 0.15 },
        })

        // Place door in south wall
        const doorResult = executeAgentTool(world, homescapeSchema, "create_door", {
            id: "front-door",
            parent: "south",
            dimensional: { width: 0.9, height: 2.1, length: 0.05 },
        })
        expect(doorResult.success).toBe(true)
        expect(world.query.byId("front-door")?.parent).toBe("south")

        // Add roof on north wall (load-bearing)
        const roofResult = executeAgentTool(world, homescapeSchema, "create_roof", {
            id: "main-roof",
            parent: "north",
            dimensional: { width: 5.0, height: 0.3, length: 6.0 },
            structural: { loadBearing: false, material: "wood", thickness: 0.2 },
        })
        expect(roofResult.success).toBe(true)

        // Verify the full scene
        expect(world.query.count).toBe(6) // 4 walls + door + roof
        expect(world.query.byType("wall")).toHaveLength(4)
        expect(world.query.byType("door")).toHaveLength(1)
        expect(world.query.byType("roof")).toHaveLength(1)
    })

    it("agent tool create_door is blocked by constraint without parent", () => {
        const world = World.create(homescapeSchema)

        const result = executeAgentTool(world, homescapeSchema, "create_door", {
            id: "orphan-door",
            dimensional: { width: 0.9, height: 2.1, length: 0.05 },
        })

        expect(result.success).toBe(false)
        expect(result.prevented).toBe(true)
        expect(result.error).toContain("door")
    })

    it("agent undo/redo works through the tool interface", () => {
        const world = World.create(homescapeSchema)
        executeAgentTool(world, homescapeSchema, "create_wall", { id: "w1" })
        expect(world.query.count).toBe(1)

        const undoResult = executeAgentTool(world, homescapeSchema, "undo", {})
        expect((undoResult.data as { changed: boolean }).changed).toBe(true)
        expect(world.query.count).toBe(0)

        const redoResult = executeAgentTool(world, homescapeSchema, "redo", {})
        expect((redoResult.data as { changed: boolean }).changed).toBe(true)
        expect(world.query.count).toBe(1)
    })
})

// ── 4b-8. Glossary ────────────────────────────────────────────────

describe("generateGlossary", () => {
    it("contains all entity type names and labels", () => {
        const glossary = generateGlossary(homescapeSchema)
        expect(glossary).toContain("wall")
        expect(glossary).toContain("door")
        expect(glossary).toContain("window")
        expect(glossary).toContain("floor")
        expect(glossary).toContain("roof")
        expect(glossary).toContain("pillar")
        expect(glossary).toContain("Wall")
        expect(glossary).toContain("Door")
    })

    it("contains domain trait descriptions", () => {
        const glossary = generateGlossary(homescapeSchema)
        expect(glossary).toContain("structural")
        expect(glossary).toContain("dimensional")
    })

    it("contains all constraint names and descriptions", () => {
        const glossary = generateGlossary(homescapeSchema)
        expect(glossary).toContain("door-requires-wall")
        expect(glossary).toContain("wall-min-length")
        expect(glossary).toContain("load-bearing-deletion-blocked")
        expect(glossary).toContain("roof-needs-support")
        expect(glossary).toContain("load-bearing")
    })

    it("marks roof-needs-support as a warn constraint", () => {
        const glossary = generateGlossary(homescapeSchema)
        expect(glossary).toContain("roof-needs-support")
        expect(glossary).toMatch(/roof-needs-support.*warn|warn.*roof-needs-support/s)
    })

    it("contains all available agent actions", () => {
        const glossary = generateGlossary(homescapeSchema)
        expect(glossary).toContain("create_wall")
        expect(glossary).toContain("delete_entity")
        expect(glossary).toContain("update_trait")
    })
})

// ── 4b-9. Serialize / Deserialize ────────────────────────────────

describe("serialize / deserialize", () => {
    it("round-trip preserves all entities, traits, and hierarchy", () => {
        const world = World.create(homescapeSchema)

        // Build a scene
        createWall(world, "wall-n", { loadBearing: true, length: 4.0 })
        createWall(world, "wall-s", { length: 4.0 })
        createDoor(world, "door1", "wall-s", 0.9)
        createRoof(world, "roof1", "wall-n")

        const snap = world.serialize()
        expect(snap.schemaName).toBe("homescape")

        const restored = World.deserialize(snap, homescapeSchema)

        // All entities present
        expect(restored.query.count).toBe(4)
        expect(restored.query.byId("wall-n")).toBeDefined()
        expect(restored.query.byId("door1")).toBeDefined()
        expect(restored.query.byId("roof1")).toBeDefined()

        // Trait data preserved
        const wallDim = restored.query.byId("wall-n")?.traits["dimensional"] as
            | DimensionalData
            | undefined
        expect(wallDim?.length).toBe(4.0)

        const wallStructural = restored.query.byId("wall-n")?.traits["structural"] as
            | StructuralData
            | undefined
        expect(wallStructural?.loadBearing).toBe(true)

        // Parent/child hierarchy preserved
        expect(restored.query.byId("door1")?.parent).toBe("wall-s")
        expect(restored.query.byId("wall-s")?.children).toContain("door1")
        expect(restored.query.byId("roof1")?.parent).toBe("wall-n")
    })

    it("deserialized world enforces constraints (constraints still active)", () => {
        const world = World.create(homescapeSchema)
        createWall(world, "wall1")

        const restored = World.deserialize(world.serialize(), homescapeSchema)

        // door-requires-wall still active
        const blocked = restored.dispatch({
            type: "entity.create",
            params: { entityType: "door", id: "orphan" },
        })
        expect(blocked.prevented).toBe(true)
        expect(restored.query.count).toBe(1) // only wall1
    })

    it("snapshot is JSON-serializable", () => {
        const world = World.create(homescapeSchema)
        createWall(world, "w1", { loadBearing: true, length: 3.0 })
        createDoor(world, "d1", "w1")

        const snap = world.serialize()
        expect(() => JSON.stringify(snap)).not.toThrow()
        expect(JSON.parse(JSON.stringify(snap))).toEqual(snap)
    })

    it("deserialized world has empty undo history", () => {
        const world = World.create(homescapeSchema)
        createWall(world, "w1")

        const restored = World.deserialize(world.serialize(), homescapeSchema)
        expect(restored.canUndo).toBe(false)
        expect(restored.canRedo).toBe(false)
    })
})

// ── 4b-10. Undo / Redo ────────────────────────────────────────────

describe("undo / redo", () => {
    let world: World

    beforeEach(() => {
        world = World.create(homescapeSchema)
    })

    it("undo reverses wall creation", () => {
        createWall(world, "w1")
        expect(world.query.count).toBe(1)

        world.undo()
        expect(world.query.count).toBe(0)
    })

    it("redo reapplies after undo", () => {
        createWall(world, "w1")
        world.undo()
        world.redo()
        expect(world.query.byId("w1")?.type).toBe("wall")
    })

    it("undo restores prevented-safe state after multiple operations", () => {
        createWall(world, "w1", { loadBearing: true })
        createRoof(world, "roof1", "w1")

        expect(world.query.count).toBe(2)

        // Attempt to delete load-bearing wall → blocked
        const blocked = world.dispatch({
            type: "entity.delete",
            params: { id: "w1" },
        })
        expect(blocked.prevented).toBe(true)
        expect(world.query.count).toBe(2) // nothing changed

        // Undo roof creation — now wall has no dependents
        world.undo() // undo roof create
        expect(world.query.byId("roof1")).toBeUndefined()

        // Now wall can be deleted
        const ok = world.dispatch({ type: "entity.delete", params: { id: "w1" } })
        expect(ok.prevented).toBeUndefined()
        expect(world.query.count).toBe(0)
    })

    it("multi-step undo/redo preserves entity type and trait integrity", () => {
        createWall(world, "w1", { length: 3.0, loadBearing: true })
        createDoor(world, "d1", "w1", 0.9)

        // Trait update
        world.dispatch({
            type: "trait.update",
            params: {
                entityId: "w1",
                traitName: "structural",
                data: { loadBearing: false, material: "concrete", thickness: 0.3 },
            },
        })

        let structural = world.query.byId("w1")?.traits["structural"] as StructuralData
        expect(structural.loadBearing).toBe(false)
        expect(structural.material).toBe("concrete")

        // Undo trait update
        world.undo()
        structural = world.query.byId("w1")?.traits["structural"] as StructuralData
        expect(structural.loadBearing).toBe(true) // restored

        // Undo door creation
        world.undo()
        expect(world.query.byId("d1")).toBeUndefined()
        expect(world.query.byId("w1")?.children).not.toContain("d1")

        // Redo door creation
        world.redo()
        expect(world.query.byId("d1")?.parent).toBe("w1")

        // Redo trait update
        world.redo()
        structural = world.query.byId("w1")?.traits["structural"] as StructuralData
        expect(structural.material).toBe("concrete")
    })
})
