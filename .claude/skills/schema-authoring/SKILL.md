---
name: schema-authoring
description: How to author domain schemas for bix.bot. Use when creating a new schema, adding entity types, defining traits, writing constraints, or configuring a new domain like a cabin builder, asteroid sim, etc.
---

# Authoring a bix.bot Domain Schema

A Schema turns the bix.bot engine into a specific application. This skill covers how to write one.

## File Structure

Schemas live in different places depending on context:

**In the bix.bot monorepo** (example/test schemas):

```
packages/schemas/homescape/
├── index.ts              # Main schema export
├── traits.ts             # Domain-specific trait definitions
├── entities.ts           # Entity type definitions
├── constraints.ts        # Domain rules
├── systems.ts            # Domain simulation logic (if any)
├── palette.ts            # Editor palette configuration
├── viewports.ts          # Viewport configuration
└── README.md             # Human description of this domain
```

**In a standalone domain project** (created by `create-bix-app` or manually):

```
schema/
├── index.ts              # Main schema export
├── traits.ts             # Domain-specific trait definitions
├── entities.ts           # Entity type definitions
├── constraints.ts        # Domain rules
├── systems.ts            # Domain simulation logic (if any)
└── README.md             # Human description of this domain
```

The internal file structure is identical — only the parent directory differs. All imports use `@bix/engine` regardless of context.

## Step-by-Step: Creating a New Schema

### 1. Define Domain Traits

Think: what properties do things in this domain have that aren't covered by the engine-provided traits (Spatial, Renderable, Connectable, Editable, Metadata)?

```typescript
// packages/schemas/homescape/traits.ts
import { z } from "zod"
import { defineTrait } from "@bix/engine"

export const Structural = defineTrait({
    name: "Structural",
    schema: z.object({
        loadBearing: z.boolean(),
        material: z.enum(["wood", "steel", "concrete", "brick"]),
        thickness: z.number().min(0.1).max(2.0), // meters
    }),
    defaults: {
        loadBearing: false,
        material: "wood",
        thickness: 0.15,
    },
    editable: {
        fields: {
            loadBearing: { label: "Load Bearing", widget: "toggle" },
            material: {
                label: "Material",
                widget: "dropdown",
                options: ["wood", "steel", "concrete", "brick"],
            },
            thickness: {
                label: "Thickness (m)",
                widget: "slider",
                min: 0.1,
                max: 2.0,
                step: 0.05,
            },
        },
    },
})

export const Dimensional = defineTrait({
    name: "Dimensional",
    schema: z.object({
        width: z.number().min(0),
        height: z.number().min(0),
        length: z.number().min(0),
    }),
    defaults: { width: 1, height: 2.4, length: 1 },
    editable: {
        fields: {
            width: { label: "Width (m)", widget: "input", min: 0, step: 0.1 },
            height: { label: "Height (m)", widget: "input", min: 0, step: 0.1 },
            length: { label: "Length (m)", widget: "input", min: 0, step: 0.1 },
        },
    },
})
```

### 2. Define Entity Types

Each entity type names which traits it carries. The engine merges engine-provided traits + domain traits.

```typescript
// packages/schemas/homescape/entities.ts
import { defineEntityType } from "@bix/engine"

export const Wall = defineEntityType({
    type: "wall",
    label: "Wall",
    description:
        "A vertical structural element. Can be load-bearing or partition. Doors and windows attach to walls.",
    traits: [
        "Spatial",
        "Renderable",
        "Connectable",
        "Editable",
        "Structural",
        "Dimensional",
    ],
    icon: "square",
    defaults: {
        Dimensional: { width: 0.15, height: 2.4, length: 3.0 },
        Structural: { loadBearing: false, material: "wood", thickness: 0.15 },
    },
})

export const Door = defineEntityType({
    type: "door",
    label: "Door",
    description: "An opening in a wall for passage. Must be attached to a wall.",
    traits: ["Spatial", "Renderable", "Connectable", "Editable", "Dimensional"],
    icon: "door-open",
    defaults: {
        Dimensional: { width: 0.9, height: 2.1, length: 0.05 },
    },
})
```

### 3. Define Constraints

Constraints encode domain rules. Think about what CAN'T happen, what MUST be true, and what adjustments should be automatic.

```typescript
// packages/schemas/homescape/constraints.ts
import { defineConstraint } from "@bix/engine"

export const DoorRequiresWall = defineConstraint({
    name: "door-requires-wall",
    description: "A door can only be placed inside a wall segment.",
    priority: 100,
    scope: "local",
    effect: "prevent",
    evaluate: (ctx) => {
        const doors = ctx.entities.byType("door")
        const violations = []

        for (const door of doors) {
            const parent = ctx.world.getParent(door.id)
            if (!parent || parent.type !== "wall") {
                violations.push({
                    entityId: door.id,
                    message: `Door "${door.id}" must be placed inside a wall.`,
                })
            }
        }

        return { valid: violations.length === 0, violations }
    },
})

export const WallMinLength = defineConstraint({
    name: "wall-min-length",
    description: "Walls must be at least 0.5 meters long.",
    priority: 90,
    scope: "local",
    effect: "prevent",
    evaluate: (ctx) => {
        const walls = ctx.entities.byType("wall")
        const violations = []

        for (const wall of walls) {
            const dim = ctx.world.getTrait(wall.id, "Dimensional")
            if (dim && dim.data.length < 0.5) {
                violations.push({
                    entityId: wall.id,
                    message: `Wall "${wall.id}" is too short (${dim.data.length}m). Minimum is 0.5m.`,
                    suggestions: [
                        {
                            type: "trait.update",
                            params: {
                                entityId: wall.id,
                                trait: "Dimensional",
                                data: { length: 0.5 },
                            },
                        },
                    ],
                })
            }
        }

        return { valid: violations.length === 0, violations }
    },
})

// Example of a multi-conditional, context-sensitive constraint
export const LoadBearingDeletion = defineConstraint({
    name: "load-bearing-deletion",
    description:
        "A load-bearing wall cannot be deleted if other structures depend on it.",
    priority: 200,
    scope: "local",
    effect: "prevent",
    evaluate: (ctx) => {
        // Only relevant for delete intents targeting walls
        if (ctx.trigger.intent.type !== "entity.delete")
            return { valid: true, violations: [] }

        const entityId = ctx.trigger.intent.params.entityId as string
        const entity = ctx.world.getEntity(entityId)
        if (!entity || entity.type !== "wall") return { valid: true, violations: [] }

        const structural = ctx.world.getTrait(entityId, "Structural")
        if (!structural?.data.loadBearing) return { valid: true, violations: [] }

        // Check if anything depends on this wall
        const dependents = ctx.entities.connectedTo(entityId)
        const criticalDependents = dependents.filter((dep) => {
            // Roof or upper-floor entities that reference this wall
            return dep.type === "roof" || dep.type === "floor"
        })

        if (criticalDependents.length > 0) {
            return {
                valid: false,
                violations: [
                    {
                        entityId,
                        message: `Cannot delete load-bearing wall: ${criticalDependents.length} structure(s) depend on it.`,
                    },
                ],
            }
        }

        return { valid: true, violations: [] }
    },
})
```

### 4. Assemble the Schema

```typescript
// packages/schemas/homescape/index.ts
import { defineSchema } from "@bix/engine"
import { Structural, Dimensional } from "./traits"
import { Wall, Door, Window, Floor, Roof, Pillar } from "./entities"
import { DoorRequiresWall, WallMinLength, LoadBearingDeletion } from "./constraints"

export default defineSchema({
    name: "homescape",
    version: "0.1.0",
    description:
        "A cabin and home builder. Users assemble buildings from structural components like walls, doors, windows, roofs, and foundations. Supports 2D floor plan editing and 3D visualization.",

    traits: [Structural, Dimensional],
    entityTypes: [Wall, Door, Window, Floor, Roof, Pillar],
    constraints: [DoorRequiresWall, WallMinLength, LoadBearingDeletion],
    systems: [],

    palette: {
        categories: [
            { name: "Structure", types: ["wall", "pillar", "floor"] },
            { name: "Openings", types: ["door", "window"] },
            { name: "Roof", types: ["roof"] },
        ],
    },

    viewports: [
        { type: "2d", label: "Floor Plan", renderer: "svg" },
        { type: "3d", label: "3D View", renderer: "three" },
    ],
})
```

## Schema Authoring Checklist

When creating a new Schema, work through these in order:

1. **What are the "things"?** List every entity type the user would place/create.
2. **What properties do they have?** These become Traits. Separate engine-provided (Spatial, Renderable, etc.) from domain-specific.
3. **What are the rules?** What can connect to what? What limits exist? What invariants must hold? These become Constraints.
4. **What happens automatically?** Physics? Energy flow? These become Systems.
5. **What does the editor look like?** Palette categories, viewport types.
6. **Write descriptions everywhere.** Every entity type, trait, and constraint needs a clear `description` — this is what the AI agent reads to understand the domain.

## Anti-Patterns

- **Don't put domain logic in the engine.** If it only applies to one Schema, it goes in the Schema.
- **Don't skip Zod schemas on Traits.** They're load-bearing for validation AND AI tool generation.
- **Don't use inheritance for entity variants.** "Interior wall" vs "exterior wall" = same entity type with different Trait values, not a subclass.
- **Don't write constraints as imperative code scattered across files.** Centralize them in `constraints.ts`. Every rule is a named, inspectable ConstraintDefinition.
