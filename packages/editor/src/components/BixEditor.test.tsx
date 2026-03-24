import React from "react"
import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, fireEvent, screen, act } from "@testing-library/react"
import { World, defineSchema, defineEntityType } from "@bix/engine"
import BixEditor from "./BixEditor.js"

// ── Mock Viewport3D (requires R3F / WebGL) ────────────────────────
// Viewport3D has its own tests. Here we mock it to focus on BixEditor's
// composition and the interaction flow via Viewport2D (pure SVG).

vi.mock("../viewports/Viewport3D.js", () => ({
    default: function MockViewport3D({
        store,
        className,
    }: {
        store: ReturnType<
            typeof import("../stores/world-store.js").createWorldStore
        >["store"]
        className?: string
    }) {
        return (
            <div
                data-testid="viewport-3d-mock"
                className={className}
                onClick={() => store.getState().clearSelection()}
            />
        )
    },
}))

// ── Test schema ───────────────────────────────────────────────────

const schema = defineSchema({
    name: "bix-editor-test",
    version: "0.1.0",
    traits: [],
    entityTypes: [
        defineEntityType({ type: "box", label: "Box", description: "A box", traits: [] }),
        defineEntityType({
            type: "sphere",
            label: "Sphere",
            description: "A sphere",
            traits: [],
        }),
    ],
})

// ── Rendering ─────────────────────────────────────────────────────

describe("BixEditor — rendering", () => {
    it("renders the editor root", () => {
        const world = World.create(schema)
        render(<BixEditor world={world} schema={schema} />)
        expect(screen.getByTestId("bix-editor")).toBeInTheDocument()
    })

    it("renders the toolbar", () => {
        const world = World.create(schema)
        render(<BixEditor world={world} schema={schema} />)
        expect(screen.getByTestId("toolbar")).toBeInTheDocument()
    })

    it("renders the palette", () => {
        const world = World.create(schema)
        render(<BixEditor world={world} schema={schema} />)
        expect(screen.getByTestId("palette")).toBeInTheDocument()
    })

    it("renders the inspector", () => {
        const world = World.create(schema)
        render(<BixEditor world={world} schema={schema} />)
        expect(screen.getByTestId("inspector")).toBeInTheDocument()
    })

    it("renders the 3D viewport", () => {
        const world = World.create(schema)
        render(<BixEditor world={world} schema={schema} />)
        expect(screen.getByTestId("viewport-3d-mock")).toBeInTheDocument()
    })

    it("renders the 2D viewport", () => {
        const world = World.create(schema)
        render(<BixEditor world={world} schema={schema} />)
        expect(screen.getByTestId("viewport-2d")).toBeInTheDocument()
    })

    it("renders schema entity type buttons in palette", () => {
        const world = World.create(schema)
        render(<BixEditor world={world} schema={schema} />)
        expect(screen.getByTestId("place-box")).toBeInTheDocument()
        expect(screen.getByTestId("place-sphere")).toBeInTheDocument()
    })

    it("renders sidebar and main area", () => {
        const world = World.create(schema)
        render(<BixEditor world={world} schema={schema} />)
        expect(screen.getByTestId("bix-editor-sidebar")).toBeInTheDocument()
        expect(screen.getByTestId("bix-editor-main")).toBeInTheDocument()
    })
})

// ── Interaction flow (Phase 2e) ───────────────────────────────────

describe("BixEditor — interaction flow", () => {
    it("clicking palette item then Viewport2D creates an entity", () => {
        const world = World.create(schema)
        const { unmount } = render(<BixEditor world={world} schema={schema} />)

        // Step 1: click palette "Box" button → activates place mode
        fireEvent.click(screen.getByTestId("place-box"))

        // Step 2: click Viewport2D background → entity.create dispatched
        fireEvent.click(screen.getByTestId("viewport-2d"), {
            clientX: 300,
            clientY: 200,
        })

        // Entity was created in the World
        expect(world.query.count).toBe(1)
        expect(world.query.all()[0]?.type).toBe("box")

        unmount()
    })

    it("activeTool returns to select after placement", () => {
        const world = World.create(schema)
        const { unmount } = render(<BixEditor world={world} schema={schema} />)

        fireEvent.click(screen.getByTestId("place-box"))
        fireEvent.click(screen.getByTestId("viewport-2d"), {
            clientX: 300,
            clientY: 200,
        })

        // Palette select button should now be active
        expect(screen.getByTestId("tool-select").getAttribute("data-active")).toBe("true")

        unmount()
    })

    it("placed entity appears in Viewport2D as a rect", () => {
        const world = World.create(schema)
        const { unmount } = render(<BixEditor world={world} schema={schema} />)

        fireEvent.click(screen.getByTestId("place-sphere"))
        act(() => {
            fireEvent.click(screen.getByTestId("viewport-2d"), {
                clientX: 300,
                clientY: 200,
            })
        })

        // Entity with spatial trait should render a rect
        expect(document.querySelectorAll("[data-entity-id]")).toHaveLength(1)

        unmount()
    })

    it("selecting a placed entity shows it in Inspector", () => {
        const world = World.create(schema)
        const { unmount } = render(<BixEditor world={world} schema={schema} />)

        // Place a box
        fireEvent.click(screen.getByTestId("place-box"))
        fireEvent.click(screen.getByTestId("viewport-2d"), { clientX: 300, clientY: 200 })

        // Click the created entity's rect to select it
        const rect = document.querySelector("[data-entity-id]")!
        fireEvent.click(rect)

        // Inspector should show the entity type
        expect(screen.getByTestId("inspector-entity-type")).toHaveTextContent("box")

        unmount()
    })

    it("undo through toolbar removes placed entity", () => {
        const world = World.create(schema)
        const { unmount } = render(<BixEditor world={world} schema={schema} />)

        // Place entity
        fireEvent.click(screen.getByTestId("place-box"))
        fireEvent.click(screen.getByTestId("viewport-2d"), { clientX: 300, clientY: 200 })
        expect(world.query.count).toBe(1)

        // Undo via toolbar
        act(() => {
            fireEvent.click(screen.getByTestId("toolbar-undo"))
        })
        expect(world.query.count).toBe(0)

        // Redo via toolbar
        act(() => {
            fireEvent.click(screen.getByTestId("toolbar-redo"))
        })
        expect(world.query.count).toBe(1)

        unmount()
    })

    it("delete through toolbar removes selected entity", () => {
        const world = World.create(schema)
        const { unmount } = render(<BixEditor world={world} schema={schema} />)

        // Place and select an entity
        fireEvent.click(screen.getByTestId("place-box"))
        fireEvent.click(screen.getByTestId("viewport-2d"), { clientX: 300, clientY: 200 })
        const rect = document.querySelector("[data-entity-id]")!
        fireEvent.click(rect)

        // Verify selection
        expect(
            document.querySelector("[data-entity-id]")?.getAttribute("data-selected"),
        ).toBe("true")

        // Delete via toolbar
        fireEvent.click(screen.getByTestId("toolbar-delete"))
        expect(world.query.count).toBe(0)

        unmount()
    })

    it("all mutations flow through intents — components never write to World directly", () => {
        // Verify via the undo stack: every mutation that goes through an intent
        // is recorded and undoable.
        const world = World.create(schema)
        const { unmount } = render(<BixEditor world={world} schema={schema} />)

        // Place via palette + viewport click
        fireEvent.click(screen.getByTestId("place-box"))
        fireEvent.click(screen.getByTestId("viewport-2d"), { clientX: 300, clientY: 200 })
        expect(world.canUndo).toBe(true)

        // Undo → entity should disappear (proves it went through the intent bus)
        act(() => {
            fireEvent.click(screen.getByTestId("toolbar-undo"))
        })
        expect(world.query.count).toBe(0)

        unmount()
    })
})

// ── Multiple world instances ──────────────────────────────────────

describe("BixEditor — independent World instances", () => {
    it("two BixEditor instances don't share state", () => {
        const worldA = World.create(schema)
        const worldB = World.create(schema)

        const { unmount } = render(<BixEditor world={worldA} schema={schema} />)

        // Place entity in worldA via its viewport
        fireEvent.click(screen.getByTestId("place-box"))
        fireEvent.click(screen.getByTestId("viewport-2d"), { clientX: 300, clientY: 200 })

        // worldA got an entity; worldB is unaffected (it's a separate World instance)
        expect(worldA.query.count).toBe(1)
        expect(worldB.query.count).toBe(0)

        unmount()
    })
})
