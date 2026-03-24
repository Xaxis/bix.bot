---
name: new-feature
description: Workflow for implementing a new feature in the bix.bot engine or editor. Use when adding a new abstraction, capability, or component to any package.
disable-model-invocation: true
---

# Implementing a New Feature

Follow this workflow for every new feature. Do not skip steps.

## Step 1: Classify the Feature

Ask: which package does this belong in?

- **Engine change** (`packages/engine`): New Trait type, Constraint capability, Intent type, System, Entity behavior, Schema feature, Agent Interface feature. MUST be pure TS, no framework deps.
- **Editor change** (`packages/editor`): New viewport type, palette behavior, inspector widget, toolbar action, chat panel feature. CAN use React, Three.js, Zustand.
- **Schema change** (`packages/schemas/*`): New entity type, domain trait, domain constraint, domain system for a specific domain.
- **App change** (`apps/web`): Routing, pages, API endpoints, persistence.

If it spans multiple packages, implement engine first, then editor, then app.

## Step 2: Design Against Core Abstractions

Before writing code, map the feature onto the 9 core abstractions. Run `/engine-architecture` if you need a refresher.

- Is this a new kind of data on entities? → **Trait**
- Is this a rule between entities? → **Constraint**
- Is this a state change? → **Intent**
- Is this a recurring computation? → **System**
- Is this a visual representation? → **Viewport**
- Is this domain-specific? → **Schema** (not engine)

If it doesn't fit any abstraction, stop and discuss with the user before proceeding. The engine's power comes from everything mapping onto these primitives.

## Step 3: Write Tests First

For engine features:

1. Write a test that creates a World with a minimal Schema
2. Dispatch Intents that exercise the new feature
3. Assert on World state
4. Test undo/redo of the new Intents
5. Test Constraint interactions if applicable

```typescript
// Example test shape
describe("MyNewFeature", () => {
  let world: World

  beforeEach(() => {
    world = World.create(testSchema)
  })

  it("should [expected behavior] when [action]", () => {
    const result = world.dispatch({
      type: "entity.create",
      params: { type: "test-entity" },
      source: "user",
      timestamp: Date.now(),
    })
    expect(result.success).toBe(true)
    // Assert on world state
  })

  it("should undo cleanly", () => {
    world.dispatch(/* ... */)
    world.undo()
    // Assert state matches pre-dispatch
  })
})
```

## Step 4: Implement

- Follow the code style in CLAUDE.md
- Keep functions pure where possible
- Use Zod for any new data structures that cross boundaries
- Emit events for anything the editor layer needs to react to

## Step 5: Verify

```bash
yarn workspace @bix/engine test          # all engine tests pass
yarn workspace @bix/engine typecheck     # no type errors
```

If the feature touches the editor:

```bash
yarn workspace @bix/editor test
yarn workspace @bix/editor typecheck
```

## Step 6: Update Public Exports

If you added a new public-facing capability that Schema authors or editor consumers need:

- Engine: add the export to `packages/engine/src/index.ts`
- Editor: add the export to `packages/editor/src/index.ts`

These packages publish to npm as `@bix/engine` and `@bix/editor`. If it's not in `index.ts`, consumers can't use it. Don't export internals.

## Step 7: Update Schema Types

If you added new engine capabilities (new Trait types, Intent types, etc.), update the Schema TypeScript types so Schema authors get autocompletion.
