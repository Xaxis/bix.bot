import React from "react"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { render, fireEvent, screen } from "@testing-library/react"
import { World, defineSchema } from "@bix/engine"
import { createWorldStore } from "../stores/world-store.js"
import type { WorldStoreHandle } from "../stores/world-store.js"
import { Toolbar } from "./Toolbar.js"

const testSchema = defineSchema({ name: "toolbar-test", version: "0.1.0", traits: [] })

describe("Toolbar", () => {
  let world: World
  let handle: WorldStoreHandle

  beforeEach(() => {
    world = World.create(testSchema)
    handle = createWorldStore(world)
  })

  afterEach(() => {
    handle.destroy()
  })

  // ── Rendering ──────────────────────────────────────────────────

  it("renders undo, redo, and delete buttons", () => {
    render(<Toolbar store={handle.store} />)
    expect(screen.getByTestId("toolbar-undo")).toBeInTheDocument()
    expect(screen.getByTestId("toolbar-redo")).toBeInTheDocument()
    expect(screen.getByTestId("toolbar-delete")).toBeInTheDocument()
  })

  // ── Disabled states ────────────────────────────────────────────

  it("undo button is disabled when canUndo=false", () => {
    render(<Toolbar store={handle.store} />)
    expect(screen.getByTestId("toolbar-undo")).toBeDisabled()
  })

  it("undo button is enabled after a dispatch", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    render(<Toolbar store={handle.store} />)
    expect(screen.getByTestId("toolbar-undo")).not.toBeDisabled()
  })

  it("redo button is disabled initially", () => {
    render(<Toolbar store={handle.store} />)
    expect(screen.getByTestId("toolbar-redo")).toBeDisabled()
  })

  it("redo button is enabled after undo", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    world.undo()
    render(<Toolbar store={handle.store} />)
    expect(screen.getByTestId("toolbar-redo")).not.toBeDisabled()
  })

  it("delete button is disabled when no selection", () => {
    render(<Toolbar store={handle.store} />)
    expect(screen.getByTestId("toolbar-delete")).toBeDisabled()
  })

  it("delete button is enabled when entities are selected", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    handle.store.getState().setSelection(["b1"])
    render(<Toolbar store={handle.store} />)
    expect(screen.getByTestId("toolbar-delete")).not.toBeDisabled()
  })

  // ── Actions ────────────────────────────────────────────────────

  it("clicking Undo undoes last action", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    expect(world.query.count).toBe(1)

    render(<Toolbar store={handle.store} />)
    fireEvent.click(screen.getByTestId("toolbar-undo"))

    expect(world.query.count).toBe(0)
  })

  it("clicking Redo re-applies undone action", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    world.undo()

    render(<Toolbar store={handle.store} />)
    fireEvent.click(screen.getByTestId("toolbar-redo"))

    expect(world.query.count).toBe(1)
  })

  it("clicking Delete removes all selected entities from the World", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "a" } })
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b" } })
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "c" } })
    handle.store.getState().setSelection(["a", "b"])

    render(<Toolbar store={handle.store} />)
    fireEvent.click(screen.getByTestId("toolbar-delete"))

    expect(world.query.count).toBe(1)
    expect(world.query.byId("c")).toBeDefined()
    expect(world.query.byId("a")).toBeUndefined()
    expect(world.query.byId("b")).toBeUndefined()
  })

  it("Delete clears selection after deleting", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "a" } })
    handle.store.getState().setSelection(["a"])

    render(<Toolbar store={handle.store} />)
    fireEvent.click(screen.getByTestId("toolbar-delete"))

    expect(handle.store.getState().selection.size).toBe(0)
  })

  it("Delete dispatches entity.delete — not a direct World write", () => {
    // Verify the architectural invariant:
    // Toolbar.delete → store.dispatch → world.dispatch (intent) → world mutation
    // If we delete via the intent bus, the action is undoable.
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "a" } })
    handle.store.getState().setSelection(["a"])

    render(<Toolbar store={handle.store} />)
    fireEvent.click(screen.getByTestId("toolbar-delete"))

    expect(world.query.byId("a")).toBeUndefined()

    // The delete was recorded in undo history (it went through the intent bus)
    expect(world.canUndo).toBe(true)
    world.undo()
    expect(world.query.byId("a")).toBeDefined()
  })

  it("Undo button becomes disabled after undoing all actions", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box" } })
    render(<Toolbar store={handle.store} />)

    fireEvent.click(screen.getByTestId("toolbar-undo"))
    expect(screen.getByTestId("toolbar-undo")).toBeDisabled()
  })
})
