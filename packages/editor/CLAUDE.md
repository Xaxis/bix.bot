# packages/editor

React + Three.js + Zustand visual layer. This package renders the World and routes user interactions back as Intents. It NEVER owns entity data — the World in `@bix/engine` is the single source of truth.

## Module Map

```
src/components/     React UI components (Palette, Inspector, Toolbar, ChatPanel)
src/viewports/      Viewport implementations (Viewport3D, Viewport2D, ViewportBase)
src/hooks/          React hooks (useWorld, useSelection, useIntent, useEntities)
src/stores/         Zustand stores (UI state only — selection, active tool, panel visibility)
```

## Key Principle: Zustand is for UI State, Not World State

The World lives in `@bix/engine`. Zustand stores here manage:

- What's selected
- Which tool is active (place, select, delete)
- Panel open/closed states
- Camera position (per viewport)

NEVER duplicate World state into Zustand. Subscribe to the World and derive what you need.

```typescript
// Good: hook reads from World
function useEntityTraits(entityId: string) {
  const world = useWorld()
  return useSyncExternalStore(
    (cb) => world.subscribe(cb),
    () => world.getEntity(entityId)?.traits,
  )
}

// Bad: copying World state into Zustand
const useStore = create((set) => ({
  entities: [], // NO — this duplicates World state
}))
```

## Component Guidelines

- Use shadcn/ui for all form controls, dialogs, dropdowns, panels.
- Use Tailwind for layout and spacing.
- Use lucide-react for icons.
- Components receive entity data via hooks, never via props drilled from World state.
- All user actions that change entities MUST dispatch Intents. Never call World methods directly from components.

## Viewports

Viewports are React components that subscribe to World state and render. They should:

1. Subscribe to World events (entity created, deleted, trait updated)
2. Render entities that have Spatial + Renderable traits
3. Handle mouse/touch/keyboard interactions
4. Convert interactions to Intents and dispatch them
5. NOT own any entity state locally

3D Viewport uses `@react-three/fiber` and `@react-three/drei`.
2D Viewport uses SVG or Canvas — whichever is simpler for the domain.
