---
name: engine-architecture
description: Core engine abstractions and architecture for bix.bot. Use when implementing engine features, designing new abstractions, modifying Entity/Trait/Constraint/Intent/World/System code, or when the user asks about how the engine works.
user-invocable: true
---

# bix.bot Engine Architecture

Read `docs/engine-spec.md` for the full specification. This skill covers the 9 core abstractions and how they interrelate. Every engine feature must map onto these primitives.

## The 9 Core Abstractions

### 1. Entity

Identity container. Has a unique ID, a type string (from Schema), and attached Traits. Entities gain all meaning from their Traits.

Entities compose hierarchically — a "house" entity contains wall/door/roof child entities. Composition is recursive. A composed entity acts as a single unit for move/copy/serialize/constrain operations.

```typescript
interface Entity {
    id: string // nanoid
    type: string // from Schema: "wall", "asteroid", "neuron"
    traits: Map<string, TraitInstance>
    children: string[] // child entity IDs
    parent: string | null // parent entity ID
    metadata: Record<string, unknown>
}
```

### 2. Trait

Named, Zod-validated data bundle attached to an Entity. This is the composition mechanism — no inheritance.

Engine-provided Traits (always available in every Schema):

- `Spatial` — position: Vec3, rotation: Quat, scale: Vec3
- `Renderable` — meshRef, materialRef, visible, opacity, layer
- `Connectable` — ports: SnapPoint[], maxConnections, connectionRules
- `Editable` — fieldOverrides (which properties show in inspector, UI hints)
- `Metadata` — name, description, tags, custom key-values

Domain Traits are defined in the Schema (e.g. `Structural`, `Orbital`, `Activation`).

```typescript
interface TraitDefinition {
    name: string
    schema: z.ZodType // Zod schema — validates AND generates types
    defaults: Record<string, unknown>
    editable?: {
        fields: Record<
            string,
            {
                label: string
                widget: "slider" | "input" | "dropdown" | "color" | "toggle" | "vec3"
                min?: number
                max?: number
                step?: number
                options?: string[]
            }
        >
    }
}

// Runtime instance
interface TraitInstance {
    definition: string // name of the TraitDefinition
    data: Record<string, unknown> // validated against definition.schema
}
```

### 3. Constraint

Declarative rule governing relationships between entities. Constraints are first-class — declared, inspectable, solvable, prioritizable.

Key properties:

- **Multi-conditional**: depends on multiple entities and their interconnected relationships
- **Reactive**: re-evaluates when dependent state changes
- **Context-sensitive**: behavior can shift based on broader relationship graph
- **Composable**: constraints can reference other constraints
- **Prioritizable**: when constraints conflict, priority wins

```typescript
interface ConstraintDefinition {
    name: string
    description: string // human + AI readable
    priority: number // higher = stronger
    scope: "local" | "global" // local = between entities, global = world invariant

    // The condition function receives the full world context
    // Return: { valid: boolean, violations: Violation[], suggestions?: Intent[] }
    evaluate: (ctx: ConstraintContext) => ConstraintResult

    // What happens on violation
    effect: "prevent" | "warn" | "adjust" | "enforce"
}

interface ConstraintContext {
    entities: EntityQuery // query entities by type, trait, relationship
    world: WorldReadonly // full world state (read-only)
    trigger: {
        // what caused re-evaluation
        intent: Intent
        affected: string[] // entity IDs touched
    }
}
```

Examples:

- "A door can only attach to a wall" → local, prevent
- "Gravitational force ∝ mass/distance²" → local, enforce (adjusts Spatial)
- "Total roof load ≤ foundation capacity" → global, warn
- "Minimum wall length is 2ft" → local, prevent

### 4. System (Process)

Function that runs on tick/frame/event, operating on entities matching a Trait signature.

```typescript
interface SystemDefinition {
    name: string
    requiredTraits: string[] // only processes entities with ALL these
    phase: "pre-physics" | "physics" | "post-physics" | "constraints" | "render-prep"
    priority: number // order within phase
    update: (entities: Entity[], world: World, dt: number) => Intent[]
}
```

Engine-provided Systems:

- `ConstraintSolver` — evaluates all active constraints after each Intent batch
- `SpatialIndex` — maintains spatial queries (nearest, overlapping, within-radius)

Domain Systems are registered via Schema (physics, game logic, energy flow, etc.).

### 5. Schema (Domain Definition)

THE MOST IMPORTANT ABSTRACTION. A Schema turns bix.bot into a specific application.

```typescript
interface DomainSchema {
    name: string // "homescape", "asteroid-sim"
    version: string
    description: string // human + AI readable

    traits: TraitDefinition[] // domain-specific traits
    entityTypes: EntityTypeDefinition[] // what entities exist + which traits they carry
    constraints: ConstraintDefinition[] // all domain rules
    systems: SystemDefinition[] // domain simulation logic

    palette: PaletteConfig // what appears in the editor palette
    viewports: ViewportConfig[] // 2D, 3D, graph, etc.

    // Auto-derived but overridable:
    intents?: IntentCatalog // what actions are possible
    agentGlossary?: Record<string, string> // domain term definitions for LLMs
}

interface EntityTypeDefinition {
    type: string // "wall", "asteroid", "neuron"
    label: string // human display name
    description: string // for AI + tooltips
    traits: string[] // trait names this type carries
    icon?: string // lucide icon name for palette
    defaults?: Record<string, Record<string, unknown>> // per-trait default overrides
}
```

Schemas are authored as TypeScript files (not JSON) — full type checking, autocompletion, and inline logic for constraint conditions and system update functions.

### 6. World (Runtime)

The live runtime container. Single source of truth. Pure TypeScript class, zero framework deps.

Responsibilities:

- Entity CRUD (through Intents only)
- System execution loop (deterministic ordering by phase + priority)
- Constraint evaluation and enforcement
- Spatial indexing
- Undo/redo stack (Intent history)
- Serialization/deserialization
- Event emission for subscribers (Viewports, UI)

```typescript
class World {
    // State
    private entities: EntityStore
    private constraintGraph: ConstraintGraph
    private spatialIndex: SpatialIndex
    private intentHistory: IntentStack

    // Schema
    private schema: DomainSchema

    // Subscriptions
    private subscribers: Set<(event: WorldEvent) => void>

    // Core API
    dispatch(intent: Intent): IntentResult // validate + execute + constrain
    query(q: EntityQuery): Entity[] // read-only queries
    undo(): void
    redo(): void
    serialize(): WorldSnapshot
    static deserialize(snap: WorldSnapshot, schema: DomainSchema): World
    subscribe(fn: (event: WorldEvent) => void): () => void
    tick(dt: number): void // run all systems
}
```

### 7. Viewport

Visual projection of the World. React component that subscribes to World state. Multiple viewports per World (3D scene + 2D floor plan, etc.).

- Reads from World (subscribe to state changes)
- Renders its visual representation (Three.js, SVG, Canvas — up to the viewport)
- Routes interactions (click, drag, hover) back to World as Intents
- DOES NOT OWN DATA — it's a lens, not a source of truth

### 8. Intent (Action / Command)

Serializable description of a desired state change. The uniform mutation interface.

```typescript
interface Intent {
    type: string // "entity.create", "entity.delete", "trait.update", etc.
    params: Record<string, unknown> // validated by Zod per intent type
    source: "user" | "agent" | "system"
    timestamp: number
    // Added by World after execution:
    id?: string // for undo reference
    inverse?: Intent // auto-generated for undo
}
```

Both human UI and AI agent emit the same Intent types. This is non-negotiable.

### 9. Agent Interface

Structured API layer over Intents, auto-generated from Schema.

When a Schema declares entity types + traits + constraints, the Agent Interface automatically produces:

- Tool definitions (Intent types as callable tools with Zod-validated params)
- State queries (read-only World queries: list entities, get properties, find connections)
- Domain glossary (what terms mean, derived from Schema descriptions)

No manual tool authoring per domain. Load Schema → agent knows what it can do.

## Data Flow

```
User/AI Action
    ↓
Intent (validated by Zod)
    ↓
World.dispatch()
    ↓
├─ Execute mutation (EntityStore)
├─ Re-evaluate Constraints (ConstraintSolver)
│   └─ If violation: prevent/warn/adjust based on effect
├─ Push to undo stack
├─ Emit WorldEvent
    ↓
Subscribers notified
    ↓
├─ Zustand bridge updates → React re-renders
├─ Viewports re-render affected entities
└─ Inspector updates if selected entity changed
```

## When Implementing New Engine Features

1. Ask: does this map onto an existing abstraction? Most things do.
2. If it's a new kind of data on an entity → it's a Trait.
3. If it's a rule between entities → it's a Constraint.
4. If it's a state change → it's an Intent.
5. If it's a recurring computation → it's a System.
6. If it's domain-specific → it belongs in a Schema, not the engine.
7. If it needs React/Three.js → it belongs in `packages/editor`, not `packages/engine`.
8. If it's a new public-facing capability → export it from `src/index.ts`.

## Consumption Model

This engine publishes as `@bix/engine` on npm. Domain projects are separate repos that install it as a dependency. This means:

- Public API goes through `src/index.ts`. Anything not exported there is internal.
- World must work as a passed-around instance, never a global singleton. `World.create(schema)` is the entry point.
- Schema authoring helpers (`defineSchema`, `defineTrait`, `defineEntityType`, `defineConstraint`, `defineSystem`) must be importable without pulling in the entire engine runtime.
- Multiple World instances in one process must not interfere with each other.

See `docs/consumption-model.md` for full details.
