import React from "react"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { render, fireEvent, screen } from "@testing-library/react"
import { World, defineSchema, defineEntityType } from "@bix/engine"
import { createWorldStore } from "../stores/world-store.js"
import type { WorldStoreHandle } from "../stores/world-store.js"
import { Palette } from "./Palette.js"

// ── Test schema ───────────────────────────────────────────────────

const schema = defineSchema({
  name: "palette-test",
  version: "0.1.0",
  traits: [],
  entityTypes: [
    defineEntityType({ type: "box", label: "Box", description: "A box", traits: [] }),
    defineEntityType({ type: "wall", label: "Wall", description: "A wall", traits: [] }),
    defineEntityType({ type: "door", label: "Door", description: "A door", traits: [] }),
  ],
})

// ── Tests ─────────────────────────────────────────────────────────

describe("Palette", () => {
  let handle: WorldStoreHandle

  beforeEach(() => {
    handle = createWorldStore(World.create(schema))
  })

  afterEach(() => {
    handle.destroy()
  })

  it("renders a button for each entity type in the schema", () => {
    render(<Palette store={handle.store} schema={schema} />)

    expect(screen.getByTestId("place-box")).toBeInTheDocument()
    expect(screen.getByTestId("place-wall")).toBeInTheDocument()
    expect(screen.getByTestId("place-door")).toBeInTheDocument()
  })

  it("renders entity type labels as button text", () => {
    render(<Palette store={handle.store} schema={schema} />)

    expect(screen.getByText("Box")).toBeInTheDocument()
    expect(screen.getByText("Wall")).toBeInTheDocument()
    expect(screen.getByText("Door")).toBeInTheDocument()
  })

  it("clicking an entity type button activates place mode", () => {
    render(<Palette store={handle.store} schema={schema} />)
    fireEvent.click(screen.getByTestId("place-box"))

    const { activeTool, pendingEntityType } = handle.store.getState()
    expect(activeTool).toBe("place")
    expect(pendingEntityType).toBe("box")
  })

  it("clicking different entity type switches pending type", () => {
    render(<Palette store={handle.store} schema={schema} />)
    fireEvent.click(screen.getByTestId("place-box"))
    fireEvent.click(screen.getByTestId("place-wall"))

    expect(handle.store.getState().pendingEntityType).toBe("wall")
  })

  it("active entity type button has data-active=true", () => {
    render(<Palette store={handle.store} schema={schema} />)
    fireEvent.click(screen.getByTestId("place-box"))

    expect(screen.getByTestId("place-box").getAttribute("data-active")).toBe("true")
    expect(screen.getByTestId("place-wall").getAttribute("data-active")).toBe("false")
  })

  it("renders Select tool button", () => {
    render(<Palette store={handle.store} schema={schema} />)
    expect(screen.getByTestId("tool-select")).toBeInTheDocument()
  })

  it("renders Delete tool button", () => {
    render(<Palette store={handle.store} schema={schema} />)
    expect(screen.getByTestId("tool-delete")).toBeInTheDocument()
  })

  it("clicking Select button sets activeTool to select", () => {
    handle.store.getState().setPlaceTool("box")
    render(<Palette store={handle.store} schema={schema} />)

    fireEvent.click(screen.getByTestId("tool-select"))

    expect(handle.store.getState().activeTool).toBe("select")
    expect(handle.store.getState().pendingEntityType).toBeNull()
  })

  it("clicking Delete button sets activeTool to delete", () => {
    render(<Palette store={handle.store} schema={schema} />)
    fireEvent.click(screen.getByTestId("tool-delete"))

    expect(handle.store.getState().activeTool).toBe("delete")
  })

  it("Select button has data-active=true when select is active", () => {
    render(<Palette store={handle.store} schema={schema} />)
    // Default is select
    expect(screen.getByTestId("tool-select").getAttribute("data-active")).toBe("true")
  })

  it("entity type buttons have data-active=false when in select mode", () => {
    render(<Palette store={handle.store} schema={schema} />)
    // Default tool is select — no entity type is active
    expect(screen.getByTestId("place-box").getAttribute("data-active")).toBe("false")
  })

  it("renders no entity type buttons when schema has no entityTypes", () => {
    const emptySchema = defineSchema({ name: "empty", version: "0.1.0", traits: [] })
    const emptyHandle = createWorldStore(World.create(emptySchema))
    render(<Palette store={emptyHandle.store} schema={emptySchema} />)

    // Only the tool buttons should exist
    expect(screen.getByTestId("tool-select")).toBeInTheDocument()
    expect(screen.queryByTestId("place-box")).not.toBeInTheDocument()

    emptyHandle.destroy()
  })
})
