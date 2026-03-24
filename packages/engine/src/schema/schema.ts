import { type TraitDefinition } from "../trait/trait-definition.js"
import { type ConstraintDefinition } from "../constraint/constraint-definition.js"
import { type SystemDefinition } from "../system/system-definition.js"
import { validateSchema } from "./validate-schema.js"

// Re-export defineSystem and validateSchema so consumers get one import path
export { defineSystem } from "../system/system-definition.js"
export { validateSchema } from "./validate-schema.js"
export type { SchemaValidationError, SchemaValidationResult } from "./validate-schema.js"

// ── EntityTypeDefinition ────────────────────────────────────────

/**
 * Describes one kind of entity in the domain.
 *
 * Entity types are the vocabulary of the domain — "wall", "asteroid",
 * "neuron". They declare which Traits instances of that type carry,
 * and provide human + AI readable labels and descriptions.
 */
export interface EntityTypeDefinition {
  /** Machine identifier used in entity.create intents. */
  readonly type: string
  /** Human-readable display name (e.g., "Load-Bearing Wall"). */
  readonly label: string
  /** Description for AI agents and editor tooltips. */
  readonly description: string
  /** Trait names this entity type carries. Must be registered in the schema. */
  readonly traits: readonly string[]
  /** Optional lucide icon name for the editor palette. */
  readonly icon?: string
  /**
   * Per-trait default value overrides.
   * Key: trait name. Value: partial data merged over the trait's own defaults.
   */
  readonly defaults?: Record<string, Record<string, unknown>>
}

/**
 * Create an EntityTypeDefinition with type safety.
 * Validates that required fields are non-empty.
 */
export function defineEntityType(config: EntityTypeDefinition): EntityTypeDefinition {
  if (config.type.trim().length === 0) {
    throw new Error("EntityTypeDefinition.type must not be empty")
  }
  if (config.label.trim().length === 0) {
    throw new Error(`EntityTypeDefinition for "${config.type}": label must not be empty`)
  }
  return config
}

// ── DomainSchema ────────────────────────────────────────────────

/**
 * A DomainSchema is the configuration artifact that turns bix.bot into
 * a specific application. It declares what things exist, what properties
 * they have, how they relate, and what rules govern them.
 *
 * Schema is the single source of truth. Everything in bix.bot — UI,
 * AI tools, validation, rendering config — is derived from it.
 *
 * Author schemas as TypeScript files (not JSON) for full type checking.
 */
export interface DomainSchema {
  /** Machine identifier used in snapshots and serialized state. */
  readonly name: string
  /** Semver string (e.g., "1.0.0"). */
  readonly version: string
  /** Human + AI readable description of the domain. */
  readonly description?: string

  /**
   * Domain-specific trait definitions.
   * Engine built-in traits (Spatial, Renderable, etc.) are always
   * available and must NOT be re-declared here.
   */
  readonly traits: readonly TraitDefinition[]

  /** Entity types available in this domain. */
  readonly entityTypes?: readonly EntityTypeDefinition[]

  /**
   * Constraint definitions for this domain.
   * Registered in the World's ConstraintGraph on World.create().
   * Evaluated pre-execution on every dispatch.
   */
  readonly constraints?: readonly ConstraintDefinition[]

  /**
   * System definitions for this domain.
   * Registered in the World's SystemRunner on World.create().
   * Executed in phase + priority order on every World.tick(dt).
   */
  readonly systems?: readonly SystemDefinition[]
}

// ── defineSchema ────────────────────────────────────────────────

/**
 * Define a DomainSchema with compile-time and full runtime validation.
 *
 * Runs `validateSchema()` internally and throws a formatted error
 * listing all problems if any are found. This is the primary authoring
 * entry point for domain authors.
 *
 * ```typescript
 * // schema/index.ts in a consumer project
 * import { defineSchema, defineTrait, defineEntityType } from "@bix/engine"
 *
 * export default defineSchema({
 *   name: "my-domain",
 *   version: "1.0.0",
 *   traits: [...],
 *   entityTypes: [...],
 *   constraints: [...],
 * })
 * ```
 */
export function defineSchema(config: DomainSchema): DomainSchema {
  if (config.name.trim().length === 0) {
    throw new Error("DomainSchema.name must not be empty")
  }
  if (config.version.trim().length === 0) {
    throw new Error(`Schema "${config.name}": version must not be empty`)
  }

  const result = validateSchema(config)
  if (!result.valid) {
    const lines = result.errors.map((e) => `  [${e.code}] ${e.field}: ${e.message}`)
    throw new Error(
      `Schema "${config.name}" has ${result.errors.length} validation error(s):\n${lines.join("\n")}`,
    )
  }

  return config
}
