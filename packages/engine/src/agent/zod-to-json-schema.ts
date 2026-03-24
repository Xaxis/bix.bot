import { type z } from "zod"

// ── JSON Schema types ─────────────────────────────────────────────

export interface JSONSchemaProperty {
  type?: string | string[]
  description?: string
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
  items?: JSONSchemaProperty
  enum?: unknown[]
  additionalProperties?: JSONSchemaProperty | boolean
  minimum?: number
  maximum?: number
  minLength?: number
}

// ── Zod typeName constants (stable across Zod v3) ─────────────────

const Z = {
  String: "ZodString",
  Number: "ZodNumber",
  Boolean: "ZodBoolean",
  BigInt: "ZodBigInt",
  Enum: "ZodEnum",
  NativeEnum: "ZodNativeEnum",
  Literal: "ZodLiteral",
  Object: "ZodObject",
  Array: "ZodArray",
  Optional: "ZodOptional",
  Nullable: "ZodNullable",
  Default: "ZodDefault",
  Record: "ZodRecord",
  Union: "ZodUnion",
  Unknown: "ZodUnknown",
  Any: "ZodAny",
  Never: "ZodNever",
  Undefined: "ZodUndefined",
  Null: "ZodNull",
  Effects: "ZodEffects",
  Tuple: "ZodTuple",
} as const

// ── Main converter ────────────────────────────────────────────────

/**
 * Convert a Zod schema to a JSON Schema property descriptor.
 *
 * Handles the types used by bix.bot trait definitions. Uses Zod's
 * internal `_def` structure (stable in Zod v3).
 *
 * Unsupported types fall back to `{}` (any value accepted).
 */
export function zodToJsonSchema(schema: z.ZodType): JSONSchemaProperty {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def as Record<string, unknown>
  const typeName = def["typeName"] as string

  switch (typeName) {
    case Z.String: {
      const result: JSONSchemaProperty = { type: "string" }
      const checks = def["checks"] as Array<{ kind: string; value?: unknown }> | undefined
      for (const check of checks ?? []) {
        if (check.kind === "min" && typeof check.value === "number") {
          result.minLength = check.value
        }
      }
      return result
    }

    case Z.Number: {
      const result: JSONSchemaProperty = { type: "number" }
      const checks = def["checks"] as Array<{ kind: string; value?: unknown }> | undefined
      for (const check of checks ?? []) {
        if (check.kind === "min" && typeof check.value === "number") {
          result.minimum = check.value
        }
        if (check.kind === "max" && typeof check.value === "number") {
          result.maximum = check.value
        }
      }
      return result
    }

    case Z.Boolean:
      return { type: "boolean" }

    case Z.BigInt:
      return { type: "integer" }

    case Z.Enum: {
      const values = def["values"] as unknown[]
      return { type: "string", enum: values }
    }

    case Z.NativeEnum: {
      const enumObj = def["values"] as Record<string, unknown>
      const values = Object.values(enumObj).filter((v) => typeof v === "string")
      return { type: "string", enum: values }
    }

    case Z.Literal: {
      const value = def["value"]
      const t = typeof value
      return {
        type: t === "string" ? "string" : t === "number" ? "number" : "boolean",
        enum: [value],
      }
    }

    case Z.Object: {
      // shape can be the object directly or a function returning it
      const rawShape = def["shape"]
      const shape: Record<string, z.ZodType> =
        typeof rawShape === "function"
          ? (rawShape as () => Record<string, z.ZodType>)()
          : (rawShape as Record<string, z.ZodType>)

      const properties: Record<string, JSONSchemaProperty> = {}
      const required: string[] = []

      for (const [key, fieldSchema] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(fieldSchema)
        // A field is required unless it's wrapped in ZodOptional/ZodDefault/ZodNullable
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fieldTypeName = ((fieldSchema as any)._def as Record<string, unknown>)[
          "typeName"
        ]
        if (
          fieldTypeName !== Z.Optional &&
          fieldTypeName !== Z.Default &&
          fieldTypeName !== Z.Nullable
        ) {
          required.push(key)
        }
      }

      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      }
    }

    case Z.Array: {
      const itemSchema = def["type"] as z.ZodType
      return { type: "array", items: zodToJsonSchema(itemSchema) }
    }

    case Z.Optional:
    case Z.Nullable: {
      // Unwrap to the inner type
      const inner = def["innerType"] as z.ZodType
      return zodToJsonSchema(inner)
    }

    case Z.Default: {
      // Unwrap — the default value is just meta, the schema is the same
      const inner = def["innerType"] as z.ZodType
      return zodToJsonSchema(inner)
    }

    case Z.Effects: {
      // .refine() / .transform() — unwrap to the inner schema
      const inner = def["schema"] as z.ZodType
      return zodToJsonSchema(inner)
    }

    case Z.Record: {
      const valueSchema = def["valueType"] as z.ZodType
      return {
        type: "object",
        additionalProperties: zodToJsonSchema(valueSchema),
      }
    }

    case Z.Union: {
      // Use first option's type as a hint; true union JSON Schema would
      // use "oneOf" but for LLM hints this is sufficient
      const options = def["options"] as z.ZodType[]
      if (options.length > 0) {
        return zodToJsonSchema(options[0]!)
      }
      return {}
    }

    case Z.Tuple: {
      const items = def["items"] as z.ZodType[]
      return {
        type: "array",
        items: items.length > 0 ? zodToJsonSchema(items[0]!) : {},
      }
    }

    case Z.Unknown:
    case Z.Any:
    default:
      return {}
  }
}
