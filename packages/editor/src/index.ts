/**
 * @bix/editor — Public API Surface
 *
 * This is the single entry point for consumers of the bix.bot editor.
 * Import everything you need from here.
 *
 * ```typescript
 * import { BixEditor, createWorldStore, Viewport3D, Viewport2D, useWorld } from "@bix/editor"
 * import { World } from "@bix/engine"
 *
 * const world = World.create(mySchema)
 *
 * // Batteries-included:
 * export default function App() {
 *   return <BixEditor world={world} schema={mySchema} />
 * }
 *
 * // Custom layout (hooks require WorldStoreProvider):
 * export function MyLayout() {
 *   return (
 *     <WorldStoreProvider world={world}>
 *       <Palette schema={schema} />
 *       <Viewport3D />
 *     </WorldStoreProvider>
 *   )
 * }
 * ```
 */

// ── Zustand bridge ────────────────────────────────────────────────

export { createWorldStore } from "./stores/world-store.js"

export type {
  WorldStoreState,
  WorldStoreHandle,
  ActiveTool,
} from "./stores/world-store.js"

// ── React context + hooks ─────────────────────────────────────────
// Hooks require <WorldStoreProvider> (or <BixEditor>) in the tree.

export { WorldStoreProvider } from "./hooks/world-context.js"
export type { WorldStoreProviderProps } from "./hooks/world-context.js"

export {
  useWorld,
  useWorldStore,
  useSelection,
  useIntent,
  useEntities,
  useConstraintViolations,
} from "./hooks/hooks.js"

// ── Components ────────────────────────────────────────────────────

export { default as BixEditor } from "./components/BixEditor.js"
export { Palette } from "./components/Palette.js"
export { Inspector } from "./components/Inspector.js"
export { Toolbar } from "./components/Toolbar.js"

export type { BixEditorProps } from "./components/BixEditor.js"
export type { PaletteProps } from "./components/Palette.js"
export type { InspectorProps } from "./components/Inspector.js"
export type { ToolbarProps } from "./components/Toolbar.js"

// ── Viewports ─────────────────────────────────────────────────────

export { default as Viewport3D } from "./viewports/Viewport3D.js"
export { default as Viewport2D } from "./viewports/Viewport2D.js"

export type { Viewport3DProps } from "./viewports/Viewport3D.js"
export type { Viewport2DProps } from "./viewports/Viewport2D.js"
