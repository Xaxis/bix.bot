# bix.bot — Consumption Model

## How bix.bot Gets Used

The bix.bot monorepo is the **development home** for the engine and editor. It publishes npm packages. Domain projects (Homescape, Dyson sphere sim, asteroid sim, etc.) are **separate repos** that install those packages as dependencies.

```
┌─────────────────────────────────────────┐
│  bix.bot monorepo (you maintain this)   │
│                                         │
│  packages/engine/  → @bix/engine (npm)  │
│  packages/editor/  → @bix/editor (npm)  │
│  packages/create-bix-app/  → CLI tool   │
│  packages/schemas/ → examples/tests     │
└─────────────────────────────────────────┘
        │ publishes          │ scaffolds
        ▼                    ▼
┌─────────────────────────────────────────┐
│  my-homescape/ (separate repo)          │
│                                         │
│  package.json → @bix/engine, @bix/editor│
│  schema/      → your domain schema     │
│  viewports/   → custom renderers (opt)  │
│  app/         → Next.js shell           │
│  CLAUDE.md    → auto-generated          │
│  .claude/     → auto-generated skills   │
└─────────────────────────────────────────┘
```

## The Three Artifacts

### 1. `@bix/engine` (npm package)

The pure TypeScript kernel. Zero framework deps. Exports:

```typescript
// Schema authoring
export {
    defineSchema,
    defineTrait,
    defineEntityType,
    defineConstraint,
    defineSystem,
} from "./schema"

// Runtime
export { World } from "./world"
export { type Entity } from "./entity"
export { type Intent, type IntentResult } from "./intent"

// Built-in traits
export {
    Spatial,
    Renderable,
    Connectable,
    Editable,
    Metadata,
} from "./trait/built-in-traits"

// Agent interface generation
export { generateToolDefinitions, generateGlossary } from "./agent"

// Types for Schema authors
export type {
    DomainSchema,
    TraitDefinition,
    EntityTypeDefinition,
    ConstraintDefinition,
    SystemDefinition,
    ConstraintContext,
    ConstraintResult,
} from "./types"
```

This is the only package a consumer MUST install. If someone wants to build their own UI from scratch (no editor shell), they can — the engine is standalone.

### 2. `@bix/editor` (npm package)

The React + Three.js editor shell. Exports composable components and hooks:

```typescript
// Top-level editor
export { BixEditor } from "./components/BixEditor"

// Individual components (for custom layouts)
export { Palette } from "./components/Palette"
export { Inspector } from "./components/Inspector"
export { Toolbar } from "./components/Toolbar"
export { ChatPanel } from "./components/ChatPanel"

// Viewports
export { Viewport3D } from "./viewports/Viewport3D"
export { Viewport2D } from "./viewports/Viewport2D"

// Hooks
export {
    useWorld,
    useSelection,
    useIntent,
    useEntities,
    useConstraintViolations,
} from "./hooks"

// Zustand bridge
export { createWorldStore } from "./stores/world-store"
```

The `BixEditor` component is the "batteries included" option — pass it a Schema and a World, get a full editor. The individual exports let you build custom layouts.

```tsx
// Simple: full editor in one component
import { BixEditor } from "@bix/editor"
import { World } from "@bix/engine"
import homescapeSchema from "./schema"

const world = World.create(homescapeSchema)

export default function App() {
    return <BixEditor world={world} schema={homescapeSchema} />
}

// Custom: build your own layout
import { Viewport3D, Palette, Inspector, useWorld } from "@bix/editor"

export default function CustomEditor() {
    const world = useWorld()
    return (
        <div className="flex">
            <Palette schema={schema} />
            <Viewport3D world={world} />
            <Inspector />
        </div>
    )
}
```

### 3. `create-bix-app` (CLI scaffolder)

Generates a new domain project with everything wired:

```bash
npx create-bix-app my-homescape
# or
npx create-bix-app my-homescape --template minimal
```

## What `create-bix-app` Generates

```
my-homescape/
├── package.json              # @bix/engine, @bix/editor, next, react, etc.
├── tsconfig.json             # Strict TS, extends nothing (standalone project)
├── next.config.ts
├── tailwind.config.ts
├── .gitignore
│
├── schema/
│   ├── index.ts              # defineSchema() — the main export
│   ├── traits.ts             # Domain trait definitions (starter examples)
│   ├── entities.ts           # Entity type definitions (starter examples)
│   ├── constraints.ts        # Constraint definitions (starter examples)
│   └── README.md             # "How to author your schema"
│
├── viewports/                # Custom viewport renderers (optional)
│   └── README.md             # "When and how to add custom viewports"
│
├── app/
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Landing page or direct editor mount
│   └── editor/
│       └── page.tsx          # Editor page — loads schema, creates World, mounts BixEditor
│
├── CLAUDE.md                 # Auto-generated, domain-aware
├── AGENTS.md                 # Same content, cross-tool compat
├── .claude/
│   └── skills/
│       └── domain-schema/    # Auto-generated skill explaining this domain's schema
│           └── SKILL.md
│
└── docs/
    └── schema-guide.md       # Copy of the schema-authoring skill content
```

## Auto-Generated CLAUDE.md (Template)

The scaffolder generates a project-specific CLAUDE.md:

```markdown
# {{projectName}}

Built on bix.bot engine. Domain: {{description}}.

## Commands

\`\`\`bash
yarn dev # Next.js dev server
yarn build # production build
yarn typecheck # type check everything
\`\`\`

## Project Structure

\`\`\`
schema/ Your domain schema — entity types, traits, constraints
viewports/ Custom viewport renderers (optional)
app/ Next.js app shell
\`\`\`

## Architecture Rules

- Schema is the source of truth. Entity types, traits, constraints — all defined there.
- All World mutations go through Intents. Never write to entity state directly.
- Custom viewports subscribe to World state and render. They do not own data.
- @bix/engine and @bix/editor are dependencies. Do NOT modify them locally. If the engine needs a change, make it upstream in the bix.bot monorepo.

## Git

- NEVER make git commits. The user commits manually.

## Schema Editing

- Entity types go in schema/entities.ts
- Domain traits go in schema/traits.ts
- Constraints go in schema/constraints.ts
- Run /domain-schema skill for full schema authoring guidance
```

## Auto-Generated Domain Skill (Template)

```markdown
---
name: domain-schema
description: Schema structure and conventions for this project. Use when adding entities, traits, or constraints.
---

# {{projectName}} Schema

This project uses the bix.bot engine. The schema in `schema/` defines everything about the domain.

## Current Entity Types

(auto-populated from schema/entities.ts at scaffold time, with instruction to keep updated)

## How to Add a New Entity Type

1. Define it in schema/entities.ts using defineEntityType()
2. List which traits it carries
3. Add defaults for domain traits
4. Add it to a palette category in schema/index.ts
5. Add any constraints it participates in to schema/constraints.ts

## How to Add a New Constraint

1. Define it in schema/constraints.ts using defineConstraint()
2. Set scope (local vs global), effect (prevent/warn/adjust/enforce), priority
3. Write the evaluate function — receives ConstraintContext with read-only world access
4. Register it in schema/index.ts
```

## CLI Implementation Notes

`create-bix-app` should be a simple Node.js script in `packages/create-bix-app/`:

- Parse args (project name, optional --template flag)
- Copy template directory
- Replace `{{projectName}}` and `{{description}}` placeholders
- Run `yarn install`
- Print "done, cd into your project and run yarn dev"

Templates:

- `default` — Full setup with Next.js app, example entities, example constraints
- `minimal` — Bare schema with no example entities, empty constraints file

This is a Phase 5 deliverable — after the engine, editor, and first real schema are proven. Don't build it until Phases 1-4 are done.

---

## Impact on Engine/Editor API Design

Knowing that `@bix/engine` and `@bix/editor` will be consumed as npm packages means:

1. **Public API surface must be explicit.** Every export is a contract. Use a single `index.ts` entry point per package. Don't export internals.

2. **Engine must not assume monorepo context.** No relative imports across packages. No shared singletons. A consumer creates a `World` instance and passes it where needed.

3. **Editor components must accept World as a prop or via context.** Don't rely on a global store. The consumer controls World lifecycle.

4. **Schema type exports must be clean.** Schema authors need `defineSchema`, `defineTrait`, `defineEntityType`, `defineConstraint` and the associated types. These must be importable without pulling in the entire engine.

5. **Versioning matters.** Engine and editor should use semver. Breaking changes to Schema format or Intent types require major version bumps.
