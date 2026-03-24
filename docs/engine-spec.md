# bix.bot — Engine Specification

## What Is This?

bix.bot is a **domain-agnostic simulation engine** — a "systems system" that provides the universal abstractions every interactive visual simulation needs. Instead of rebuilding data structures, state management, rendering pipelines, editing UIs, and AI interfaces from scratch for every project, you configure bix.bot with a **Domain Schema** that describes your specific world (cabin builder, asteroid sim, Dyson sphere, neural model, video game — anything).

The engine handles everything that's always the same: entity lifecycle, trait composition, constraint solving, undo/redo, viewport rendering, editor shell, and AI-consumable tool interfaces. The Schema handles everything that's different: what things exist, what properties they have, how they connect, and what rules govern them.

**The name is bix.bot. It will be hosted at bix.bot.**

---

## The Problem This Solves

Every interactive visual simulation project ends up reinventing:

- How to define "things" and their properties
- How things relate and constrain each other
- How to render them (often in multiple views: 2D + 3D)
- How to edit them (selection, placement, manipulation, deletion)
- How to make state manageable (undo/redo, serialization, consistency)
- How to let an AI agent understand and manipulate the system
- How to keep it from crumbling past a certain complexity threshold

The result is always tightly-coupled, inconsistent, fragile. bix.bot eliminates this by providing a **rigid-but-flexible kernel** of abstractions that every simulation domain maps onto cleanly.

---

## Core Abstractions

These are the irreducible primitives. Everything in bix.bot is expressed through these.

### 1. Entity

The universal "thing." An asteroid, a wall, a neuron, a solar panel, a character. Entities are identity containers — they have a unique ID and nothing else intrinsically. They gain meaning entirely through the Traits attached to them.

Entities can be **composed** — an Entity can contain child Entities, forming hierarchical assemblies. A "house" Entity might contain wall, door, and roof Entities. A "solar array" might contain panel Entities. Composition is recursive and first-class. A composed Entity can itself be treated as a single unit, moved, copied, serialized, constrained.

```typescript
// Conceptual shape — not prescriptive implementation
interface Entity {
  id: string
  type: string // from Schema: "wall", "asteroid", "neuron"
  traits: Map<string, Trait> // attached trait instances
  children?: string[] // child entity IDs (composition)
  parent?: string // parent entity ID
}
```

### 2. Trait

A named, typed, validated bundle of data you attach to an Entity. This is the composition mechanism — instead of class hierarchies, Entities are bags of Traits. The domain Schema defines which Traits exist and which Entity types carry them.

Core engine-provided Traits (always available):

- **Spatial** — position, rotation, scale in world space
- **Renderable** — how to draw this thing (mesh ref, material, sprite, SVG shape, LOD rules)
- **Connectable** — snap points, ports, attachment slots for connecting to other Entities
- **Editable** — which properties are exposed to the user, with UI hints (slider, dropdown, color picker, etc.)
- **Metadata** — name, description, tags, user-defined key-value pairs

Domain-specific Traits are defined in the Schema:

- A cabin builder might define: `Structural`, `Insulation`, `LoadBearing`, `Weatherproofing`
- An asteroid sim might define: `Orbital`, `Mass`, `Composition`, `Trajectory`
- A neural model might define: `Activation`, `Weights`, `Layer`, `Threshold`

```typescript
// Conceptual shape
interface TraitDefinition {
  name: string
  schema: ZodSchema // Zod schema for validation + type generation
  defaults: Record<string, any>
  editable?: EditableConfig // UI generation hints
}
```

### 3. Constraint

A declarative rule governing relationships between Entities (or between an Entity and the World). Constraints are the intelligence layer — they encode physics, structural rules, game mechanics, domain logic.

Constraints are:

- **Multi-conditional** — a single Constraint can depend on multiple conditions across multiple Entities and their interconnected relationships
- **Reactive** — when the state they depend on changes, they re-evaluate and may trigger effects (move things, change properties, flag violations, prevent actions)
- **Composable** — Constraints can reference other Constraints
- **Prioritizable** — when Constraints conflict, priority determines which wins
- **Context-sensitive** — a Constraint's behavior can change based on the broader relationship graph (e.g., "a load-bearing wall can be deleted IF no other walls depend on it for structural support, BUT if the roof assembly references it, deletion is blocked unless the roof is reconfigured first")

```typescript
// Conceptual shape
interface ConstraintDefinition {
  name: string
  description: string // human + AI readable
  condition: ConstraintExpr // declarative condition expression
  effect: ConstraintEffect // what happens: enforce, prevent, warn, adjust
  priority?: number
  scope?: "local" | "global" // local = between specific entities, global = world-level invariant
}
```

Examples of Constraints:

- "A door can only attach to a wall" (attachment rule)
- "Two bodies exert gravitational force proportional to mass / distance²" (physics)
- "A neuron fires when summed input exceeds threshold" (behavioral rule)
- "Total roof load must not exceed foundation capacity" (global invariant)
- "Minimum wall length is 2 feet" (property bounds)

### 4. System (Process)

A function that runs on a tick/frame/event, operating on all Entities matching a Trait signature. Systems are the simulation loop — they read state, compute, and emit Intents to mutate state.

```typescript
// Conceptual shape
interface SystemDefinition {
  name: string
  requiredTraits: string[] // only runs on entities with ALL these traits
  phase: "physics" | "constraints" | "rendering" | "custom"
  priority: number // execution order within phase
  update: (entities: Entity[], world: World, dt: number) => Intent[]
}
```

Engine-provided Systems:

- **ConstraintSolver** — evaluates all active Constraints, enforces/warns
- **SpatialIndex** — maintains spatial queries (what's near what, what overlaps)
- **SelectionManager** — tracks what's selected across Viewports

Domain Systems are defined in or alongside the Schema:

- Physics integration (gravity, collision, forces)
- Game logic ticks
- Structural analysis
- Energy flow calculation

### 5. Schema (Domain Definition)

**The most important abstraction.** A Schema is the configuration artifact that turns bix.bot into a specific application. When you say "I want to build a cabin builder," you're authoring a Schema.

A Schema defines:

- **Entity Types** — what kinds of things exist, and which Traits each type carries
- **Trait Definitions** — domain-specific Traits (beyond the engine-provided ones)
- **Constraint Definitions** — all rules governing the domain
- **System Definitions** — domain-specific simulation logic
- **Palette** — what's available in the editor for users to place/create
- **Viewport Configurations** — what visual projections exist (3D scene, 2D plan, graph view, etc.)
- **Intent Catalog** — what actions are possible (auto-derived from Entity Types + Traits, but can be extended)
- **AI Glossary** — domain terminology and descriptions for LLM consumption (auto-derived from above, can be enriched)

```typescript
// Conceptual shape
interface DomainSchema {
  name: string
  version: string
  description: string

  traits: TraitDefinition[]
  entityTypes: EntityTypeDefinition[]
  constraints: ConstraintDefinition[]
  systems: SystemDefinition[]

  palette: PaletteConfig
  viewports: ViewportConfig[]

  // These are auto-derivable but overridable
  intents?: IntentCatalog
  agentGlossary?: AgentGlossary
}
```

Schemas should be authored as TypeScript files (not JSON) so they get full type checking, autocompletion, and can include inline logic for Constraint conditions and System update functions.

### 6. World (Runtime)

The live runtime container. Holds all Entity instances, runs the System loop, maintains the Constraint graph, and owns the canonical state. Single source of truth.

Key responsibilities:

- Entity CRUD (always through Intents)
- System execution loop with deterministic ordering
- Constraint evaluation and enforcement
- Spatial indexing for queries
- Undo/redo stack (via Intent history)
- Serialization/deserialization (save/load)
- Event emission for Viewport and UI subscriptions

The World is a **pure TypeScript class** — no React, no framework dependencies. This is critical. The World is the engine heart and must be portable.

### 7. Viewport

A visual projection of the World. A World can have multiple Viewports — a 3D scene, a 2D floor plan, a graph view, a data table. Each Viewport:

- **Reads** from the World (subscribes to state changes)
- **Renders** its own visual representation
- **Routes interactions** (clicks, drags, hovers) back to the World as Intents
- **Does not own data** — it's a lens, not a source of truth

Viewports are React components that subscribe to World state via Zustand bridges.

### 8. Intent (Action / Command)

**Every mutation to the World goes through an Intent.** No exceptions. No direct state writes.

An Intent is a serializable description of a desired state change: "place wall from A to B," "delete entity X," "set property Y to Z," "group these entities into an assembly."

This is the uniform interface. When a human clicks "place wall" and an AI agent says "place a wall at coordinates...", they both emit the same Intent type. This gives you:

- **Undo/redo** — replay or reverse the Intent stack
- **Event sourcing** — the full history of what happened
- **AI parity** — the agent uses the same operations as the human
- **Validation** — Intents are validated against Constraints before execution
- **Collaboration potential** — Intents can be shared across clients

```typescript
// Conceptual shape
interface Intent {
  type: string // "place", "delete", "update", "group", "ungroup", etc.
  params: Record<string, any> // validated by Zod schema per intent type
  source: "user" | "agent" | "system" // who emitted this
  timestamp: number
}
```

### 9. Agent Interface

A structured, discoverable API layer over the Intent system, designed for LLM consumption. The Agent Interface is **auto-generated from the Schema** — when a Schema declares Entity types, Traits, Constraints, and Intents, the Agent Interface automatically knows what tools are available, what parameters they take, and what the domain vocabulary means.

This means:

- Load a cabin builder Schema → the AI automatically gets tools like `place_wall`, `add_door`, `set_roof_pitch`, `query_floor_area`
- Load an asteroid sim Schema → the AI gets `create_body`, `set_orbit`, `apply_force`, `query_trajectory`
- No manual tool authoring per domain

The Agent Interface exposes:

- **Tool definitions** — Intent types as callable tools with typed parameters (derived from Zod schemas)
- **State queries** — read-only queries into the World ("what entities exist?", "what's connected to X?", "what constraints are violated?")
- **Domain glossary** — what terms mean, what entity types do, what constraints enforce

---

## Architecture Layers

```
┌─────────────────────────────────────────────────┐
│              DOMAIN SCHEMA (TypeScript)          │  ← Authored per-project
│  Entity types, Traits, Constraints, Palette      │
├─────────────────────────────────────────────────┤
│             AGENT INTERFACE LAYER                │  ← Auto-generated from Schema
│  Tool defs, state queries, domain glossary       │
├─────────────────────────────────────────────────┤
│                INTENT BUS                        │  ← Uniform command layer
│  Commands, validation, undo/redo, event log      │
├─────────────────────────────────────────────────┤
│               WORLD (Runtime)                    │  ← Pure TS, no framework deps
│  Entity store, Trait data, Systems loop,         │
│  Constraint graph, spatial index                 │
├─────────────────────────────────────────────────┤
│            VIEWPORT LAYER (1..N)                 │  ← Visual projections
│  3D (Three.js/R3F), 2D (SVG/Canvas), Hybrid     │
├─────────────────────────────────────────────────┤
│            EDITOR SHELL (React/UI)               │  ← Schema-driven UI
│  Palette, inspector, toolbar, chat panel         │
└─────────────────────────────────────────────────┘
```

---

## Design Tenets

These are non-negotiable principles. When in doubt, refer back to these.

1. **Schema-first.** The domain Schema is the single source of truth. UI, AI tools, validation, rendering config — all derived from it. If it's not in the Schema, the engine doesn't know about it.

2. **Mutation only through Intent.** No direct state writes anywhere. Every change is an Intent that flows through validation and lands in the undo stack. This is the wall that prevents spaghetti state.

3. **Traits over inheritance.** Entities are composed via Traits, never via class hierarchies. A "smart wall" is a wall Entity with an extra `Automatable` Trait, not a subclass. Composition is always flat attachment.

4. **Constraints are first-class citizens.** Domain rules are not buried in imperative code scattered across handlers. They are declared, registered, inspectable, and enforced by the engine. This is what prevents the "crumbles past complexity" problem — the Constraint solver handles relational logic, not ad-hoc application code.

5. **Viewports are projections, not owners.** The 3D scene doesn't own data. The 2D plan doesn't own data. They subscribe to the World and render. Interactions route back through Intents. This kills tight coupling between visual layers and state.

6. **AI is a first-class user.** The Agent doesn't use a backdoor API. It emits Intents through the same bus as the human. Its tool definitions are derived from the same Schema. Every feature built for humans automatically works for AI.

7. **Progressive complexity.** A Schema with 3 entity types and 2 constraints should be trivial to author and run. A Schema with 50 entity types, complex multi-conditional constraints, and custom physics should be possible without forking the engine. Complexity scales with the Schema, not with engine modifications.

8. **Pure core, framework at the edges.** The World, Entity store, Constraint solver, and Intent bus are pure TypeScript with zero framework dependencies. React, Three.js, Zustand — these live at the Viewport and Editor Shell layers only. The engine core is portable and testable in isolation.

---

## Tech Stack

### Core Engine (pure TypeScript, no framework deps)

- **TypeScript 5** — strict mode, everything typed
- **Zod 4** — runtime validation for Traits, Intents, Schema definitions. Zod schemas are load-bearing: they validate data AND generate AI tool parameter definitions
- **nanoid or uuid** — entity IDs

### Application Shell

- **Next.js (App Router)** — routing, server components for Schema loading, API routes for persistence
- **React 19** — UI layer
- **Zustand** — UI/Viewport state (NOT World state — Zustand subscribes to the World, doesn't own it)
- **Tailwind CSS** — styling
- **shadcn/ui** — editor shell components (panels, dialogs, dropdowns, sliders, etc.)
- **lucide-react** — icons

### Rendering

- **Three.js + @react-three/fiber + @react-three/drei** — 3D Viewport implementation
- **SVG and/or Canvas** — 2D Viewport implementation
- Viewport implementations are pluggable — the engine doesn't care how you render

### State & History

- **Immer or structuredClone** — immutable snapshots for undo/redo
- Intent history stack managed by the World

### AI / Agent Layer

- Tool definitions auto-generated from Schema + Zod schemas
- Compatible with any tool-calling LLM (OpenAI, Anthropic, etc.)
- Chat panel in the editor shell for conversational interaction

### Build & Dev

- **yarn** — package manager
- **Vitest** — testing
- **Turborepo or similar** — if monorepo structure is needed (likely: `packages/engine`, `packages/editor`, `apps/web`)

---

## Project Structure (Development Monorepo)

This monorepo is the development home for `@bix/engine` and `@bix/editor`. These publish as npm packages. Domain projects (Homescape, etc.) are separate repos that install them as dependencies. See `docs/consumption-model.md` for the full consumption model.

```
bix.bot/
├── packages/
│   ├── engine/                    # Pure TS core — zero framework deps → publishes @bix/engine
│   │   ├── src/
│   │   │   ├── entity/            # Entity, EntityStore, composition
│   │   │   ├── trait/             # Trait system, registry, built-in traits
│   │   │   ├── constraint/        # Constraint definitions, solver, graph
│   │   │   ├── system/            # System runner, built-in systems
│   │   │   ├── intent/            # Intent bus, validation, undo/redo
│   │   │   ├── world/             # World class — ties it all together
│   │   │   ├── schema/            # Schema loader, validator
│   │   │   ├── spatial/           # Spatial index, queries
│   │   │   └── agent/             # Agent interface generator
│   │   ├── index.ts               # Public API — explicit exports only
│   │   └── tests/
│   │
│   ├── editor/                    # React editor shell — reusable across domains → publishes @bix/editor
│   │   ├── src/
│   │   │   ├── components/        # BixEditor, Palette, Inspector, Toolbar, ChatPanel
│   │   │   ├── viewports/         # Viewport base, 3D viewport, 2D viewport
│   │   │   ├── hooks/             # useWorld, useSelection, useIntent, etc.
│   │   │   └── stores/            # Zustand stores for UI state
│   │   ├── index.ts               # Public API — explicit exports only
│   │   └── tests/
│   │
│   ├── create-bix-app/            # CLI scaffolder for new domain projects (Phase 5)
│   │   ├── templates/
│   │   │   ├── default/           # Full starter with example schema
│   │   │   └── minimal/           # Bare schema, no examples
│   │   └── index.ts
│   │
│   └── schemas/                   # Example/test schemas (not published, for testing only)
│       ├── homescape/             # Cabin/home builder schema
│       ├── asteroid-sim/          # Asteroid simulator schema
│       └── _test/                 # Trivial test schema for engine integration tests
│
├── apps/
│   └── web/                       # Next.js app — bix.bot website + editor host
│       ├── app/
│       │   ├── page.tsx           # Landing / schema selector
│       │   ├── editor/[schema]/   # Editor loaded with a specific schema
│       │   └── api/               # Persistence, AI proxy, etc.
│       └── ...
│
├── docs/
│   ├── engine-spec.md             # This file
│   └── consumption-model.md       # How domain projects consume @bix/engine and @bix/editor
│
├── package.json
├── turbo.json
└── tsconfig.base.json
```

---

## Where to Start (Bootstrap Order)

### Phase 1: Engine Kernel

Build the pure TS core in `packages/engine`. No UI yet. Get these working with tests:

1. **Entity + EntityStore** — create, delete, get, parent/child composition
2. **Trait system** — define traits with Zod schemas, attach/detach from entities, validate
3. **Intent bus** — define intents, dispatch, validate params, undo/redo stack
4. **World** — ties Entity store + Trait system + Intent bus together, exposes subscribe-able state
5. **Built-in Traits** — Spatial, Renderable, Connectable, Editable, Metadata
6. **Constraint system** — define constraints, evaluate, enforce/warn
7. **System runner** — register systems, run loop with deterministic ordering
8. **Schema loader** — load a Schema definition, wire up entity types + traits + constraints + systems

Test all of this with a **trivially simple schema** — maybe "colored boxes that snap together" — to prove the abstractions work without domain complexity muddying the water.

### Phase 2: Editor Shell + Viewports

Build the React layer in `packages/editor`:

1. **Zustand bridge** — subscribe to World state, expose to React
2. **3D Viewport** — render entities with Spatial + Renderable traits using R3F
3. **2D Viewport** — render the same entities as SVG/Canvas
4. **Selection system** — click to select in either viewport, shared selection state
5. **Palette** — schema-driven list of placeable entity types
6. **Inspector** — schema-driven property editor for selected entity's editable traits
7. **Toolbar** — undo/redo, delete, group/ungroup
8. **Intent routing** — viewport interactions (click, drag, drop) emit Intents

### Phase 3: Agent Interface

Build the AI layer in `packages/engine/src/agent`:

1. **Tool generator** — given a Schema, produce tool definitions (name, description, parameters from Zod)
2. **State query API** — structured queries into World state
3. **Chat panel** — editor component that sends/receives messages, agent emits Intents
4. **Glossary generator** — human+AI readable domain dictionary from Schema

### Phase 4: First Real Schema — Homescape

Author the Homescape schema in `packages/schemas/homescape`:

1. Define entity types: Wall, Door, Window, Floor, Roof, Pillar, Staircase, etc.
2. Define domain traits: Structural, Dimensional, Material, LoadBearing
3. Define constraints: attachment rules, structural integrity, minimum dimensions, snap behavior
4. Define palette and viewport configs
5. Pressure-test every engine abstraction against real domain requirements
6. Iterate on the engine when the Schema reveals gaps

---

## Key Design Decisions to Make Early

These are open questions the implementer should resolve during Phase 1:

- **Constraint expression language**: How are Constraint conditions expressed? Pure functions? A mini DSL? Declarative rule objects? Recommend starting with pure functions (most flexible) with the option to add a declarative layer later.

- **Trait storage**: Column-oriented (SoA) for performance, or row-oriented (AoS) for simplicity? Start with row-oriented (Map per entity) and optimize later if needed.

- **Intent granularity**: Should compound operations (e.g., "place a pre-built room") be a single Intent or a batch of atomic Intents? Recommend: support both — atomic Intents for the bus, with a "transaction" wrapper that groups them for undo purposes.

- **Serialization format**: JSON is obvious for save/load. But should the World be event-sourced (replay Intents from scratch) or snapshot-based (serialize current state)? Recommend: snapshot-based for saves, with Intent log available for undo/redo within a session.

- **Viewport abstraction boundary**: How much does the engine know about rendering? Recommend: the engine knows nothing. It provides Spatial + Renderable trait data. The Viewport layer interprets Renderable however it wants (could be Three.js meshes, SVG paths, ASCII art — doesn't matter).

- **Public API surface**: `@bix/engine` and `@bix/editor` will be consumed as npm packages by separate domain projects. This means: explicit `index.ts` entry points, no leaking internals, World accepted as prop/param not global singleton, Schema type helpers (`defineSchema`, `defineTrait`, etc.) importable without pulling the entire engine. See `docs/consumption-model.md`.

---

## What Success Looks Like

When bix.bot is working, starting a new project looks like this:

1. Run `npx create-bix-app my-dyson-sphere`
2. Open `schema/` and author your entity types, traits, and constraints
3. Run `yarn dev` — the editor loads with the right palette, inspector fields, and AI tools automatically
4. Build custom viewport renderers in `viewports/` if the defaults don't suffice
5. Start placing entities, and constraints enforce your domain rules immediately
6. Tell the AI agent "place a ring of 12 solar panels at radius 100" and it works — because it read the Schema
7. When you improve the engine, every project gets the fix on `yarn upgrade`

No re-architecting. No new state management. No new undo system. No new data model. Just: install, define your domain, go.

See `docs/consumption-model.md` for the full details on how domain projects consume `@bix/engine` and `@bix/editor` as npm packages.
