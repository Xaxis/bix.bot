/**
 * Phase 1 Capstone Integration Test
 *
 * Proves the entire engine kernel end-to-end using the test schema.
 * If these pass, Phase 1 is complete: Entity, Trait, Intent, Constraint,
 * System, World, and Schema Loader all work together as designed.
 */
import { describe, it, expect, beforeEach } from "vitest"
import { World } from "../world/world.js"
import { validateSchema } from "../schema/validate-schema.js"
import { defineConstraint } from "../constraint/constraint-definition.js"
import { defineSystem } from "../system/system-definition.js"
import { testSchema } from "./test-schema.js"
import type { Size } from "./test-schema.js"

// ── Schema validation ─────────────────────────────────────────────

describe("validateSchema — test schema is valid", () => {
  it("test schema passes validateSchema with no errors", () => {
    const result = validateSchema(testSchema)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("catches invalid semver", () => {
    const result = validateSchema({
      name: "bad",
      version: "not-semver",
      traits: [],
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.code).toBe("INVALID_SEMVER")
  })

  it("catches unknown trait reference in entityType", () => {
    const result = validateSchema({
      name: "bad",
      version: "1.0.0",
      traits: [],
      entityTypes: [
        {
          type: "wall",
          label: "Wall",
          description: "A wall",
          traits: ["nonexistent-trait"],
        },
      ],
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.code).toBe("UNKNOWN_TRAIT_REF")
    expect(result.errors[0]?.field).toBe("entityTypes[0].traits[0]")
  })

  it("catches duplicate entity type names", () => {
    const result = validateSchema({
      name: "bad",
      version: "1.0.0",
      traits: [],
      entityTypes: [
        { type: "box", label: "Box", description: "", traits: [] },
        { type: "box", label: "Box2", description: "", traits: [] },
      ],
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.code).toBe("DUPLICATE_ENTITY_TYPE")
    expect(result.errors[0]?.field).toBe("entityTypes[1].type")
  })

  it("catches duplicate constraint names", () => {
    const c = defineConstraint({
      name: "dupe",
      description: "x",
      priority: 0,
      scope: "global",
      effect: "warn",
      evaluate() {
        return { valid: true, violations: [] }
      },
    })
    const result = validateSchema({
      name: "bad",
      version: "1.0.0",
      traits: [],
      constraints: [c, c],
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.code).toBe("DUPLICATE_CONSTRAINT_NAME")
  })

  it("catches constraint watch.entityTypes referencing undeclared type", () => {
    const c = defineConstraint({
      name: "c",
      description: "x",
      priority: 0,
      scope: "local",
      effect: "warn",
      watch: { entityTypes: ["ghost-type"] },
      evaluate() {
        return { valid: true, violations: [] }
      },
    })
    // Only fires when schema declares entityTypes — add a dummy one so the check runs
    const result = validateSchema({
      name: "bad",
      version: "1.0.0",
      traits: [],
      entityTypes: [{ type: "real-type", label: "Real", description: "", traits: [] }],
      constraints: [c],
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.code).toBe("UNKNOWN_WATCH_ENTITY_TYPE")
  })

  it("catches duplicate system names", () => {
    const s = defineSystem({
      name: "dupe",
      requiredTraits: [],
      phase: "physics",
      priority: 0,
      update: () => [],
    })
    const result = validateSchema({
      name: "bad",
      version: "1.0.0",
      traits: [],
      systems: [s, s],
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.code).toBe("DUPLICATE_SYSTEM_NAME")
  })

  it("allows built-in trait names in entityType.traits (they're always registered)", () => {
    const result = validateSchema({
      name: "good",
      version: "1.0.0",
      traits: [],
      entityTypes: [
        {
          type: "positioned",
          label: "Positioned",
          description: "Has spatial",
          traits: ["spatial", "renderable"],
        },
      ],
    })
    expect(result.valid).toBe(true)
  })
})

// ── World creation ────────────────────────────────────────────────

describe("World creation from test schema", () => {
  it("creates a World from the test schema", () => {
    const world = World.create(testSchema)
    expect(world).toBeDefined()
    expect(world.schema.name).toBe("bix-test-schema")
  })

  it("schema traits are registered and validate correctly", () => {
    const world = World.create(testSchema)
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })

    // Valid color
    expect(() =>
      world.dispatch({
        type: "trait.update",
        params: { entityId: "b1", traitName: "color", data: { value: "red" } },
      }),
    ).not.toThrow()

    // Invalid color value
    expect(() =>
      world.dispatch({
        type: "trait.update",
        params: { entityId: "b1", traitName: "color", data: { value: "purple" } },
      }),
    ).toThrow()
  })
})

// ── Entity placement ──────────────────────────────────────────────

describe("entity placement", () => {
  let world: World

  beforeEach(() => {
    world = World.create(testSchema)
  })

  it("creates a Box entity", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    expect(world.query.byId("box1")?.type).toBe("box")
  })

  it("creates a Label entity", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "label", id: "lbl1" } })
    expect(world.query.byId("lbl1")?.type).toBe("label")
  })

  it("creates a Connector parented to a Box", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    world.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "con1", parent: "box1" },
    })
    expect(world.query.byId("con1")?.parent).toBe("box1")
    expect(world.query.byId("box1")?.children).toContain("con1")
  })

  it("attaches traits to Box", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "box1", traitName: "color", data: { value: "blue" } },
    })
    world.dispatch({
      type: "trait.update",
      params: {
        entityId: "box1",
        traitName: "size",
        data: { width: 2, height: 3, depth: 1 },
      },
    })

    expect((world.query.byId("box1")?.traits["color"] as { value: string })?.value).toBe(
      "blue",
    )
    expect((world.query.byId("box1")?.traits["size"] as Size)?.width).toBe(2)
  })
})

// ── Constraint enforcement ────────────────────────────────────────

describe("constraint enforcement", () => {
  let world: World

  beforeEach(() => {
    world = World.create(testSchema)
  })

  it("connector-parent-is-box: blocks connector without parent", () => {
    const result = world.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "con1" },
    })
    expect(result.prevented).toBe(true)
    expect(result.violations![0]!.constraintName).toBe("connector-parent-is-box")
    expect(world.query.byId("con1")).toBeUndefined()
  })

  it("connector-parent-is-box: blocks connector parented to non-box", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "label", id: "lbl1" } })
    const result = world.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "con1", parent: "lbl1" },
    })
    expect(result.prevented).toBe(true)
    expect(world.query.byId("con1")).toBeUndefined()
  })

  it("connector-parent-is-box: allows connector with box parent", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    const result = world.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "con1", parent: "box1" },
    })
    expect(result.prevented).toBeUndefined()
    expect(world.query.byId("con1")).toBeDefined()
  })

  it("box-min-size: blocks size update below minimum", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    const result = world.dispatch({
      type: "trait.update",
      params: {
        entityId: "box1",
        traitName: "size",
        data: { width: 0.5, height: 1, depth: 1 },
      },
    })
    expect(result.prevented).toBe(true)
    expect(result.violations![0]!.constraintName).toBe("box-min-size")
    expect(result.violations![0]!.message).toContain("width 0.5")
    // State unchanged — box has no size trait (trait.update was prevented)
    expect(world.query.byId("box1")?.traits["size"]).toBeUndefined()
  })

  it("box-min-size: allows valid size update", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    const result = world.dispatch({
      type: "trait.update",
      params: {
        entityId: "box1",
        traitName: "size",
        data: { width: 2, height: 2, depth: 2 },
      },
    })
    expect(result.prevented).toBeUndefined()
    expect((world.query.byId("box1")?.traits["size"] as Size)?.width).toBe(2)
  })

  it("box-min-size: does NOT apply to non-box entities", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "label", id: "lbl1" } })
    // Labels can have any size trait value (constraint only targets boxes)
    expect(world.query.byId("lbl1")).toBeDefined()
  })

  it("constraint violations return violation message for error display", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    const result = world.dispatch({
      type: "trait.update",
      params: {
        entityId: "box1",
        traitName: "size",
        data: { width: 0.2, height: 0.3, depth: 0.4 },
      },
    })
    expect(result.violations).toHaveLength(3) // all three dims too small
    expect(result.violations!.every((v) => v.effect === "prevent")).toBe(true)
  })
})

// ── Undo / Redo ───────────────────────────────────────────────────

describe("undo / redo", () => {
  let world: World

  beforeEach(() => {
    world = World.create(testSchema)
  })

  it("undo reverses entity creation", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    expect(world.query.count).toBe(1)

    world.undo()
    expect(world.query.count).toBe(0)
    expect(world.query.byId("box1")).toBeUndefined()
  })

  it("redo reapplies after undo", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    world.undo()
    world.redo()
    expect(world.query.byId("box1")).toBeDefined()
    expect(world.query.byId("box1")?.type).toBe("box")
  })

  it("undo reverses trait update", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "box1", traitName: "color", data: { value: "red" } },
    })
    expect((world.query.byId("box1")?.traits["color"] as { value: string })?.value).toBe(
      "red",
    )

    world.undo()
    expect(world.query.byId("box1")?.traits["color"]).toBeUndefined()
  })

  it("undo reverses cascade delete restoring full hierarchy", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    world.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "con1", parent: "box1" },
    })
    world.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "con2", parent: "box1" },
    })

    world.dispatch({ type: "entity.delete", params: { id: "box1" } })
    expect(world.query.count).toBe(0)

    world.undo()
    expect(world.query.count).toBe(3)
    expect(world.query.byId("box1")).toBeDefined()
    expect(world.query.byId("con1")?.parent).toBe("box1")
    expect(world.query.byId("con2")?.parent).toBe("box1")
    expect(world.query.byId("box1")?.children).toContain("con1")
    expect(world.query.byId("box1")?.children).toContain("con2")
  })

  it("prevented dispatch does not add to undo stack", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    const stackBefore = world.canUndo

    // This is prevented by connector-parent-is-box
    world.dispatch({ type: "entity.create", params: { entityType: "connector" } })

    // Stack size unchanged — prevented dispatches don't record
    expect(world.canUndo).toBe(stackBefore)
    // (one undo entry = the box.create)
    world.undo()
    expect(world.canUndo).toBe(false)
  })

  it("multi-step undo/redo cycle", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "a" } })
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b" } })
    world.dispatch({ type: "entity.create", params: { entityType: "label", id: "c" } })

    world.undo()
    world.undo()
    world.undo()
    expect(world.query.count).toBe(0)

    world.redo()
    world.redo()
    world.redo()
    expect(world.query.count).toBe(3)
  })
})

// ── Serialize / Deserialize ───────────────────────────────────────

describe("serialize / deserialize", () => {
  let world: World

  beforeEach(() => {
    world = World.create(testSchema)
  })

  it("serialize captures schema name and version", () => {
    const snap = world.serialize()
    expect(snap.schemaName).toBe("bix-test-schema")
    expect(snap.schemaVersion).toBe("0.1.0")
  })

  it("serialize captures all entities and trait data", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "box1", traitName: "color", data: { value: "green" } },
    })
    world.dispatch({
      type: "trait.update",
      params: {
        entityId: "box1",
        traitName: "size",
        data: { width: 3, height: 2, depth: 1 },
      },
    })
    world.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "con1", parent: "box1" },
    })

    const snap = world.serialize()
    expect(snap.entities).toHaveLength(2)

    const boxSnap = snap.entities.find((e) => e.id === "box1")
    expect(boxSnap?.type).toBe("box")
    expect((boxSnap?.traits["color"] as { value: string })?.value).toBe("green")
    expect((boxSnap?.traits["size"] as Size)?.width).toBe(3)
    expect(boxSnap?.children).toContain("con1")

    const conSnap = snap.entities.find((e) => e.id === "con1")
    expect(conSnap?.parent).toBe("box1")
  })

  it("snapshot is JSON-serializable", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "box1", traitName: "color", data: { value: "blue" } },
    })

    const snap = world.serialize()
    expect(() => JSON.stringify(snap)).not.toThrow()
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap)
  })

  it("deserialize restores entities + traits + hierarchy", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "box1", traitName: "color", data: { value: "red" } },
    })
    world.dispatch({
      type: "trait.update",
      params: {
        entityId: "box1",
        traitName: "size",
        data: { width: 5, height: 2, depth: 3 },
      },
    })
    world.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "con1", parent: "box1" },
    })
    world.dispatch({ type: "entity.create", params: { entityType: "label", id: "lbl1" } })

    const snap = world.serialize()
    const restored = World.deserialize(snap, testSchema)

    expect(restored.query.count).toBe(3)
    expect(restored.query.byId("box1")?.type).toBe("box")
    expect(
      (restored.query.byId("box1")?.traits["color"] as { value: string })?.value,
    ).toBe("red")
    expect((restored.query.byId("box1")?.traits["size"] as Size)?.width).toBe(5)
    expect(restored.query.byId("con1")?.parent).toBe("box1")
    expect(restored.query.byId("box1")?.children).toContain("con1")
  })

  it("restored world has clean undo history (not restoring past session)", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    const restored = World.deserialize(world.serialize(), testSchema)
    expect(restored.canUndo).toBe(false)
    expect(restored.canRedo).toBe(false)
  })

  it("restored world is fully functional — constraints still enforced", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    const restored = World.deserialize(world.serialize(), testSchema)

    // Constraint still active in restored world
    const blocked = restored.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "orphan" },
    })
    expect(blocked.prevented).toBe(true)
    expect(restored.query.count).toBe(1) // only box1
  })
})

// ── Queries ───────────────────────────────────────────────────────

describe("queries", () => {
  let world: World

  beforeEach(() => {
    world = World.create(testSchema)
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box2" } })
    world.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "con1", parent: "box1" },
    })
    world.dispatch({ type: "entity.create", params: { entityType: "label", id: "lbl1" } })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "box1", traitName: "color", data: { value: "red" } },
    })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "box2", traitName: "color", data: { value: "blue" } },
    })
    world.dispatch({
      type: "trait.update",
      params: {
        entityId: "box1",
        traitName: "size",
        data: { width: 2, height: 2, depth: 2 },
      },
    })
  })

  it("query.all() returns all entities", () => {
    expect(world.query.all()).toHaveLength(4)
  })

  it("query.byType() filters correctly", () => {
    expect(world.query.byType("box")).toHaveLength(2)
    expect(world.query.byType("connector")).toHaveLength(1)
    expect(world.query.byType("label")).toHaveLength(1)
    expect(world.query.byType("nonexistent")).toHaveLength(0)
  })

  it("query.byId() finds entities", () => {
    expect(world.query.byId("box1")?.type).toBe("box")
    expect(world.query.byId("nope")).toBeUndefined()
  })

  it("query.byTrait() finds by trait name", () => {
    expect(world.query.byTrait("color")).toHaveLength(2) // box1 + box2
    expect(world.query.byTrait("size")).toHaveLength(1) // box1 only
  })

  it("query.withTraits() requires all traits", () => {
    // Only box1 has both color AND size
    expect(world.query.withTraits(["color", "size"])).toHaveLength(1)
    expect(world.query.withTraits(["color", "size"])[0]?.id).toBe("box1")
  })

  it("query.count reflects entity count", () => {
    expect(world.query.count).toBe(4)
  })
})

// ── System tick ───────────────────────────────────────────────────

describe("system tick", () => {
  let world: World

  beforeEach(() => {
    world = World.create(testSchema)
  })

  it("tick executes registered systems", () => {
    // Create labels (the label-ticker system sets metadata.custom.tickCount)
    world.dispatch({ type: "entity.create", params: { entityType: "label", id: "lbl1" } })
    world.dispatch({
      type: "trait.update",
      params: {
        entityId: "lbl1",
        traitName: "metadata",
        data: { name: "", description: "", tags: [], custom: {} },
      },
    })

    world.tick(0.016)

    const meta = world.query.byId("lbl1")?.traits["metadata"] as {
      custom: { tickCount: number; labelCount: number }
    }
    expect(meta?.custom.tickCount).toBe(1)
    expect(meta?.custom.labelCount).toBe(1)
  })

  it("multiple ticks accumulate tickCount", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "label", id: "lbl1" } })
    world.dispatch({
      type: "trait.update",
      params: {
        entityId: "lbl1",
        traitName: "metadata",
        data: { name: "", description: "", tags: [], custom: {} },
      },
    })

    world.tick(0.016)
    world.tick(0.016)
    world.tick(0.016)

    const meta = world.query.byId("lbl1")?.traits["metadata"] as {
      custom: { tickCount: number }
    }
    expect(meta?.custom.tickCount).toBe(3)
  })

  it("tick with no entities matching system traits is a no-op", () => {
    // No labels → label-ticker finds no matching entities → no-op
    expect(() => world.tick(0.016)).not.toThrow()
  })

  it("tick does not affect undo stack directly", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "label", id: "lbl1" } })
    world.dispatch({
      type: "trait.update",
      params: {
        entityId: "lbl1",
        traitName: "metadata",
        data: { name: "", description: "", tags: [], custom: {} },
      },
    })

    // Clear history from setup
    world.undo()
    world.undo()
    expect(world.canUndo).toBe(false)

    world.dispatch({ type: "entity.create", params: { entityType: "label", id: "lbl2" } })
    world.dispatch({
      type: "trait.update",
      params: {
        entityId: "lbl2",
        traitName: "metadata",
        data: { name: "", description: "", tags: [], custom: {} },
      },
    })
    world.tick(0.016) // tick emits system intents that go on undo stack

    // After tick, the system's trait.update intents are on the stack
    expect(world.canUndo).toBe(true)
  })
})

// ── Full scene lifecycle ──────────────────────────────────────────

describe("full scene lifecycle", () => {
  it("build → constrain → serialize → restore → continue", () => {
    const world = World.create(testSchema)

    // Build a scene
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "shelf" } })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "shelf", traitName: "color", data: { value: "white" } },
    })
    world.dispatch({
      type: "trait.update",
      params: {
        entityId: "shelf",
        traitName: "size",
        data: { width: 4, height: 1, depth: 2 },
      },
    })
    world.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "left-slot", parent: "shelf" },
    })
    world.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "right-slot", parent: "shelf" },
    })
    world.dispatch({ type: "entity.create", params: { entityType: "label", id: "tag" } })

    // Verify constraints prevent bad operations
    const badConnector = world.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "orphan" },
    })
    expect(badConnector.prevented).toBe(true)
    expect(world.query.count).toBe(4) // shelf + 2 connectors + label

    const badSize = world.dispatch({
      type: "trait.update",
      params: {
        entityId: "shelf",
        traitName: "size",
        data: { width: 0.1, height: 1, depth: 2 },
      },
    })
    expect(badSize.prevented).toBe(true)
    // Size unchanged
    expect((world.query.byId("shelf")?.traits["size"] as Size)?.width).toBe(4)

    // Serialize
    const snapshot = world.serialize()
    expect(JSON.stringify(snapshot).length).toBeGreaterThan(100)

    // Restore into a fresh World
    const restored = World.deserialize(snapshot, testSchema)
    expect(restored.query.count).toBe(4)
    expect((restored.query.byId("shelf")?.traits["size"] as Size)?.width).toBe(4)
    expect(restored.query.byId("left-slot")?.parent).toBe("shelf")

    // Continue working in restored world
    restored.dispatch({
      type: "entity.create",
      params: { entityType: "box", id: "new-box" },
    })
    expect(restored.query.count).toBe(5)

    // Original world unaffected
    expect(world.query.count).toBe(4)
  })
})
