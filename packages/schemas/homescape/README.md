# Homescape — Cabin & Home Builder

A domain schema for bix.bot that turns the engine into an interactive building designer. Users assemble buildings from structural components in a 2D floor plan and 3D view.

## Entity Types

| Type       | Description                                | Key Traits                                                                         |
| ---------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| **wall**   | Vertical structural element                | structural (loadBearing, material, thickness), dimensional (width, height, length) |
| **door**   | Passage opening — must be child of wall    | dimensional                                                                        |
| **window** | Glazed opening — must be child of wall     | dimensional                                                                        |
| **floor**  | Horizontal surface defining room footprint | dimensional                                                                        |
| **roof**   | Topmost covering of a structure            | structural, dimensional                                                            |
| **pillar** | Vertical load-bearing column               | structural                                                                         |

## Domain Traits

### `structural`

- `loadBearing: boolean` — whether this element carries loads
- `material: "wood" | "steel" | "concrete" | "brick"`
- `thickness: number` (0.1–2.0 m)

### `dimensional`

Design-intent dimensions separate from the Spatial trait's scale. The wall **is** 3m long regardless of rendering scale.

- `width`, `height`, `length` (meters, all ≥ 0)

## Constraints

| Name                            | Effect  | Rule                                                         |
| ------------------------------- | ------- | ------------------------------------------------------------ |
| `load-bearing-deletion-blocked` | prevent | Load-bearing wall with roof/floor children cannot be deleted |
| `door-requires-wall`            | prevent | Doors must be parented to a wall                             |
| `window-requires-wall`          | prevent | Windows must be parented to a wall                           |
| `wall-min-length`               | prevent | Wall `dimensional.length` must be ≥ 0.5m                     |
| `door-fits-in-wall`             | prevent | Door `dimensional.width` ≤ parent wall `dimensional.length`  |
| `roof-needs-support`            | warn    | Roof with no wall connections (neither parent nor children)  |

## Engine Gaps Found During Phase 4

These are abstractions that don't fit cleanly and are documented for Phase 1 iteration:

### 1. Entity type defaults are not auto-applied

**Problem**: `EntityTypeDefinition.defaults` declares per-trait default values, but `World.create()` / the `entity.create` intent handler does not look up the schema's entityTypes to auto-attach traits with those defaults when an entity is created.

**Workaround**: Pass trait data explicitly in `entity.create` params, or follow up with `trait.update` dispatches.

**Suggested fix**: In `World.create()`, register a post-processing hook in the `entity.create` handler that looks up the schema's entityType declaration and auto-attaches traits with merged defaults.

### 2. ConstraintContext lacks convenience methods

**Problem**: The `schema-authoring` skill documents `ctx.world.getParent(id)`, `ctx.world.getTrait(id, name)`, and `ctx.entities.connectedTo(id)`. None of these exist. Constraints must access parent/children via `entity.parent` (an ID string) and `entity.children` (ID array), then look each up via `ctx.entities.byId()`.

**Workaround**: Use `entity.parent` and `entity.children` + manual `byId` lookups.

**Suggested fix**: Add `ctx.world.getParent(id): Entity | undefined`, `ctx.world.getChildren(id): Entity[]`, and `ctx.world.getTrait(id, name): unknown` to the constraint context.

### 3. Pre-execution constraints can't fire at entity creation

**Problem**: Constraints run pre-execution. A "warn" constraint checking whether a newly-created entity has something it needs (e.g., "roof has no walls") can't fire at creation time — the entity doesn't exist in `ctx.entities` yet. The warning only appears on the next relevant operation.

**Workaround**: Accept the gap for now. The `roof-needs-support` warn fires on any subsequent wall/roof change.

**Suggested fix**: Add an optional post-execution evaluation pass for `"warn"` and `"adjust"` effect constraints.

### 4. `palette` and `viewports` not yet in DomainSchema

**Problem**: The schema spec mentions `palette` (with categories) and `viewports` (2D/3D configuration) as first-class schema fields, but they're not yet part of the `DomainSchema` interface.

**Workaround**: Documented as comments in `index.ts`.

**Suggested fix**: Add `palette?: PaletteConfig` and `viewports?: ViewportConfig[]` to `DomainSchema`, use them in BixEditor to drive the palette UI and viewport selection.

### 5. No system-level load propagation

**Problem**: Structural load calculations (which walls support which loads) need a reactive System. No such system exists in the engine yet.

**Workaround**: Load-bearing semantics are captured declaratively in the `structural.loadBearing` field, which constraints read. Full propagation deferred to Phase 4+.
