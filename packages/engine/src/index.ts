/**
 * @bix/engine — Public API Surface
 *
 * This is the single entry point for consumers of the bix.bot engine.
 * Everything exported here is a committed public contract; internal
 * implementation files are NOT imported directly by consumers.
 *
 * NOTE: This is the one intentional barrel file in the engine codebase.
 * Internal modules use direct imports (no barrel re-exports). This file
 * exists solely to define the @bix/engine npm package surface.
 *
 * Usage in a consumer project:
 * ```typescript
 * import { World, defineSchema, defineTrait, SpatialTrait } from "@bix/engine"
 * ```
 */

// ── Schema authoring ─────────────────────────────────────────────
// These are the functions domain authors call to define their schema.

export { defineSchema, defineEntityType, validateSchema } from "./schema/schema.js"

export { defineTrait } from "./trait/trait-definition.js"

export { defineConstraint } from "./constraint/constraint-definition.js"

export { defineSystem } from "./system/system-definition.js"

export type { SchemaValidationError, SchemaValidationResult } from "./schema/schema.js"

// ── Runtime ──────────────────────────────────────────────────────
// The World is the entry point for runtime usage.

export { World } from "./world/world.js"

// ── Types for schema authors and consumers ───────────────────────
// All types needed to author schemas, handle results, and build
// integrations on top of the engine.

export type { Entity } from "./entity/entity.js"

export type { Intent, IntentInput, IntentResult, IntentSource } from "./intent/intent.js"

export type { DomainSchema, EntityTypeDefinition } from "./schema/schema.js"

export type {
  TraitDefinition,
  EditableConfig,
  EditableFieldConfig,
} from "./trait/trait-definition.js"

export type {
  ConstraintDefinition,
  ConstraintContext,
  ConstraintResult,
  ConstraintEffect,
  ConstraintWatch,
  Violation,
} from "./constraint/constraint-definition.js"

export type {
  SystemDefinition,
  SystemPhase,
  SystemWorldView,
} from "./system/system-definition.js"

export type {
  WorldEvent,
  WorldSnapshot,
  EntitySnapshot,
  WorldEventHandler,
} from "./world/world.js"

// ── Built-in traits ──────────────────────────────────────────────
// Trait definitions for all 5 engine-provided traits.
// Import these to attach built-in traits in entity type definitions.

export {
  SpatialTrait,
  RenderableTrait,
  ConnectableTrait,
  EditableTrait,
  MetadataTrait,
  BUILT_IN_TRAITS,
  BUILT_IN_TRAIT_NAMES,
  // Geometry schemas (useful for authoring domain traits with Vec3/Quat fields)
  Vec3Schema,
  QuatSchema,
  SnapPointSchema,
} from "./trait/built-in-traits.js"

export type {
  Vec3,
  Quat,
  SpatialData,
  RenderableData,
  ConnectableData,
  SnapPoint,
  Connection,
  EditableData,
  MetadataData,
} from "./trait/built-in-traits.js"

// ── Phase ordering ────────────────────────────────────────────────
// Useful when referencing phases in system definitions.

export { PHASE_ORDER } from "./system/system-definition.js"

// ── Agent interface ───────────────────────────────────────────────
// Auto-generates tool definitions and glossaries from a Schema.
// executeAgentTool maps LLM tool calls to World mutations.

export { generateToolDefinitions } from "./agent/tool-definitions.js"
export { executeAgentTool } from "./agent/execute-tool.js"
export { generateGlossary } from "./agent/glossary.js"

export type { ToolDefinition, ToolParameters } from "./agent/tool-definitions.js"
export type { AgentToolResult } from "./agent/execute-tool.js"
export type { JSONSchemaProperty } from "./agent/zod-to-json-schema.js"
