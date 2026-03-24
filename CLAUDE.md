# bix.bot

Domain-agnostic simulation engine. Turns domain schemas into interactive visual editors with AI agent interfaces. Monorepo with three packages: `engine` (pure TS core), `editor` (React shell), `schemas` (domain definitions).

## Commands

```bash
yarn install                          # install all deps
yarn workspace @bix/engine build      # build engine
yarn workspace @bix/engine test       # run engine tests
yarn workspace @bix/engine test src/entity  # test single module
yarn workspace @bix/editor dev        # dev server for editor
yarn workspace @bix/web dev           # dev server for Next.js app
yarn turbo run build                  # build all packages
yarn turbo run test                   # test all packages
yarn turbo run typecheck              # typecheck all packages
```

## Project Structure

```
packages/engine/src/     # Pure TS, zero framework deps. This is the kernel.
packages/editor/src/     # React + Three.js + Zustand. Visual layer only.
packages/schemas/         # Domain schema definitions (one dir per domain).
apps/web/                # Next.js app shell. Routes, API, hosting.
docs/                    # Architecture docs. Read before large changes.
```

## Code Style

- TypeScript strict mode everywhere. No `any`. No `as` casts unless truly unavoidable with a `// SAFETY:` comment.
- Pure functions by default. Classes only for World, EntityStore, and System runners where stateful encapsulation is warranted.
- Zod schemas are load-bearing — they validate data AND generate AI tool definitions. Never skip validation.
- Use `nanoid()` for entity IDs, never sequential integers.
- Imports: named imports, no default exports except React components.
- No barrel files (`index.ts` re-exports). Direct imports only.

## Architecture Rules — DO NOT VIOLATE

- **`packages/engine` has ZERO framework dependencies.** No React, no Three.js, no Zustand, no Next.js. If you need to import from these, you're in the wrong package. The engine must be testable with just `vitest`.
- **All World mutations go through Intents.** Never write directly to entity state. Emit an Intent, let the World process it. This gives us undo/redo, AI parity, and event sourcing.
- **Entities are composed via Traits, never inheritance.** No class hierarchies for entity types. An entity is a bag of Traits. Period.
- **Viewports don't own data.** They subscribe to World state and render. Interactions in viewports emit Intents back to the World. No local state that shadows World state.
- **Schema is the source of truth.** If a behavior isn't derivable from the Schema, it shouldn't exist in the engine.

## Testing

- Use `vitest` with `describe/it/expect`. No `jest`.
- Test files live next to source: `entity.ts` → `entity.test.ts`
- Engine tests must be pure unit tests — no DOM, no canvas, no framework.
- Test Intents round-trip: dispatch → verify state change → undo → verify rollback.
- Test Constraints: set up entities → verify constraint passes/fails → mutate → verify re-evaluation.

## Git

- NEVER make git commits, git add, or any git write operations. The user commits manually when satisfied.
- When the user commits, they use conventional commits: `feat(engine):`, `fix(editor):`, `refactor(engine):`, `docs:`, `test:`.
- Never commit `node_modules/`, `.next/`, `dist/`, or generated files.

## Boundaries

- NEVER make git commits. The user commits manually. This is absolute.
- NEVER add framework deps to `packages/engine`. This is the #1 rule.
- NEVER mutate World state outside of an Intent handler.
- NEVER put rendering logic in the engine. The engine provides data; viewports render.
- NEVER hardcode domain-specific logic (cabin builder, asteroid sim, etc.) in the engine. If it's domain-specific, it belongs in a Schema.
- NEVER use `localStorage`, `sessionStorage`, or browser APIs in the engine.
