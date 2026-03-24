import { z } from "zod"

// ── Editable field config (UI hints for the editor inspector) ───

export const WidgetType = z.enum([
  "slider",
  "input",
  "dropdown",
  "color",
  "toggle",
  "vec3",
])
export type WidgetType = z.infer<typeof WidgetType>

export const EditableFieldConfigSchema = z.object({
  label: z.string().optional(),
  widget: WidgetType.optional(),
  hidden: z.boolean().optional(),
  readonly: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.string()).optional(),
})
export type EditableFieldConfig = z.infer<typeof EditableFieldConfigSchema>

export const EditableConfigSchema = z.object({
  fields: z.record(z.string(), EditableFieldConfigSchema),
})
export type EditableConfig = z.infer<typeof EditableConfigSchema>

// ── TraitDefinition ─────────────────────────────────────────────

/**
 * A TraitDefinition describes a named, Zod-validated data bundle
 * that can be attached to Entities. The Zod schema is load-bearing —
 * it validates data AND can generate AI tool parameter definitions.
 */
export interface TraitDefinition {
  /** Unique trait name (e.g., "spatial", "renderable", "orbital"). */
  readonly name: string

  /** Zod schema — the canonical type source. Validates trait data at runtime. */
  readonly schema: z.ZodType

  /**
   * Default values for this trait. Must pass schema validation.
   * Used when attaching a trait without explicit data.
   */
  readonly defaults: Record<string, unknown>

  /** Optional UI hints for the editor inspector. */
  readonly editable?: EditableConfig
}

/**
 * Create a TraitDefinition with compile-time and runtime safety.
 *
 * The generic parameter ensures `defaults` matches the Zod schema's
 * inferred type at compile time. At runtime, defaults are validated
 * against the schema — a mismatch throws immediately, catching
 * schema authoring errors at definition time rather than at use time.
 */
export function defineTrait<S extends z.ZodType>(config: {
  name: string
  schema: S
  defaults: z.infer<S>
  editable?: EditableConfig
}): TraitDefinition {
  // Validate defaults against the schema — fail fast on authoring errors
  const parsed = config.schema.safeParse(config.defaults)
  if (!parsed.success) {
    throw new Error(
      `Trait "${config.name}" defaults do not match schema: ${parsed.error.message}`,
    )
  }

  return {
    name: config.name,
    schema: config.schema,
    defaults: parsed.data as Record<string, unknown>,
    editable: config.editable,
  }
}
