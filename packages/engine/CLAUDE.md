# packages/engine

Pure TypeScript simulation kernel. ZERO framework dependencies. If you're importing from React, Three.js, Zustand, or Next.js — STOP. You're in the wrong package.

## Module Map

```
src/entity/       Entity, EntityStore, composition (parent/child)
src/trait/         TraitDefinition, TraitRegistry, TraitInstance, built-in traits
src/constraint/    ConstraintDefinition, ConstraintGraph, ConstraintSolver
src/system/        SystemDefinition, SystemRunner
src/intent/        Intent, IntentRegistry, IntentBus, undo/redo
src/world/         World class — ties everything together
src/schema/        DomainSchema, defineSchema/defineTrait/defineEntityType helpers
src/spatial/       SpatialIndex — spatial queries (nearest, overlapping, etc.)
src/agent/         Agent interface generator — auto-creates tool defs from Schema
```

## Public API

This package publishes as `@bix/engine` on npm. Domain projects install it as a dependency. This means:

- All public exports go through `src/index.ts`. If it's not exported there, it's internal.
- Do NOT export internal implementation details (stores, graphs, indices). Export the World class, Schema authoring helpers (`defineSchema`, `defineTrait`, `defineEntityType`, `defineConstraint`, `defineSystem`), built-in traits, types, and the agent interface generator.
- World must work as an instance passed around, never as a global singleton. Consumers create it with `World.create(schema)`.
- See `docs/consumption-model.md` for the full picture.

## Patterns

Every exported function and class should be typed with explicit return types. Use Zod schemas as the canonical type source — derive TypeScript types from them with `z.infer<>` rather than maintaining parallel type definitions.

```typescript
// Good: Zod schema is the source of truth
const SpatialSchema = z.object({
  position: Vec3Schema,
  rotation: QuatSchema,
  scale: Vec3Schema,
})
type SpatialData = z.infer<typeof SpatialSchema>

// Bad: separate interface that might drift from validation
interface SpatialData {
  position: Vec3
  rotation: Quat
  scale: Vec3
}
```

Constraint evaluate functions receive a `ConstraintContext` — read-only access to the world. They must NEVER mutate state directly. They return a `ConstraintResult` describing validity and violations. The engine handles enforcement.

Intent handlers receive the World and Intent params. They perform the mutation and return an inverse Intent for undo. If they can't produce an inverse, undo is not supported for that intent type (document this clearly).

## Testing

```bash
yarn test              # run all tests
yarn test src/entity   # run entity tests only
yarn test --watch      # watch mode
```

Every module must have tests. Test files sit next to source files. Tests should create a World with a minimal test schema, dispatch intents, and assert on state. Never mock the World — use the real thing with a test schema.
