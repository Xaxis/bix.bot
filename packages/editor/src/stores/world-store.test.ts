import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { z } from "zod"
import { World, defineSchema, defineTrait } from "@bix/engine"
import { createWorldStore } from "./world-store.js"
import type { WorldStoreHandle } from "./world-store.js"

// ── Test schema ──────────────────────────────────────────────────

const colorTrait = defineTrait({
  name: "color",
  schema: z.object({ value: z.string() }),
  defaults: { value: "gray" },
})

const testSchema = defineSchema({
  name: "store-test",
  version: "0.1.0",
  traits: [colorTrait],
})

// ── Helpers ──────────────────────────────────────────────────────

function makeWorld(): World {
  return World.create(testSchema)
}

// ── Initialization ────────────────────────────────────────────────

describe("createWorldStore — initialization", () => {
  let world: World
  let handle: WorldStoreHandle

  beforeEach(() => {
    world = makeWorld()
    handle = createWorldStore(world)
  })

  afterEach(() => {
    handle.destroy()
  })

  it("initializes with current world entities", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    const { store, destroy } = createWorldStore(world)

    const state = store.getState()
    expect(state.entities).toHaveLength(1)
    expect(state.entities[0]?.id).toBe("b1")

    destroy()
  })

  it("initializes with empty entities for an empty world", () => {
    expect(handle.store.getState().entities).toHaveLength(0)
  })

  it("initializes canUndo/canRedo from world", () => {
    const state = handle.store.getState()
    expect(state.canUndo).toBe(false)
    expect(state.canRedo).toBe(false)
  })

  it("initializes with empty selection", () => {
    expect(handle.store.getState().selection.size).toBe(0)
  })

  it("initializes with 'select' as active tool", () => {
    expect(handle.store.getState().activeTool).toBe("select")
  })
})

// ── Reactivity to World events ────────────────────────────────────

describe("store reactivity", () => {
  let world: World
  let handle: WorldStoreHandle

  beforeEach(() => {
    world = makeWorld()
    handle = createWorldStore(world)
  })

  afterEach(() => {
    handle.destroy()
  })

  it("updates entities when world dispatches entity.create", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })

    const entities = handle.store.getState().entities
    expect(entities).toHaveLength(1)
    expect(entities[0]?.id).toBe("b1")
    expect(entities[0]?.type).toBe("box")
  })

  it("updates entities when world dispatches entity.delete", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    world.dispatch({ type: "entity.delete", params: { id: "b1" } })

    expect(handle.store.getState().entities).toHaveLength(0)
  })

  it("updates entities when trait is updated", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "b1", traitName: "color", data: { value: "red" } },
    })

    const entity = handle.store.getState().entities.find((e) => e.id === "b1")
    expect((entity?.traits["color"] as { value: string })?.value).toBe("red")
  })

  it("updates canUndo when world has history", () => {
    expect(handle.store.getState().canUndo).toBe(false)

    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    expect(handle.store.getState().canUndo).toBe(true)
  })

  it("updates canRedo after undo", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    world.undo()

    expect(handle.store.getState().canUndo).toBe(false)
    expect(handle.store.getState().canRedo).toBe(true)
  })

  it("re-snapshots entities after undo", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    expect(handle.store.getState().entities).toHaveLength(1)

    world.undo()
    expect(handle.store.getState().entities).toHaveLength(0)
  })

  it("re-snapshots entities after redo", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    world.undo()
    world.redo()

    expect(handle.store.getState().entities).toHaveLength(1)
  })

  it("does not update after destroy()", () => {
    handle.destroy()

    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })

    // Store should still have the old empty state — no longer subscribed
    expect(handle.store.getState().entities).toHaveLength(0)
  })
})

// ── dispatch / undo / redo delegates ─────────────────────────────

describe("store world delegates", () => {
  let world: World
  let handle: WorldStoreHandle

  beforeEach(() => {
    world = makeWorld()
    handle = createWorldStore(world)
  })

  afterEach(() => {
    handle.destroy()
  })

  it("store.dispatch() mutates the world", () => {
    const { dispatch } = handle.store.getState()
    dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })

    expect(world.query.byId("b1")).toBeDefined()
  })

  it("store.dispatch() returns the IntentResult", () => {
    const { dispatch } = handle.store.getState()
    const result = dispatch({
      type: "entity.create",
      params: { entityType: "box", id: "b1" },
    })

    expect(result.intent.type).toBe("entity.create")
    expect(result.data?.["entityId"]).toBe("b1")
  })

  it("store.undo() undoes last dispatch", () => {
    handle.store.getState().dispatch({
      type: "entity.create",
      params: { entityType: "box", id: "b1" },
    })
    handle.store.getState().undo()

    expect(world.query.byId("b1")).toBeUndefined()
  })

  it("store.redo() re-applies after undo", () => {
    handle.store.getState().dispatch({
      type: "entity.create",
      params: { entityType: "box", id: "b1" },
    })
    handle.store.getState().undo()
    handle.store.getState().redo()

    expect(world.query.byId("b1")).toBeDefined()
  })
})

// ── Selection state ───────────────────────────────────────────────

describe("selection state", () => {
  let world: World
  let handle: WorldStoreHandle

  beforeEach(() => {
    world = makeWorld()
    handle = createWorldStore(world)
    // Create some entities for selection tests
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "a" } })
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b" } })
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "c" } })
  })

  afterEach(() => {
    handle.destroy()
  })

  it("setSelection replaces the entire selection", () => {
    const { setSelection } = handle.store.getState()
    setSelection(["a", "b"])

    const { selection } = handle.store.getState()
    expect(selection.has("a")).toBe(true)
    expect(selection.has("b")).toBe(true)
    expect(selection.has("c")).toBe(false)
    expect(selection.size).toBe(2)
  })

  it("addToSelection adds an entity without replacing", () => {
    handle.store.getState().setSelection(["a"])
    handle.store.getState().addToSelection("b")

    const { selection } = handle.store.getState()
    expect(selection.has("a")).toBe(true)
    expect(selection.has("b")).toBe(true)
  })

  it("removeFromSelection removes one entity", () => {
    handle.store.getState().setSelection(["a", "b", "c"])
    handle.store.getState().removeFromSelection("b")

    const { selection } = handle.store.getState()
    expect(selection.has("a")).toBe(true)
    expect(selection.has("b")).toBe(false)
    expect(selection.has("c")).toBe(true)
  })

  it("clearSelection empties the set", () => {
    handle.store.getState().setSelection(["a", "b"])
    handle.store.getState().clearSelection()

    expect(handle.store.getState().selection.size).toBe(0)
  })

  it("toggleSelection adds if not present", () => {
    handle.store.getState().toggleSelection("a")
    expect(handle.store.getState().selection.has("a")).toBe(true)
  })

  it("toggleSelection removes if present", () => {
    handle.store.getState().setSelection(["a"])
    handle.store.getState().toggleSelection("a")
    expect(handle.store.getState().selection.has("a")).toBe(false)
  })

  it("selection is independent of World state — survives undo", () => {
    handle.store.getState().setSelection(["a"])
    world.undo() // undo entity c creation

    // Selection persists — it's not tied to World history
    expect(handle.store.getState().selection.has("a")).toBe(true)
  })

  it("selection does not affect World state", () => {
    handle.store.getState().setSelection(["a", "b"])

    // World still has all 3 entities
    expect(world.query.count).toBe(3)
  })
})

// ── Active tool ───────────────────────────────────────────────────

describe("activeTool", () => {
  let handle: WorldStoreHandle

  beforeEach(() => {
    handle = createWorldStore(makeWorld())
  })

  afterEach(() => {
    handle.destroy()
  })

  it("setActiveTool updates the active tool", () => {
    handle.store.getState().setActiveTool("place")
    expect(handle.store.getState().activeTool).toBe("place")
  })

  it("cycles through all tools", () => {
    const { setActiveTool } = handle.store.getState()

    setActiveTool("select")
    expect(handle.store.getState().activeTool).toBe("select")

    setActiveTool("place")
    expect(handle.store.getState().activeTool).toBe("place")

    setActiveTool("delete")
    expect(handle.store.getState().activeTool).toBe("delete")
  })
})

// ── Two stores — independent worlds ──────────────────────────────

describe("two stores wrapping different worlds", () => {
  it("stores are fully independent", () => {
    const worldA = makeWorld()
    const worldB = makeWorld()

    const { store: storeA, destroy: destroyA } = createWorldStore(worldA)
    const { store: storeB, destroy: destroyB } = createWorldStore(worldB)

    // Dispatch to world A
    worldA.dispatch({ type: "entity.create", params: { entityType: "box", id: "a1" } })

    // Store A updates, Store B stays empty
    expect(storeA.getState().entities).toHaveLength(1)
    expect(storeB.getState().entities).toHaveLength(0)

    destroyA()
    destroyB()
  })

  it("selection state is independent between stores", () => {
    const worldA = makeWorld()
    const worldB = makeWorld()

    worldA.dispatch({ type: "entity.create", params: { entityType: "box", id: "a1" } })

    const { store: storeA, destroy: destroyA } = createWorldStore(worldA)
    const { store: storeB, destroy: destroyB } = createWorldStore(worldB)

    storeA.getState().setSelection(["a1"])

    expect(storeA.getState().selection.has("a1")).toBe(true)
    expect(storeB.getState().selection.size).toBe(0)

    destroyA()
    destroyB()
  })

  it("dispatching to one world does not affect the other store", () => {
    const worldA = makeWorld()
    const worldB = makeWorld()
    worldB.dispatch({ type: "entity.create", params: { entityType: "wall", id: "b1" } })

    const { store: storeA, destroy: destroyA } = createWorldStore(worldA)
    const { store: storeB, destroy: destroyB } = createWorldStore(worldB)

    // Dispatch to A only
    storeA.getState().dispatch({
      type: "entity.create",
      params: { entityType: "box", id: "a1" },
    })

    expect(storeA.getState().entities).toHaveLength(1)
    expect(storeB.getState().entities).toHaveLength(1) // only b1
    expect(storeB.getState().entities[0]?.id).toBe("b1")

    destroyA()
    destroyB()
  })

  it("undo in one world does not affect the other store", () => {
    const worldA = makeWorld()
    const worldB = makeWorld()

    const { store: storeA, destroy: destroyA } = createWorldStore(worldA)
    const { store: storeB, destroy: destroyB } = createWorldStore(worldB)

    storeA
      .getState()
      .dispatch({ type: "entity.create", params: { entityType: "box", id: "a1" } })
    storeB
      .getState()
      .dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })

    storeA.getState().undo()

    expect(storeA.getState().entities).toHaveLength(0)
    expect(storeB.getState().entities).toHaveLength(1) // unaffected

    destroyA()
    destroyB()
  })

  it("store subscriber notification only fires for its own world", () => {
    const worldA = makeWorld()
    const worldB = makeWorld()

    const { store: storeA, destroy: destroyA } = createWorldStore(worldA)
    const { store: storeB, destroy: destroyB } = createWorldStore(worldB)

    const subscriberA = vi.fn()
    const subscriberB = vi.fn()

    storeA.subscribe(subscriberA)
    storeB.subscribe(subscriberB)

    // Dispatch only to A's world
    worldA.dispatch({ type: "entity.create", params: { entityType: "box" } })

    // Only storeA subscriber should have fired
    expect(subscriberA).toHaveBeenCalled()
    expect(subscriberB).not.toHaveBeenCalled()

    destroyA()
    destroyB()
  })
})

// ── pendingEntityType / place tool ────────────────────────────────

describe("pendingEntityType and place tool", () => {
  let handle: WorldStoreHandle

  beforeEach(() => {
    handle = createWorldStore(makeWorld())
  })

  afterEach(() => {
    handle.destroy()
  })

  it("initializes with null pendingEntityType", () => {
    expect(handle.store.getState().pendingEntityType).toBeNull()
  })

  it("setPlaceTool sets activeTool=place and pendingEntityType", () => {
    handle.store.getState().setPlaceTool("box")
    const { activeTool, pendingEntityType } = handle.store.getState()
    expect(activeTool).toBe("place")
    expect(pendingEntityType).toBe("box")
  })

  it("setActiveTool to non-place clears pendingEntityType", () => {
    handle.store.getState().setPlaceTool("wall")
    handle.store.getState().setActiveTool("select")
    expect(handle.store.getState().pendingEntityType).toBeNull()
  })

  it("setActiveTool to place preserves pendingEntityType", () => {
    handle.store.getState().setPlaceTool("box")
    handle.store.getState().setActiveTool("place")
    expect(handle.store.getState().pendingEntityType).toBe("box")
  })

  it("setPendingEntityType updates directly", () => {
    handle.store.getState().setPendingEntityType("door")
    expect(handle.store.getState().pendingEntityType).toBe("door")
  })

  it("switching to delete tool clears pendingEntityType", () => {
    handle.store.getState().setPlaceTool("box")
    handle.store.getState().setActiveTool("delete")
    expect(handle.store.getState().pendingEntityType).toBeNull()
    expect(handle.store.getState().activeTool).toBe("delete")
  })
})
