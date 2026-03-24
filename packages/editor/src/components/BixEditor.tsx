import React, { useMemo, useEffect } from "react"
import { type World, type DomainSchema } from "@bix/engine"
import { createWorldStore } from "../stores/world-store.js"
import { WorldStoreProvider } from "../hooks/world-context.js"
import Viewport3D from "../viewports/Viewport3D.js"
import Viewport2D from "../viewports/Viewport2D.js"
import { Palette } from "./Palette.js"
import { Inspector } from "./Inspector.js"
import { Toolbar } from "./Toolbar.js"

export interface BixEditorProps {
  /** The World instance this editor manages. */
  world: World
  /** The schema that describes the domain. */
  schema: DomainSchema
  /** Optional CSS class for the root container. */
  className?: string
}

/**
 * BixEditor — the batteries-included editor shell.
 *
 * Composes Toolbar, Palette, Inspector, Viewport3D, and Viewport2D
 * into a full editor layout. Creates and owns the Zustand store
 * internally — consumers just pass a World and a Schema.
 *
 * ```tsx
 * import { BixEditor } from "@bix/editor"
 * import { World } from "@bix/engine"
 * import mySchema from "./schema"
 *
 * const world = World.create(mySchema)
 * export default function App() {
 *   return <BixEditor world={world} schema={mySchema} />
 * }
 * ```
 *
 * For custom layouts, import the individual components and create
 * the store manually with `createWorldStore(world)`.
 */
export default function BixEditor({
  world,
  schema,
  className = "",
}: BixEditorProps): JSX.Element {
  // Create the Zustand store for this World instance.
  // useMemo ensures one store per world reference.
  const { store, destroy } = useMemo(() => createWorldStore(world), [world])

  // Unsubscribe from World events on unmount or world change.
  useEffect(() => destroy, [destroy])

  return (
    <WorldStoreProvider world={world}>
      <div
        data-testid="bix-editor"
        className={`bix-editor ${className}`}
        style={{ display: "flex", flexDirection: "column", height: "100%" }}
      >
        {/* Top toolbar */}
        <Toolbar store={store} />

        {/* Main body: sidebar + viewports */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left sidebar */}
          <aside
            data-testid="bix-editor-sidebar"
            style={{
              width: 220,
              display: "flex",
              flexDirection: "column",
              overflow: "auto",
            }}
          >
            <Palette store={store} schema={schema} />
            <Inspector store={store} schema={schema} />
          </aside>

          {/* Viewport area */}
          <main
            data-testid="bix-editor-main"
            style={{ flex: 1, display: "flex", flexDirection: "column" }}
          >
            <Viewport3D store={store} className="bix-viewport-3d" style={{ flex: 1 }} />
            <Viewport2D store={store} className="bix-viewport-2d" />
          </main>
        </div>
      </div>
    </WorldStoreProvider>
  )
}
