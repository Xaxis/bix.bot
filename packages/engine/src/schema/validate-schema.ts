import { type DomainSchema } from "./schema.js"

// ── Structured error ──────────────────────────────────────────────

export interface SchemaValidationError {
  /** Machine-readable error code for programmatic handling. */
  code: string
  /** Dot-path to the offending field (e.g. "entityTypes[1].traits[2]"). */
  field: string
  /** Human-readable explanation for schema authors. */
  message: string
}

// ── Result ────────────────────────────────────────────────────────

export interface SchemaValidationResult {
  valid: boolean
  errors: SchemaValidationError[]
}

// ── Semver ────────────────────────────────────────────────────────

// Simple but correct semver regex covering the common cases.
// Allows pre-release (-alpha.1) and build metadata (+build.1).
const SEMVER_RE =
  /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/

function isValidSemver(version: string): boolean {
  return SEMVER_RE.test(version)
}

// ── Built-in trait names ──────────────────────────────────────────

const BUILT_IN_TRAIT_NAMES = new Set([
  "spatial",
  "renderable",
  "connectable",
  "editable",
  "metadata",
])

// ── validateSchema ────────────────────────────────────────────────

/**
 * Validate a DomainSchema for structural integrity.
 *
 * Returns a structured result — use this in tooling, IDEs, and the
 * `defineSchema()` helper. Checks:
 *
 * - `version` is valid semver
 * - `traits`: no duplicates, no built-in shadowing
 * - `entityTypes`: no duplicate `type` names
 * - `entityTypes[*].traits`: every referenced trait name is a built-in
 *   or declared in `schema.traits`
 * - `constraints`: no duplicate `name` values
 * - `constraints[*].watch.entityTypes`: every watched entity type is
 *   declared in `schema.entityTypes`
 * - `systems`: no duplicate `name` values
 */
export function validateSchema(schema: DomainSchema): SchemaValidationResult {
  const errors: SchemaValidationError[] = []

  // ── version semver ────────────────────────────────────────────
  if (schema.version.trim().length > 0 && !isValidSemver(schema.version.trim())) {
    errors.push({
      code: "INVALID_SEMVER",
      field: "version",
      message: `"${schema.version}" is not valid semver. Use the form MAJOR.MINOR.PATCH (e.g., "1.0.0").`,
    })
  }

  // ── traits ─────────────────────────────────────────────────────
  const schemaTraitNames = new Set<string>()
  for (let i = 0; i < schema.traits.length; i++) {
    const trait = schema.traits[i]!
    if (BUILT_IN_TRAIT_NAMES.has(trait.name)) {
      errors.push({
        code: "TRAIT_SHADOWS_BUILTIN",
        field: `traits[${i}].name`,
        message: `Trait "${trait.name}" shadows the built-in trait of the same name. Remove it — built-ins are always available.`,
      })
    } else if (schemaTraitNames.has(trait.name)) {
      errors.push({
        code: "DUPLICATE_TRAIT_NAME",
        field: `traits[${i}].name`,
        message: `Duplicate trait name "${trait.name}" at index ${i}.`,
      })
    } else {
      schemaTraitNames.add(trait.name)
    }
  }
  const allTraitNames = new Set([...BUILT_IN_TRAIT_NAMES, ...schemaTraitNames])

  // ── entityTypes ───────────────────────────────────────────────
  const entityTypeNames = new Set<string>()
  for (let i = 0; i < (schema.entityTypes?.length ?? 0); i++) {
    const et = schema.entityTypes![i]!
    if (entityTypeNames.has(et.type)) {
      errors.push({
        code: "DUPLICATE_ENTITY_TYPE",
        field: `entityTypes[${i}].type`,
        message: `Duplicate entity type name "${et.type}" at index ${i}.`,
      })
    } else {
      entityTypeNames.add(et.type)
    }
    // Validate trait references
    for (let j = 0; j < et.traits.length; j++) {
      const traitRef = et.traits[j]!
      if (!allTraitNames.has(traitRef)) {
        errors.push({
          code: "UNKNOWN_TRAIT_REF",
          field: `entityTypes[${i}].traits[${j}]`,
          message:
            `Entity type "${et.type}" references unknown trait "${traitRef}". ` +
            `Declare it in schema.traits or use a built-in name.`,
        })
      }
    }
  }

  // ── constraints ───────────────────────────────────────────────
  const constraintNames = new Set<string>()
  for (let i = 0; i < (schema.constraints?.length ?? 0); i++) {
    const c = schema.constraints![i]!
    if (constraintNames.has(c.name)) {
      errors.push({
        code: "DUPLICATE_CONSTRAINT_NAME",
        field: `constraints[${i}].name`,
        message: `Duplicate constraint name "${c.name}" at index ${i}.`,
      })
    } else {
      constraintNames.add(c.name)
    }
    // Only validate watch.entityTypes refs when the schema has declared entity types.
    // If entityTypes is omitted/empty, watch declarations are permissive — no cross-check.
    if (entityTypeNames.size > 0) {
      for (let j = 0; j < (c.watch?.entityTypes?.length ?? 0); j++) {
        const watchedType = c.watch!.entityTypes![j]!
        if (!entityTypeNames.has(watchedType)) {
          errors.push({
            code: "UNKNOWN_WATCH_ENTITY_TYPE",
            field: `constraints[${i}].watch.entityTypes[${j}]`,
            message:
              `Constraint "${c.name}" watches unknown entity type "${watchedType}". ` +
              `Declare it in schema.entityTypes first.`,
          })
        }
      }
    }
  }

  // ── systems ───────────────────────────────────────────────────
  const systemNames = new Set<string>()
  for (let i = 0; i < (schema.systems?.length ?? 0); i++) {
    const s = schema.systems![i]!
    if (systemNames.has(s.name)) {
      errors.push({
        code: "DUPLICATE_SYSTEM_NAME",
        field: `systems[${i}].name`,
        message: `Duplicate system name "${s.name}" at index ${i}.`,
      })
    } else {
      systemNames.add(s.name)
    }
  }

  return { valid: errors.length === 0, errors }
}
