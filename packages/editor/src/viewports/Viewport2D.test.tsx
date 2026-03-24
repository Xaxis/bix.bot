import React from "react"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { render, fireEvent, screen, act } from "@testing-library/react"
import { z } from "zod"
import { World, defineSchema, defineTrait } from "@bix/engine"
import { createWorldStore } from "../stores/world-store.js"
import type { WorldStoreHandle } from "../stores/world-store.js"
import Viewport2D from "./Viewport2D.js"

// ── Test schema ───────────────────────────────────────────────────

const testSchema = defineSchema({
  name: "vp2d-test",
  version: "0.1.0",
  traits: [
    defineTrait({
      name: "tag",
      schema: z.object({ label: z.string() }),
      defaults: { label: "" },
    }),
  ],
})

function makeWorld() {
  return World.create(testSchema)
}

/** Adds an entity with spatial + renderable traits at (x, z). */
function addSpatialEntity(world: World, id: string, x = 0, z = 0): void {
  world.dispatch({ type: "entity.create", params: { entityType: "box", id } })
  world.dispatch({
    type: "trait.update",
    params: {
      entityId: id,
      traitName: "spatial",
      data: {
        position: { x, y: 0, z },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
    },
  })
}

// ── Rendering ─────────────────────────────────────────────────────

describe("Viewport2D — rendering", () => {
  let world: World
  let handle: WorldStoreHandle

  beforeEach(() => {
    world = makeWorld()
    handle = createWorldStore(world)
  })

  afterEach(() => {
    handle.destroy()
  })

  it("renders an SVG element", () => {
    const { unmount } = render(<Viewport2D store={handle.store} />)
    expect(screen.getByTestId("viewport-2d")).toBeInTheDocument()
    unmount()
  })

  it("renders a rect for each entity with spatial trait", () => {
    addSpatialEntity(world, "a")
    addSpatialEntity(world, "b")
    addSpatialEntity(world, "c")

    const { unmount } = render(<Viewport2D store={handle.store} />)
    const rects = document.querySelectorAll("[data-entity-id]")
    expect(rects).toHaveLength(3)
    unmount()
  })

  it("does not render entities without spatial trait", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "ghost", id: "g1" } })
    // No spatial trait — should not appear

    const { unmount } = render(<Viewport2D store={handle.store} />)
    expect(document.querySelectorAll("[data-entity-id]")).toHaveLength(0)
    unmount()
  })

  it("renders correct entity IDs", () => {
    addSpatialEntity(world, "alpha")
    addSpatialEntity(world, "beta")

    const { unmount } = render(<Viewport2D store={handle.store} />)
    const ids = [...document.querySelectorAll("[data-entity-id]")]
      .map((el) => el.getAttribute("data-entity-id"))
      .sort()
    expect(ids).toEqual(["alpha", "beta"])
    unmount()
  })

  it("renders 0 rects for empty world", () => {
    const { unmount } = render(<Viewport2D store={handle.store} />)
    expect(document.querySelectorAll("[data-entity-id]")).toHaveLength(0)
    unmount()
  })

  it("selected entity has data-selected=true", () => {
    addSpatialEntity(world, "e1")
    handle.store.getState().setSelection(["e1"])

    const { unmount } = render(<Viewport2D store={handle.store} />)
    expect(
      document.querySelector('[data-entity-id="e1"]')?.getAttribute("data-selected"),
    ).toBe("true")
    unmount()
  })

  it("unselected entity has data-selected=false", () => {
    addSpatialEntity(world, "e1")
    addSpatialEntity(world, "e2")
    handle.store.getState().setSelection(["e1"])

    const { unmount } = render(<Viewport2D store={handle.store} />)
    expect(
      document.querySelector('[data-entity-id="e2"]')?.getAttribute("data-selected"),
    ).toBe("false")
    unmount()
  })
})

// ── Selection ─────────────────────────────────────────────────────

describe("Viewport2D — selection", () => {
  let world: World
  let handle: WorldStoreHandle

  beforeEach(() => {
    world = makeWorld()
    handle = createWorldStore(world)
    addSpatialEntity(world, "e1")
    addSpatialEntity(world, "e2")
  })

  afterEach(() => {
    handle.destroy()
  })

  it("clicking a rect selects that entity", () => {
    const { unmount } = render(<Viewport2D store={handle.store} />)

    fireEvent.click(document.querySelector('[data-entity-id="e1"]')!)
    expect(handle.store.getState().selection.has("e1")).toBe(true)

    unmount()
  })

  it("clicking a different rect replaces selection", () => {
    const { unmount } = render(<Viewport2D store={handle.store} />)

    fireEvent.click(document.querySelector('[data-entity-id="e1"]')!)
    fireEvent.click(document.querySelector('[data-entity-id="e2"]')!)

    expect(handle.store.getState().selection.has("e1")).toBe(false)
    expect(handle.store.getState().selection.has("e2")).toBe(true)

    unmount()
  })

  it("clicking the SVG background clears selection", () => {
    handle.store.getState().setSelection(["e1"])
    const { unmount } = render(<Viewport2D store={handle.store} />)

    fireEvent.click(screen.getByTestId("viewport-2d"))

    expect(handle.store.getState().selection.size).toBe(0)

    unmount()
  })
})

// ── Place mode ────────────────────────────────────────────────────

describe("Viewport2D — place mode", () => {
  let world: World
  let handle: WorldStoreHandle

  beforeEach(() => {
    world = makeWorld()
    handle = createWorldStore(world)
  })

  afterEach(() => {
    handle.destroy()
  })

  it("clicking SVG in place mode creates an entity", () => {
    handle.store.getState().setPlaceTool("box")

    const { unmount } = render(
      <Viewport2D store={handle.store} width={600} height={400} />,
    )

    fireEvent.click(screen.getByTestId("viewport-2d"), {
      clientX: 300,
      clientY: 200,
    })

    expect(world.query.count).toBe(1)
    expect(world.query.all()[0]?.type).toBe("box")

    unmount()
  })

  it("created entity has spatial trait with correct position", () => {
    handle.store.getState().setPlaceTool("point")

    const { unmount } = render(
      <Viewport2D store={handle.store} width={600} height={400} />,
    )

    // Click at SVG center (300, 200) → world (0, 0)
    fireEvent.click(screen.getByTestId("viewport-2d"), {
      clientX: 300,
      clientY: 200,
    })

    const entity = world.query.all()[0]!
    const spatial = entity.traits["spatial"] as {
      position: { x: number; y: number; z: number }
    }
    // clientX/Y of 300/200 maps to origin since rect.left/top = 0 in jsdom
    expect(spatial.position.x).toBeCloseTo(0, 1)
    expect(spatial.position.y).toBe(0)
    expect(spatial.position.z).toBeCloseTo(0, 1)

    unmount()
  })

  it("returns to select mode after placement", () => {
    handle.store.getState().setPlaceTool("box")

    const { unmount } = render(<Viewport2D store={handle.store} />)
    fireEvent.click(screen.getByTestId("viewport-2d"), {
      clientX: 300,
      clientY: 200,
    })

    expect(handle.store.getState().activeTool).toBe("select")
    expect(handle.store.getState().pendingEntityType).toBeNull()

    unmount()
  })

  it("created entity gets spatial + renderable traits", () => {
    handle.store.getState().setPlaceTool("mytype")

    const { unmount } = render(<Viewport2D store={handle.store} />)
    fireEvent.click(screen.getByTestId("viewport-2d"), {
      clientX: 300,
      clientY: 200,
    })

    const entity = world.query.all()[0]!
    expect("spatial" in entity.traits).toBe(true)
    expect("renderable" in entity.traits).toBe(true)

    unmount()
  })

  it("clicking background in select mode clears selection, not place", () => {
    addSpatialEntity(world, "e1")
    handle.store.getState().setSelection(["e1"])
    // activeTool is "select" by default

    const { unmount } = render(<Viewport2D store={handle.store} />)
    fireEvent.click(screen.getByTestId("viewport-2d"))

    expect(handle.store.getState().selection.size).toBe(0)
    expect(world.query.count).toBe(1) // no new entity created

    unmount()
  })
})

// ── Reactivity ────────────────────────────────────────────────────

describe("Viewport2D — reactivity", () => {
  let world: World
  let handle: WorldStoreHandle

  beforeEach(() => {
    world = makeWorld()
    handle = createWorldStore(world)
  })

  afterEach(() => {
    handle.destroy()
  })

  it("new entity appears after dispatch", () => {
    const { unmount } = render(<Viewport2D store={handle.store} />)
    expect(document.querySelectorAll("[data-entity-id]")).toHaveLength(0)

    act(() => {
      addSpatialEntity(world, "new1")
    })

    expect(document.querySelectorAll("[data-entity-id]")).toHaveLength(1)
    unmount()
  })

  it("entity disappears after delete", () => {
    addSpatialEntity(world, "e1")
    const { unmount } = render(<Viewport2D store={handle.store} />)
    expect(document.querySelectorAll("[data-entity-id]")).toHaveLength(1)

    act(() => {
      world.dispatch({ type: "entity.delete", params: { id: "e1" } })
    })

    expect(document.querySelectorAll("[data-entity-id]")).toHaveLength(0)
    unmount()
  })
})
