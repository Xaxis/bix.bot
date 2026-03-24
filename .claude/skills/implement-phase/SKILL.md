---
name: implement-phase
description: Bootstrap phases for building bix.bot from scratch. Use when starting a new phase of engine development or when the user says to begin building, scaffold, or bootstrap the project.
disable-model-invocation: true
---

# bix.bot Bootstrap Phases

This project is built in phases. Each phase must be solid before moving to the next. Read `docs/engine-spec.md` for full context.

## Phase 1: Engine Kernel (packages/engine)

Build the pure TS core. No UI. Everything tested.

### 1a. Project Scaffolding
```bash
# Monorepo setup with Turborepo
yarn init -w
# Create packages
mkdir -p packages/engine/src packages/editor/src packages/schemas apps/web
# Engine package.json
cd packages/engine && yarn init
# Add core deps
yarn add zod nanoid
yarn add -D vitest typescript @types/node
```

Turborepo config, shared tsconfig with strict mode, vitest config.

### 1b. Entity + EntityStore
Implement in `packages/engine/src/entity/`:
- `Entity` interface
- `EntityStore` class: create, get, delete, list, getByType
- Parent/child composition: addChild, removeChild, getChildren, getParent
- Tests: CRUD, composition, ID generation

### 1c. Trait System
Implement in `packages/engine/src/trait/`:
- `TraitDefinition` interface (with Zod schema)
- `TraitRegistry`: register definitions, lookup by name
- `TraitInstance`: attach to entity, validate with Zod, get/set data
- Built-in traits: Spatial, Renderable, Connectable, Editable, Metadata
- Tests: define trait, attach to entity, validate, reject bad data, get/set

### 1d. Intent Bus
Implement in `packages/engine/src/intent/`:
- `Intent` interface
- `IntentRegistry`: register intent types with Zod param schemas
- `IntentBus`: dispatch, validate params, execute handler, push to history
- Undo/redo stack: push on dispatch, pop on undo, track inverse intents
- Built-in intents: `entity.create`, `entity.delete`, `trait.update`, `entity.reparent`
- Tests: dispatch, validate, undo, redo, invalid params rejected

### 1e. World
Implement in `packages/engine/src/world/`:
- `World` class: ties EntityStore + TraitRegistry + IntentBus together
- `dispatch(intent)`: validate → execute → constrain → push history → emit event
- `query(q)`: read-only entity queries (byType, byTrait, byId)
- `subscribe(fn)`: event subscription for external consumers
- `serialize() / deserialize()`: snapshot the full world state
- `tick(dt)`: run all systems
- Tests: full round-trip (create entity → set traits → query → undo → verify rollback)

### 1f. Constraint System
Implement in `packages/engine/src/constraint/`:
- `ConstraintDefinition` interface
- `ConstraintGraph`: register constraints, track which entities they watch
- `ConstraintSolver`: after each intent batch, evaluate affected constraints
- Constraint effects: prevent (reject intent), warn (allow but flag), adjust (modify state), enforce (maintain invariant)
- Tests: constraint prevents invalid mutation, constraint warns, constraint allows valid mutation, multi-conditional constraint, priority resolution

### 1g. System Runner
Implement in `packages/engine/src/system/`:
- `SystemDefinition` interface
- `SystemRunner`: register systems, sort by phase + priority, tick all
- Tests: systems execute in correct order, systems only process matching entities

### 1h. Schema Loader
Implement in `packages/engine/src/schema/`:
- `DomainSchema` interface
- `defineSchema`, `defineTrait`, `defineEntityType`, `defineConstraint` helpers
- Schema validation (Zod): ensure all referenced traits exist, entity types reference valid traits, etc.
- `loadSchema(schema)`: registers all traits, entity types, constraints, systems with the World
- Tests: load valid schema, reject invalid schema (missing trait reference, etc.)

### 1i. Test Schema
Create a trivially simple test schema in `packages/schemas/_test/`:
- 3 entity types: Box, Connector, Label
- 2 domain traits: Color, Size
- 2 constraints: "Connectors can only attach to Boxes", "Boxes must be at least size 1"
- Use this schema to integration-test the entire engine

**Phase 1 exit criteria**: All engine tests pass. You can create a World from a Schema, dispatch Intents to create entities with traits, constraints enforce rules, undo/redo works, serialize/deserialize round-trips. Zero framework dependencies.

## Phase 2: Editor Shell + Viewports (packages/editor)

### 2a. Zustand Bridge
- Create a Zustand store that wraps a World instance
- Subscribe to World events, expose reactive state to React
- Expose dispatch function for Intent emission from UI

### 2b. 3D Viewport
- R3F component that reads Spatial + Renderable traits from World
- Renders entities as meshes (boxes initially, refineable later)
- Click/hover → selection (emits Intent or updates UI state)
- Camera controls (orbit, pan, zoom)

### 2c. 2D Viewport
- SVG or Canvas component reading same World state
- Top-down view of entities with Spatial traits
- Click/drag → selection, placement (emits Intents)

### 2d. Editor Shell
- Layout: sidebar (palette + inspector) + main area (viewports) + optional chat panel
- Palette: reads Schema entityTypes, shows placeable types grouped by palette categories
- Inspector: reads selected entity's editable traits, renders widgets per field config
- Toolbar: undo/redo buttons, delete, group/ungroup

### 2e. Interaction Flow
- Palette click → enter "placement mode" → viewport click → emit `entity.create` Intent with Spatial position
- Entity click → select → Inspector shows properties
- Inspector edit → emit `trait.update` Intent
- Delete button → emit `entity.delete` Intent
- All interactions go through Intents. No direct state mutation from UI.

**Phase 2 exit criteria**: You can load a Schema, see entities in 3D and 2D, place new entities from palette, edit properties in inspector, undo/redo from toolbar. All interactions go through Intents. All public-facing components and hooks are exported from `packages/editor/src/index.ts`.

**IMPORTANT**: Before starting Phase 2, read `docs/consumption-model.md`. The editor publishes as `@bix/editor` on npm. All public components, hooks, and stores must be exported through a single `src/index.ts` entry point. The `BixEditor` top-level component accepts World as a prop — no global singletons. Consumers must be able to import individual pieces (`Palette`, `Inspector`, `Viewport3D`) for custom layouts.

## Phase 3: Agent Interface (packages/engine/src/agent)

### 3a. Tool Generator
- Given a Schema, produce tool definitions (name, description, parameters)
- Intent types become tools: `entity.create` → `create_[entityType]` per entity type
- Trait fields become tool parameters with types from Zod schemas

### 3b. State Queries
- `list_entities(type?)`: list all entities, optionally filtered
- `get_entity(id)`: get entity with all trait data
- `get_connections(id)`: what's connected to this entity
- `get_violations()`: current constraint violations

### 3c. Chat Panel
- Editor component: text input + message history
- Send user message → LLM → tool calls → Intents → World mutations
- Agent sees same state as user, acts through same Intents

**Phase 3 exit criteria**: Load Schema → AI agent can list available actions, create entities, query state, all through the Intent system.

## Phase 4: First Real Schema — Homescape

This is the capstone that proves every engine abstraction holds up against real domain complexity. See `/schema-authoring` skill for Schema authoring patterns — it has Homescape-specific code examples.

### 4a. Schema Definition
Create `packages/schemas/homescape/` with the standard structure:

```
packages/schemas/homescape/
├── index.ts              # defineSchema() — assembles everything
├── traits.ts             # Structural, Dimensional
├── entities.ts           # Wall, Door, Window, Floor, Roof, Pillar
├── constraints.ts        # All domain rules
└── README.md             # Domain description
```

Entity types and their traits:
- **Wall**: Spatial, Renderable, Connectable, Editable, Structural, Dimensional
- **Door**: Spatial, Renderable, Connectable, Editable, Dimensional (must attach to walls)
- **Window**: Spatial, Renderable, Connectable, Editable, Dimensional (must attach to walls)
- **Floor**: Spatial, Renderable, Editable, Dimensional (defines room footprint)
- **Roof**: Spatial, Renderable, Editable, Dimensional, Structural
- **Pillar**: Spatial, Renderable, Editable, Structural

Domain traits:
- **Structural**: loadBearing (boolean), material (enum: wood/steel/concrete/brick), thickness (number 0.1-2.0m)
- **Dimensional**: width, height, length (numbers)

Constraints (minimum set):
- door-requires-wall (prevent): door parent must be a wall
- window-requires-wall (prevent): window parent must be a wall
- wall-min-length (prevent): wall Dimensional.length >= 0.5m
- door-fits-in-wall (prevent): door width <= parent wall length
- load-bearing-deletion-blocked (prevent): can't delete load-bearing wall with roof/floor dependents
- roof-needs-support (warn): roof without wall connections

Palette categories: Structure (wall, pillar, floor), Openings (door, window), Roof (roof).
Viewports: 2D floor plan (svg) + 3D view (three).

### 4b. Integration Tests
Write tests in `packages/schemas/homescape/homescape.test.ts` that exercise the FULL engine stack against this schema:

1. **World creation**: create World from homescape schema, verify all entity types placeable
2. **Constraint enforcement**: place walls, try attaching door to non-wall (blocked), try too-short wall (blocked), valid door-in-wall (allowed)
3. **Multi-conditional constraints**: load-bearing wall with roof child can't be deleted, non-load-bearing can
4. **Agent tools**: use executeAgentTool to build a simple room (4 walls + door + roof), verify entities exist with correct traits
5. **Glossary**: generateGlossary(schema) mentions all entity types and constraints
6. **Serialize/deserialize**: build a scene, serialize, deserialize into new World, verify full fidelity + constraints still active
7. **Undo/redo**: build scene, undo multiple steps, redo, verify state consistency

### 4c. Gap Documentation
If any engine abstraction doesn't fit the Homescape domain cleanly, document the gap in a comment or README rather than hacking around it. These gaps become Phase 1 iteration items.

**Phase 4 exit criteria**: Homescape schema loads, constraints enforce domain rules, agent can build a room via tool calls, full serialize/deserialize round-trip works. Any engine gaps documented.

## Phase 5: create-bix-app CLI (packages/create-bix-app)

Only start this AFTER Phases 1-4 are proven. See `docs/consumption-model.md` for full spec.

- Simple Node.js CLI: `npx create-bix-app my-project`
- Copies template directory, replaces placeholders (project name, description)
- Generates project with `@bix/engine` + `@bix/editor` as deps, starter schema, Next.js app shell, auto-generated CLAUDE.md and skills
- Two templates: `default` (with example entities/constraints) and `minimal` (bare)
- Publish `@bix/engine` and `@bix/editor` to npm before this phase

**Phase 5 exit criteria**: Run `npx create-bix-app my-test`, `cd my-test`, `yarn dev` — editor loads with starter schema, placement works, AI agent works.