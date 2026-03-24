import { describe, it, expect, beforeEach } from "vitest"
import { z } from "zod"
import { IntentRegistry } from "./intent-registry.js"
import { IntentBus } from "./intent-bus.js"
import {
  BUILT_IN_INTENTS,
  entityCreateIntent,
  entityDeleteIntent,
  traitUpdateIntent,
  traitRemoveIntent,
  entityReparentIntent,
} from "./built-in-intents.js"
import { EntityStore } from "../entity/entity-store.js"
import { TraitRegistry } from "../trait/trait-registry.js"
import { BUILT_IN_TRAITS } from "../trait/built-in-traits.js"
import { defineTrait } from "../trait/trait-definition.js"
import type { IntentHandlerContext } from "./intent.js"

// ── Test helpers ─────────────────────────────────────────────────

function makeContext(store: EntityStore): IntentHandlerContext {
  return { entities: store }
}

function makeBus(
  store: EntityStore,
  extraIntents = false,
): { bus: IntentBus; store: EntityStore } {
  const registry = new IntentRegistry()
  registry.registerAll([...BUILT_IN_INTENTS])
  const bus = new IntentBus(registry, makeContext(store))
  return { bus, store }
}

function makeFullStore(): EntityStore {
  const traits = new TraitRegistry()
  traits.registerAll([...BUILT_IN_TRAITS])
  traits.register(
    defineTrait({
      name: "color",
      schema: z.object({
        r: z.number().min(0).max(255),
        g: z.number().min(0).max(255),
        b: z.number().min(0).max(255),
      }),
      defaults: { r: 128, g: 128, b: 128 },
    }),
  )
  return new EntityStore(traits)
}

// ── IntentRegistry ───────────────────────────────────────────────

describe("IntentRegistry", () => {
  let registry: IntentRegistry

  beforeEach(() => {
    registry = new IntentRegistry()
  })

  it("registers and retrieves a definition", () => {
    registry.register(entityCreateIntent)
    expect(registry.get("entity.create")).toBe(entityCreateIntent)
  })

  it("has() checks registration", () => {
    expect(registry.has("entity.create")).toBe(false)
    registry.register(entityCreateIntent)
    expect(registry.has("entity.create")).toBe(true)
  })

  it("getOrThrow throws for missing type", () => {
    expect(() => registry.getOrThrow("nonexistent")).toThrow(
      'Intent type "nonexistent" is not registered',
    )
  })

  it("rejects duplicate registration", () => {
    registry.register(entityCreateIntent)
    expect(() => registry.register(entityCreateIntent)).toThrow(
      'Intent type "entity.create" is already registered',
    )
  })

  it("registerAll registers multiple definitions", () => {
    registry.registerAll([...BUILT_IN_INTENTS])
    expect(registry.count).toBe(BUILT_IN_INTENTS.length)
  })

  it("getAll returns all definitions", () => {
    registry.registerAll([entityCreateIntent, entityDeleteIntent])
    expect(registry.getAll()).toHaveLength(2)
  })

  it("getTypes returns type strings", () => {
    registry.register(entityCreateIntent)
    expect(registry.getTypes()).toContain("entity.create")
  })
})

// ── IntentBus dispatch ───────────────────────────────────────────

describe("IntentBus dispatch", () => {
  let store: EntityStore
  let bus: IntentBus

  beforeEach(() => {
    store = new EntityStore()
    ;({ bus } = makeBus(store))
  })

  it("dispatches a valid intent and returns result", () => {
    const result = bus.dispatch({
      type: "entity.create",
      params: { entityType: "box", id: "b1" },
    })

    expect(result.intent.type).toBe("entity.create")
    expect(result.intent.id).toBeTruthy()
    expect(result.intent.timestamp).toBeGreaterThan(0)
    expect(result.data?.["entityId"]).toBe("b1")
    expect(store.has("b1")).toBe(true)
  })

  it("assigns source 'user' by default", () => {
    const result = bus.dispatch({
      type: "entity.create",
      params: { entityType: "box" },
    })
    expect(result.intent.source).toBe("user")
  })

  it("respects explicit source", () => {
    const result = bus.dispatch({
      type: "entity.create",
      params: { entityType: "box" },
      source: "agent",
    })
    expect(result.intent.source).toBe("agent")
  })

  it("rejects invalid params", () => {
    expect(() =>
      bus.dispatch({
        type: "entity.create",
        params: { entityType: 42 }, // wrong type
      }),
    ).toThrow("params invalid")
  })

  it("rejects missing required params", () => {
    expect(() =>
      bus.dispatch({
        type: "entity.create",
        params: {}, // missing entityType
      }),
    ).toThrow("params invalid")
  })

  it("rejects unregistered intent type", () => {
    expect(() =>
      bus.dispatch({
        type: "definitely.not.registered",
        params: {},
      }),
    ).toThrow('Intent type "definitely.not.registered" is not registered')
  })

  it("strips extra params (Zod default)", () => {
    bus.dispatch({
      type: "entity.create",
      params: {
        entityType: "box",
        id: "b1",
        unknownExtraParam: "ignored",
      },
    })
    expect(store.has("b1")).toBe(true)
  })
})

// ── entity.create intent ─────────────────────────────────────────

describe("entity.create intent", () => {
  let store: EntityStore
  let bus: IntentBus

  beforeEach(() => {
    store = makeFullStore()
    ;({ bus } = makeBus(store))
  })

  it("creates entity with specified type", () => {
    const result = bus.dispatch({
      type: "entity.create",
      params: { entityType: "wall", id: "w1" },
    })
    expect(store.getOrThrow("w1").type).toBe("wall")
    expect(result.data?.["entityId"]).toBe("w1")
  })

  it("creates entity with initial traits", () => {
    bus.dispatch({
      type: "entity.create",
      params: {
        entityType: "box",
        id: "b1",
        traits: { color: { r: 255, g: 0, b: 0 } },
      },
    })
    expect(store.getTrait("b1", "color")).toEqual({ r: 255, g: 0, b: 0 })
  })

  it("creates entity with parent", () => {
    store.create("group", { id: "g1" })
    bus.dispatch({
      type: "entity.create",
      params: { entityType: "box", id: "b1", parent: "g1" },
    })
    expect(store.getOrThrow("b1").parent).toBe("g1")
    expect(store.getOrThrow("g1").children).toContain("b1")
  })

  it("auto-generates id when not specified", () => {
    const result = bus.dispatch({
      type: "entity.create",
      params: { entityType: "box" },
    })
    const id = result.data?.["entityId"] as string
    expect(id).toBeTruthy()
    expect(store.has(id)).toBe(true)
  })

  it("returns inverse entity.delete intent", () => {
    const result = bus.dispatch({
      type: "entity.create",
      params: { entityType: "box", id: "b1" },
    })
    expect(result.inverse?.type).toBe("entity.delete")
    expect(result.inverse?.params["id"]).toBe("b1")
  })
})

// ── entity.delete intent ─────────────────────────────────────────

describe("entity.delete intent", () => {
  let store: EntityStore
  let bus: IntentBus

  beforeEach(() => {
    store = new EntityStore()
    ;({ bus } = makeBus(store))
  })

  it("deletes an entity", () => {
    store.create("box", { id: "b1" })
    bus.dispatch({ type: "entity.delete", params: { id: "b1" } })
    expect(store.has("b1")).toBe(false)
  })

  it("cascade-deletes descendants by default", () => {
    store.create("group", { id: "g1" })
    store.create("box", { id: "b1", parent: "g1" })
    store.create("box", { id: "b2", parent: "g1" })

    bus.dispatch({ type: "entity.delete", params: { id: "g1" } })

    expect(store.has("g1")).toBe(false)
    expect(store.has("b1")).toBe(false)
    expect(store.has("b2")).toBe(false)
  })

  it("returns inverse _entity.restoreSnapshot intent", () => {
    store.create("box", { id: "b1" })
    const result = bus.dispatch({
      type: "entity.delete",
      params: { id: "b1" },
    })
    expect(result.inverse?.type).toBe("_entity.restoreSnapshot")
  })
})

// ── trait.update intent ──────────────────────────────────────────

describe("trait.update intent", () => {
  let store: EntityStore
  let bus: IntentBus

  beforeEach(() => {
    store = makeFullStore()
    ;({ bus } = makeBus(store))
    store.create("box", { id: "b1" })
  })

  it("sets trait data on an entity", () => {
    bus.dispatch({
      type: "trait.update",
      params: {
        entityId: "b1",
        traitName: "color",
        data: { r: 255, g: 0, b: 0 },
      },
    })
    expect(store.getTrait("b1", "color")).toEqual({ r: 255, g: 0, b: 0 })
  })

  it("returns inverse trait.update with previous data when trait existed", () => {
    store.setTrait("b1", "color", { r: 100, g: 100, b: 100 })
    const result = bus.dispatch({
      type: "trait.update",
      params: {
        entityId: "b1",
        traitName: "color",
        data: { r: 255, g: 0, b: 0 },
      },
    })
    expect(result.inverse?.type).toBe("trait.update")
    expect(result.inverse?.params["data"]).toEqual({ r: 100, g: 100, b: 100 })
  })

  it("returns inverse trait.remove when trait was newly added", () => {
    const result = bus.dispatch({
      type: "trait.update",
      params: {
        entityId: "b1",
        traitName: "color",
        data: { r: 255, g: 0, b: 0 },
      },
    })
    expect(result.inverse?.type).toBe("trait.remove")
    expect(result.inverse?.params["traitName"]).toBe("color")
  })
})

// ── trait.remove intent ──────────────────────────────────────────

describe("trait.remove intent", () => {
  let store: EntityStore
  let bus: IntentBus

  beforeEach(() => {
    store = makeFullStore()
    ;({ bus } = makeBus(store))
    store.create("box", { id: "b1" })
  })

  it("removes a trait from an entity", () => {
    store.setTrait("b1", "color", { r: 255, g: 0, b: 0 })
    bus.dispatch({
      type: "trait.remove",
      params: { entityId: "b1", traitName: "color" },
    })
    expect(store.hasTrait("b1", "color")).toBe(false)
  })

  it("returns inverse trait.update with previous data", () => {
    store.setTrait("b1", "color", { r: 255, g: 0, b: 0 })
    const result = bus.dispatch({
      type: "trait.remove",
      params: { entityId: "b1", traitName: "color" },
    })
    expect(result.inverse?.type).toBe("trait.update")
    expect(result.inverse?.params["data"]).toEqual({ r: 255, g: 0, b: 0 })
  })

  it("is not undoable when trait didn't exist", () => {
    const result = bus.dispatch({
      type: "trait.remove",
      params: { entityId: "b1", traitName: "color" },
    })
    expect(result.inverse).toBeUndefined()
  })
})

// ── entity.reparent intent ───────────────────────────────────────

describe("entity.reparent intent", () => {
  let store: EntityStore
  let bus: IntentBus

  beforeEach(() => {
    store = new EntityStore()
    ;({ bus } = makeBus(store))
    store.create("group", { id: "p1" })
    store.create("group", { id: "p2" })
    store.create("box", { id: "c1", parent: "p1" })
  })

  it("reparents entity to a new parent", () => {
    bus.dispatch({
      type: "entity.reparent",
      params: { entityId: "c1", newParentId: "p2" },
    })
    expect(store.getOrThrow("c1").parent).toBe("p2")
    expect(store.getOrThrow("p1").children).not.toContain("c1")
    expect(store.getOrThrow("p2").children).toContain("c1")
  })

  it("detaches entity to root when newParentId omitted", () => {
    bus.dispatch({
      type: "entity.reparent",
      params: { entityId: "c1" },
    })
    expect(store.getOrThrow("c1").parent).toBeUndefined()
    expect(store.getOrThrow("p1").children).not.toContain("c1")
  })

  it("returns inverse reparent with previous parent", () => {
    const result = bus.dispatch({
      type: "entity.reparent",
      params: { entityId: "c1", newParentId: "p2" },
    })
    expect(result.inverse?.type).toBe("entity.reparent")
    expect(result.inverse?.params["newParentId"]).toBe("p1")
    expect(result.inverse?.params["entityId"]).toBe("c1")
  })

  it("returns inverse reparent to root for detach", () => {
    store.create("box", { id: "root-entity" })
    const result = bus.dispatch({
      type: "entity.reparent",
      params: { entityId: "root-entity", newParentId: "p1" },
    })
    // Inverse should detach (no newParentId since original had no parent)
    expect(result.inverse?.params["newParentId"]).toBeUndefined()
  })
})

// ── Undo / Redo stack management ─────────────────────────────────

describe("undo / redo", () => {
  let store: EntityStore
  let bus: IntentBus

  beforeEach(() => {
    store = makeFullStore()
    ;({ bus } = makeBus(store))
  })

  describe("stack state", () => {
    it("starts with empty stacks", () => {
      expect(bus.canUndo).toBe(false)
      expect(bus.canRedo).toBe(false)
      expect(bus.undoStackSize).toBe(0)
      expect(bus.redoStackSize).toBe(0)
    })

    it("dispatch adds to undo stack", () => {
      bus.dispatch({ type: "entity.create", params: { entityType: "box" } })
      expect(bus.canUndo).toBe(true)
      expect(bus.undoStackSize).toBe(1)
    })

    it("undo returns undefined on empty stack", () => {
      expect(bus.undo()).toBeUndefined()
    })

    it("redo returns undefined on empty stack", () => {
      expect(bus.redo()).toBeUndefined()
    })

    it("new dispatch clears redo stack", () => {
      bus.dispatch({ type: "entity.create", params: { entityType: "box", id: "a" } })
      bus.undo()
      expect(bus.canRedo).toBe(true)

      bus.dispatch({ type: "entity.create", params: { entityType: "box", id: "b" } })
      expect(bus.canRedo).toBe(false)
      expect(bus.redoStackSize).toBe(0)
    })

    it("clearHistory empties both stacks", () => {
      bus.dispatch({ type: "entity.create", params: { entityType: "box", id: "a" } })
      bus.dispatch({ type: "entity.create", params: { entityType: "box", id: "b" } })
      bus.undo()
      bus.clearHistory()

      expect(bus.canUndo).toBe(false)
      expect(bus.canRedo).toBe(false)
    })
  })

  describe("undo entity.create", () => {
    it("undo removes the created entity", () => {
      bus.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
      expect(store.has("b1")).toBe(true)

      bus.undo()
      expect(store.has("b1")).toBe(false)
    })

    it("redo recreates the entity", () => {
      bus.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
      bus.undo()
      expect(store.has("b1")).toBe(false)

      bus.redo()
      expect(store.has("b1")).toBe(true)
      expect(store.getOrThrow("b1").type).toBe("box")
    })

    it("undo pops undo stack and pushes redo stack", () => {
      bus.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
      expect(bus.undoStackSize).toBe(1)

      bus.undo()
      expect(bus.undoStackSize).toBe(0)
      expect(bus.redoStackSize).toBe(1)
    })

    it("redo pops redo stack and pushes undo stack", () => {
      bus.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
      bus.undo()
      expect(bus.redoStackSize).toBe(1)

      bus.redo()
      expect(bus.redoStackSize).toBe(0)
      expect(bus.undoStackSize).toBe(1)
    })
  })

  describe("undo entity.delete (cascade)", () => {
    it("undo restores deleted entity", () => {
      store.create("box", { id: "b1" })
      store.setTrait("b1", "color", { r: 255, g: 0, b: 0 })

      bus.dispatch({ type: "entity.delete", params: { id: "b1" } })
      expect(store.has("b1")).toBe(false)

      bus.undo()
      expect(store.has("b1")).toBe(true)
      expect(store.getTrait("b1", "color")).toEqual({ r: 255, g: 0, b: 0 })
    })

    it("undo restores full subtree", () => {
      store.create("group", { id: "g1" })
      store.create("box", { id: "b1", parent: "g1" })
      store.create("box", { id: "b2", parent: "g1" })

      bus.dispatch({ type: "entity.delete", params: { id: "g1" } })
      expect(store.count).toBe(0)

      bus.undo()
      expect(store.has("g1")).toBe(true)
      expect(store.has("b1")).toBe(true)
      expect(store.has("b2")).toBe(true)

      // Parent-child relationships restored
      expect(store.getOrThrow("g1").children).toContain("b1")
      expect(store.getOrThrow("g1").children).toContain("b2")
      expect(store.getOrThrow("b1").parent).toBe("g1")
    })

    it("redo re-deletes after undo", () => {
      store.create("group", { id: "g1" })
      store.create("box", { id: "b1", parent: "g1" })

      bus.dispatch({ type: "entity.delete", params: { id: "g1" } })
      bus.undo()
      expect(store.count).toBe(2)

      bus.redo()
      expect(store.count).toBe(0)
    })
  })

  describe("undo trait.update", () => {
    it("undo restores previous trait value", () => {
      store.create("box", { id: "b1" })
      store.setTrait("b1", "color", { r: 0, g: 0, b: 0 })

      bus.dispatch({
        type: "trait.update",
        params: { entityId: "b1", traitName: "color", data: { r: 255, g: 0, b: 0 } },
      })
      expect(store.getTrait("b1", "color")).toEqual({ r: 255, g: 0, b: 0 })

      bus.undo()
      expect(store.getTrait("b1", "color")).toEqual({ r: 0, g: 0, b: 0 })
    })

    it("undo removes trait when it was newly added", () => {
      store.create("box", { id: "b1" })
      bus.dispatch({
        type: "trait.update",
        params: { entityId: "b1", traitName: "color", data: { r: 255, g: 0, b: 0 } },
      })
      expect(store.hasTrait("b1", "color")).toBe(true)

      bus.undo()
      expect(store.hasTrait("b1", "color")).toBe(false)
    })

    it("redo reapplies the trait update", () => {
      store.create("box", { id: "b1" })
      bus.dispatch({
        type: "trait.update",
        params: { entityId: "b1", traitName: "color", data: { r: 255, g: 0, b: 0 } },
      })
      bus.undo()
      expect(store.hasTrait("b1", "color")).toBe(false)

      bus.redo()
      expect(store.getTrait("b1", "color")).toEqual({ r: 255, g: 0, b: 0 })
    })
  })

  describe("undo entity.reparent", () => {
    it("undo restores previous parent", () => {
      store.create("group", { id: "p1" })
      store.create("group", { id: "p2" })
      store.create("box", { id: "c1", parent: "p1" })

      bus.dispatch({
        type: "entity.reparent",
        params: { entityId: "c1", newParentId: "p2" },
      })
      expect(store.getOrThrow("c1").parent).toBe("p2")

      bus.undo()
      expect(store.getOrThrow("c1").parent).toBe("p1")
      expect(store.getOrThrow("p1").children).toContain("c1")
      expect(store.getOrThrow("p2").children).not.toContain("c1")
    })

    it("undo restores detached entity back to parent", () => {
      store.create("group", { id: "p1" })
      store.create("box", { id: "c1", parent: "p1" })

      bus.dispatch({
        type: "entity.reparent",
        params: { entityId: "c1" }, // detach to root
      })
      expect(store.getOrThrow("c1").parent).toBeUndefined()

      bus.undo()
      expect(store.getOrThrow("c1").parent).toBe("p1")
    })
  })

  describe("multiple operations", () => {
    it("multiple undo in sequence", () => {
      bus.dispatch({ type: "entity.create", params: { entityType: "box", id: "a" } })
      bus.dispatch({ type: "entity.create", params: { entityType: "box", id: "b" } })
      bus.dispatch({ type: "entity.create", params: { entityType: "box", id: "c" } })
      expect(store.count).toBe(3)

      bus.undo()
      expect(store.count).toBe(2)
      expect(store.has("c")).toBe(false)

      bus.undo()
      expect(store.count).toBe(1)
      expect(store.has("b")).toBe(false)

      bus.undo()
      expect(store.count).toBe(0)
    })

    it("undo/redo/undo cycle", () => {
      bus.dispatch({ type: "entity.create", params: { entityType: "box", id: "a" } })
      bus.dispatch({
        type: "trait.update",
        params: {
          entityId: "a",
          traitName: "color",
          data: { r: 255, g: 0, b: 0 },
        },
      })
      expect(store.getTrait("a", "color")).toEqual({ r: 255, g: 0, b: 0 })

      bus.undo() // undo trait.update
      expect(store.hasTrait("a", "color")).toBe(false)

      bus.redo() // redo trait.update
      expect(store.getTrait("a", "color")).toEqual({ r: 255, g: 0, b: 0 })

      bus.undo() // undo trait.update again
      expect(store.hasTrait("a", "color")).toBe(false)
    })

    it("non-undoable intents don't affect the stack", () => {
      // trait.remove on a non-existent trait is not undoable
      store.create("box", { id: "b1" })
      bus.dispatch({
        type: "trait.remove",
        params: { entityId: "b1", traitName: "nonexistent" },
      })
      expect(bus.undoStackSize).toBe(0)
    })
  })
})

// ── End-to-end: built-in intents with TraitRegistry ──────────────

describe("built-in intents end-to-end with TraitRegistry", () => {
  let store: EntityStore
  let bus: IntentBus

  beforeEach(() => {
    store = makeFullStore()
    ;({ bus } = makeBus(store))
  })

  it("create entity with spatial trait and undo", () => {
    bus.dispatch({
      type: "entity.create",
      params: {
        entityType: "box",
        id: "b1",
        traits: {
          spatial: {
            position: { x: 10, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      },
    })

    expect(store.has("b1")).toBe(true)
    expect(
      (store.getTrait("b1", "spatial") as { position: { x: number } }).position.x,
    ).toBe(10)

    bus.undo()
    expect(store.has("b1")).toBe(false)
  })

  it("update spatial position, undo, redo", () => {
    store.create("box", { id: "b1" })
    store.setTraitDefaults("b1", "spatial")

    bus.dispatch({
      type: "trait.update",
      params: {
        entityId: "b1",
        traitName: "spatial",
        data: {
          position: { x: 50, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
      },
    })
    expect(
      (store.getTrait("b1", "spatial") as { position: { x: number } }).position.x,
    ).toBe(50)

    bus.undo()
    expect(
      (store.getTrait("b1", "spatial") as { position: { x: number } }).position.x,
    ).toBe(0)

    bus.redo()
    expect(
      (store.getTrait("b1", "spatial") as { position: { x: number } }).position.x,
    ).toBe(50)
  })

  it("full scene build and teardown via intents", () => {
    // Build: group with two children
    bus.dispatch({ type: "entity.create", params: { entityType: "group", id: "grp" } })
    bus.dispatch({
      type: "entity.create",
      params: { entityType: "box", id: "box1", parent: "grp" },
    })
    bus.dispatch({
      type: "entity.create",
      params: { entityType: "box", id: "box2", parent: "grp" },
    })

    expect(store.count).toBe(3)
    expect(store.getOrThrow("grp").children).toHaveLength(2)

    // Delete group cascades to children
    bus.dispatch({ type: "entity.delete", params: { id: "grp" } })
    expect(store.count).toBe(0)

    // Undo restores entire tree
    bus.undo()
    expect(store.count).toBe(3)
    expect(store.getOrThrow("grp").children).toContain("box1")
    expect(store.getOrThrow("grp").children).toContain("box2")
    expect(store.getOrThrow("box1").parent).toBe("grp")

    // Redo deletes again
    bus.redo()
    expect(store.count).toBe(0)
  })
})
