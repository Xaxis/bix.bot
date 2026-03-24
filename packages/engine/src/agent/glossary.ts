import { type DomainSchema } from "../schema/schema.js"
import { BUILT_IN_TRAITS } from "../trait/built-in-traits.js"

/**
 * Generate a plain-text domain glossary from a DomainSchema.
 *
 * The glossary is intended for LLM consumption — either included in a
 * system prompt or returned as context. It explains entity types, traits,
 * and constraints in human-readable form so the agent understands the
 * domain vocabulary.
 *
 * ```typescript
 * const glossary = generateGlossary(mySchema)
 * // Include in system prompt:
 * const systemPrompt = `You are helping the user design a ${schema.name}.\n\n${glossary}`
 * ```
 */
export function generateGlossary(schema: DomainSchema): string {
  const lines: string[] = []

  // ── Header ────────────────────────────────────────────────────
  lines.push(`# ${schema.name} (v${schema.version})`)
  if (schema.description) {
    lines.push("", schema.description)
  }
  lines.push("")

  // ── Entity types ──────────────────────────────────────────────
  const entityTypes = schema.entityTypes ?? []
  if (entityTypes.length > 0) {
    lines.push("## Entity Types")
    lines.push("")
    lines.push(
      "Entity types are the things that exist in this domain. " +
        "Create them with create_<type> tools.",
    )
    lines.push("")

    for (const et of entityTypes) {
      lines.push(`### ${et.label} (\`${et.type}\`)`)
      lines.push(et.description)
      if (et.traits.length > 0) {
        lines.push(`**Traits:** ${et.traits.join(", ")}`)
      }
      lines.push("")
    }
  }

  // ── Domain traits ─────────────────────────────────────────────
  if (schema.traits.length > 0) {
    lines.push("## Domain Traits")
    lines.push("")
    lines.push("These traits are specific to this domain.")
    lines.push("")

    for (const trait of schema.traits) {
      lines.push(`### ${trait.name}`)
      if (trait.editable) {
        const fieldNames = Object.keys(trait.editable.fields)
        if (fieldNames.length > 0) {
          const fieldDescriptions = fieldNames.map((f) => {
            const config = trait.editable!.fields[f]!
            return config.label ? `${f} (${config.label})` : f
          })
          lines.push(`Fields: ${fieldDescriptions.join(", ")}`)
        }
      }
      lines.push("")
    }
  }

  // ── Built-in traits ───────────────────────────────────────────
  lines.push("## Built-in Traits")
  lines.push("")
  lines.push("These traits are always available, regardless of domain.")
  lines.push("")

  const builtInDescriptions: Record<string, string> = {
    spatial:
      "World-space position, rotation, and scale. " +
      "Position: {x, y, z}. Rotation: quaternion {x, y, z, w}. Scale: {x, y, z}.",
    renderable:
      "Controls how the entity is displayed. " +
      "Fields: visible (bool), opacity (0-1), layer (int), meshRef, materialRef.",
    connectable:
      "Snap points and connection rules for attaching entities together. " +
      "Fields: ports (array of snap points), maxConnections, connections (array).",
    editable:
      "Overrides for how entity properties are displayed in the editor inspector.",
    metadata:
      "Human-readable entity metadata. " +
      "Fields: name, description, tags (string[]), custom (key-value store).",
  }

  for (const trait of BUILT_IN_TRAITS) {
    lines.push(`### ${trait.name}`)
    const desc = builtInDescriptions[trait.name]
    if (desc) lines.push(desc)
    lines.push("")
  }

  // ── Constraints ───────────────────────────────────────────────
  const constraints = schema.constraints ?? []
  if (constraints.length > 0) {
    lines.push("## Constraints")
    lines.push("")
    lines.push(
      "Constraints are rules the engine enforces. " +
        "Violating a 'prevent' constraint will block your action.",
    )
    lines.push("")

    for (const c of constraints) {
      const effectLabel =
        c.effect === "prevent"
          ? "⛔ prevent"
          : c.effect === "warn"
            ? "⚠️ warn"
            : c.effect === "adjust"
              ? "🔧 adjust"
              : "✅ enforce"

      lines.push(`### ${c.name} [${effectLabel}]`)
      lines.push(c.description)
      lines.push("")
    }
  }

  // ── Actions ───────────────────────────────────────────────────
  lines.push("## Available Actions")
  lines.push("")

  const actionLines: string[] = []
  for (const et of entityTypes) {
    actionLines.push(`- \`create_${et.type}\` — Create a ${et.label}`)
  }
  actionLines.push("- `delete_entity` — Delete an entity (cascades to children)")
  actionLines.push("- `update_trait` — Update trait data on an entity")
  actionLines.push("- `list_entities` — List all entities (optional type filter)")
  actionLines.push("- `get_entity` — Get entity details by ID")
  actionLines.push("- `get_connections` — Get parent and children of an entity")
  actionLines.push("- `undo` — Undo the last action")
  actionLines.push("- `redo` — Redo the last undone action")

  lines.push(...actionLines)
  lines.push("")

  return lines.join("\n")
}
