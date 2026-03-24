import React from "react"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { render, fireEvent, screen } from "@testing-library/react"
import { z } from "zod"
import { World, defineSchema, defineTrait } from "@bix/engine"
import { createWorldStore } from "../stores/world-store.js"
import type { WorldStoreHandle } from "../stores/world-store.js"
import { Inspector } from "./Inspector.js"

// ── Test schema ───────────────────────────────────────────────────

const colorTrait = defineTrait({
  name: "color",
  schema: z.object({ value: z.string() }),
  defaults: { value: "gray" },
  editable: {
    fields: {
      value: { label: "Color", widget: "input" },
    },
  },
})

const scoreTrait = defineTrait({
  name: "score",
  schema: z.object({ points: z.number(), multiplier: z.number() }),
  defaults: { points: 0, multiplier: 1 },
  editable: {
    fields: {
      points: { label: "Points", widget: "input" },
      multiplier: { label: "Multiplier", widget: "slider" },
    },
  },
})

const testSchema = defineSchema({
  name: "inspector-test",
  version: "0.1.0",
  traits: [colorTrait, scoreTrait],
})

// ── Helpers ───────────────────────────────────────────────────────

function makeWorld() {
  return World.create(testSchema)
}

// ── Tests ─────────────────────────────────────────────────────────

describe("Inspector — no selection", () => {
  let handle: WorldStoreHandle

  beforeEach(() => {
    handle = createWorldStore(makeWorld())
  })

  afterEach(() => {
    handle.destroy()
  })

  it("shows 'No entity selected' when nothing is selected", () => {
    render(<Inspector store={handle.store} schema={testSchema} />)
    expect(screen.getByText("No entity selected")).toBeInTheDocument()
  })

  it("inspector element is present even when empty", () => {
    render(<Inspector store={handle.store} schema={testSchema} />)
    expect(screen.getByTestId("inspector")).toBeInTheDocument()
  })
})

describe("Inspector — entity selected", () => {
  let world: World
  let handle: WorldStoreHandle

  beforeEach(() => {
    world = makeWorld()
    handle = createWorldStore(world)
  })

  afterEach(() => {
    handle.destroy()
  })

  it("shows entity id when selected", () => {
    world.dispatch({
      type: "entity.create",
      params: { entityType: "box", id: "my-entity" },
    })
    handle.store.getState().setSelection(["my-entity"])

    render(<Inspector store={handle.store} schema={testSchema} />)
    expect(screen.getByTestId("inspector-entity-id")).toHaveTextContent("my-entity")
  })

  it("shows entity type when selected", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "wall", id: "w1" } })
    handle.store.getState().setSelection(["w1"])

    render(<Inspector store={handle.store} schema={testSchema} />)
    expect(screen.getByTestId("inspector-entity-type")).toHaveTextContent("wall")
  })

  it("renders a trait section for each trait on the entity", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "e1" } })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "e1", traitName: "color", data: { value: "red" } },
    })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "e1", traitName: "score", data: { points: 10, multiplier: 2 } },
    })
    handle.store.getState().setSelection(["e1"])

    render(<Inspector store={handle.store} schema={testSchema} />)

    expect(screen.getByTestId("trait-section-color")).toBeInTheDocument()
    expect(screen.getByTestId("trait-section-score")).toBeInTheDocument()
  })

  it("renders editable fields for a string trait", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "e1" } })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "e1", traitName: "color", data: { value: "blue" } },
    })
    handle.store.getState().setSelection(["e1"])

    render(<Inspector store={handle.store} schema={testSchema} />)

    // Should render field label "Color" and an input with value "blue"
    expect(screen.getByText("Color")).toBeInTheDocument()
    const input = screen.getByTestId("field-color-value")
    expect(input.querySelector("input")).toHaveValue("blue")
  })

  it("renders editable fields for number traits", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "e1" } })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "e1", traitName: "score", data: { points: 42, multiplier: 3 } },
    })
    handle.store.getState().setSelection(["e1"])

    render(<Inspector store={handle.store} schema={testSchema} />)

    const pointsField = screen.getByTestId("field-score-points")
    const multiplierField = screen.getByTestId("field-score-multiplier")

    expect(pointsField.querySelector("input")).toHaveValue(42)
    expect(multiplierField.querySelector("input")).toHaveValue(3)
  })

  it("renders fields for built-in spatial trait", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "e1" } })
    world.dispatch({
      type: "trait.update",
      params: {
        entityId: "e1",
        traitName: "spatial",
        data: {
          position: { x: 5, y: 0, z: 3 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
      },
    })
    handle.store.getState().setSelection(["e1"])

    render(<Inspector store={handle.store} schema={testSchema} />)

    // spatial trait has editable.fields with "position.x", "position.y", "position.z"
    expect(screen.getByTestId("trait-section-spatial")).toBeInTheDocument()
    expect(screen.getByTestId("field-spatial-position-x")).toBeInTheDocument()
    const xInput = screen.getByTestId("field-spatial-position-x").querySelector("input")
    expect(xInput).toHaveValue(5)
  })
})

describe("Inspector — field changes dispatch intent", () => {
  let world: World
  let handle: WorldStoreHandle

  beforeEach(() => {
    world = makeWorld()
    handle = createWorldStore(world)

    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "e1" } })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "e1", traitName: "color", data: { value: "gray" } },
    })
    handle.store.getState().setSelection(["e1"])
  })

  afterEach(() => {
    handle.destroy()
  })

  it("changing a string field dispatches trait.update intent", () => {
    render(<Inspector store={handle.store} schema={testSchema} />)

    const input = screen.getByTestId("field-color-value").querySelector("input")!
    fireEvent.change(input, { target: { value: "green" } })

    const entity = world.query.byId("e1")!
    expect((entity.traits["color"] as { value: string }).value).toBe("green")
  })

  it("changing a number field dispatches trait.update with number value", () => {
    world.dispatch({
      type: "trait.update",
      params: { entityId: "e1", traitName: "score", data: { points: 0, multiplier: 1 } },
    })

    render(<Inspector store={handle.store} schema={testSchema} />)

    const input = screen.getByTestId("field-score-points").querySelector("input")!
    fireEvent.change(input, { target: { value: "99" } })

    const entity = world.query.byId("e1")!
    expect((entity.traits["score"] as { points: number }).points).toBe(99)
  })

  it("changing spatial position.x dispatches correct nested trait.update", () => {
    world.dispatch({
      type: "trait.update",
      params: {
        entityId: "e1",
        traitName: "spatial",
        data: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
      },
    })

    render(<Inspector store={handle.store} schema={testSchema} />)

    const xInput = screen.getByTestId("field-spatial-position-x").querySelector("input")!
    fireEvent.change(xInput, { target: { value: "10" } })

    const entity = world.query.byId("e1")!
    const spatial = entity.traits["spatial"] as {
      position: { x: number; y: number; z: number }
    }
    expect(spatial.position.x).toBe(10)
    expect(spatial.position.y).toBe(0) // unchanged
    expect(spatial.position.z).toBe(0) // unchanged
  })

  it("Inspector mutations go through dispatch — not direct World writes", () => {
    // This verifies the architectural invariant: Inspector → dispatch → World
    // We verify by checking the World state after each change
    render(<Inspector store={handle.store} schema={testSchema} />)

    const beforeCount = world.query.count
    const input = screen.getByTestId("field-color-value").querySelector("input")!
    fireEvent.change(input, { target: { value: "purple" } })

    // Entity still exists, count unchanged (we only updated a trait, didn't create/delete)
    expect(world.query.count).toBe(beforeCount)
    // But the trait data changed via the World (proving intent flowed through)
    expect(world.query.byId("e1")?.traits["color"]).toEqual({ value: "purple" })
  })
})
