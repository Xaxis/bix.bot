/**
 * Test Schema — used as the capstone integration test fixture for Phase 1.
 *
 * Domain: a simple "snap-together box system."
 *
 * Entity types:
 *   - Box      — a physical container with color and size
 *   - Connector — an attachment point that must be parented to a Box
 *   - Label    — a text annotation with metadata
 *
 * Domain traits:
 *   - color    — one of five named colors
 *   - size     — width × height × depth (all ≥ 0.1)
 *
 * Constraints:
 *   - connector-parent-is-box  (prevent) — a Connector's parent must be a Box
 *   - box-min-size             (prevent) — Box size dimensions must each be ≥ 1
 *
 * Systems:
 *   - label-counter  (pre-physics, priority 0) — counts Label entities and
 *     stores the total in a metadata key so integration tests can verify
 *     that tick() actually runs and can mutate state.
 */
import { z } from "zod"
import { defineSchema } from "../schema/schema.js"
import { defineTrait } from "../trait/trait-definition.js"
import { defineEntityType } from "../schema/schema.js"
import { defineConstraint } from "../constraint/constraint-definition.js"
import { defineSystem } from "../system/system-definition.js"

// ── Domain traits ────────────────────────────────────────────────

export const ColorSchema = z.object({
  value: z.enum(["red", "green", "blue", "yellow", "white"]),
})
export type Color = z.infer<typeof ColorSchema>

export const colorTrait = defineTrait({
  name: "color",
  schema: ColorSchema,
  defaults: { value: "white" as const },
  editable: {
    fields: {
      value: {
        label: "Color",
        widget: "dropdown",
        options: ["red", "green", "blue", "yellow", "white"],
      },
    },
  },
})

export const SizeSchema = z.object({
  width: z.number().min(0.1),
  height: z.number().min(0.1),
  depth: z.number().min(0.1),
})
export type Size = z.infer<typeof SizeSchema>

export const sizeTrait = defineTrait({
  name: "size",
  schema: SizeSchema,
  defaults: { width: 1, height: 1, depth: 1 },
  editable: {
    fields: {
      width: { label: "Width", widget: "input" },
      height: { label: "Height", widget: "input" },
      depth: { label: "Depth", widget: "input" },
    },
  },
})

// ── Entity types ─────────────────────────────────────────────────

export const BoxEntityType = defineEntityType({
  type: "box",
  label: "Box",
  description: "A physical container with color and size.",
  traits: ["color", "size"],
  icon: "box",
})

export const ConnectorEntityType = defineEntityType({
  type: "connector",
  label: "Connector",
  description: "An attachment point. Must be parented to a Box.",
  traits: ["metadata"],
  icon: "link",
})

export const LabelEntityType = defineEntityType({
  type: "label",
  label: "Label",
  description: "A text annotation attached to the world.",
  traits: ["metadata"],
  icon: "tag",
})

// ── Constraints ───────────────────────────────────────────────────

/**
 * A Connector must always have a parent entity of type "box".
 * Checked when a Connector is created or reparented.
 */
export const connectorParentIsBox = defineConstraint({
  name: "connector-parent-is-box",
  description: "Connectors must be parented to a Box entity.",
  priority: 20,
  scope: "local",
  effect: "prevent",
  watch: {
    entityTypes: ["connector"],
    intentTypes: ["entity.create", "entity.reparent"],
  },
  evaluate(ctx) {
    const intent = ctx.trigger.intent

    // Only applies to connector creates and reparent operations
    const isConnectorCreate =
      intent.type === "entity.create" && intent.params["entityType"] === "connector"
    const isConnectorReparent =
      intent.type === "entity.reparent" &&
      (() => {
        const entityId = intent.params["entityId"] as string | undefined
        return entityId !== undefined && ctx.entities.byId(entityId)?.type === "connector"
      })()

    if (!isConnectorCreate && !isConnectorReparent) {
      return { valid: true, violations: [] }
    }

    // For create: parent is in intent params
    // For reparent: new parent is in intent params
    const parentId = (
      intent.type === "entity.create"
        ? intent.params["parent"]
        : intent.params["newParentId"]
    ) as string | undefined

    if (parentId === undefined) {
      return {
        valid: false,
        violations: [
          {
            constraintName: "connector-parent-is-box",
            message:
              "A Connector must be parented to a Box. Specify a parent box entity.",
            entityIds: [],
            effect: "prevent",
          },
        ],
      }
    }

    const parentEntity = ctx.entities.byId(parentId)
    if (parentEntity === undefined) {
      return {
        valid: false,
        violations: [
          {
            constraintName: "connector-parent-is-box",
            message: `Parent entity "${parentId}" does not exist.`,
            entityIds: [parentId],
            effect: "prevent",
          },
        ],
      }
    }

    if (parentEntity.type !== "box") {
      return {
        valid: false,
        violations: [
          {
            constraintName: "connector-parent-is-box",
            message: `Connectors must be parented to a Box, not a "${parentEntity.type}".`,
            entityIds: [parentId],
            effect: "prevent",
          },
        ],
      }
    }

    return { valid: true, violations: [] }
  },
})

/**
 * Box size dimensions must each be at least 1 unit.
 * Checked when the size trait is updated on any box entity.
 */
export const boxMinSize = defineConstraint({
  name: "box-min-size",
  description: "Box width, height, and depth must each be at least 1.",
  priority: 10,
  scope: "local",
  effect: "prevent",
  watch: {
    entityTypes: ["box"],
    traitNames: ["size"],
  },
  evaluate(ctx) {
    const intent = ctx.trigger.intent

    // Only fires on trait.update targeting the "size" trait
    if (intent.type !== "trait.update" || intent.params["traitName"] !== "size") {
      return { valid: true, violations: [] }
    }

    const entityId = intent.params["entityId"] as string
    const entity = ctx.entities.byId(entityId)
    if (entity?.type !== "box") {
      return { valid: true, violations: [] }
    }

    const proposed = intent.params["data"] as Partial<Size> | undefined
    if (!proposed) return { valid: true, violations: [] }

    type V = {
      constraintName: string
      message: string
      entityIds: string[]
      effect: "prevent"
    }
    const violations: V[] = []

    if (proposed.width !== undefined && proposed.width < 1) {
      violations.push({
        constraintName: "box-min-size",
        message: `Box width ${proposed.width} is below minimum 1.`,
        entityIds: [entityId],
        effect: "prevent",
      })
    }
    if (proposed.height !== undefined && proposed.height < 1) {
      violations.push({
        constraintName: "box-min-size",
        message: `Box height ${proposed.height} is below minimum 1.`,
        entityIds: [entityId],
        effect: "prevent",
      })
    }
    if (proposed.depth !== undefined && proposed.depth < 1) {
      violations.push({
        constraintName: "box-min-size",
        message: `Box depth ${proposed.depth} is below minimum 1.`,
        entityIds: [entityId],
        effect: "prevent",
      })
    }

    return { valid: violations.length === 0, violations }
  },
})

// ── Systems ──────────────────────────────────────────────────────

/**
 * Counts Label entities each tick and stores the count in each
 * label's metadata.custom.tickCount. Purely for testability of tick().
 */
export const labelTickSystem = defineSystem({
  name: "label-ticker",
  requiredTraits: ["metadata"],
  phase: "pre-physics",
  priority: 5,
  update(entities, world) {
    const labelCount = world.query.byType("label").length
    return entities
      .filter((e) => e.type === "label")
      .map((e) => {
        const existing = e.traits["metadata"] as
          | {
              name: string
              description: string
              tags: string[]
              custom: Record<string, unknown>
            }
          | undefined
        const prev = (existing?.custom["tickCount"] as number | undefined) ?? 0
        return {
          type: "trait.update",
          params: {
            entityId: e.id,
            traitName: "metadata",
            data: {
              name: existing?.name ?? "",
              description: existing?.description ?? "",
              tags: existing?.tags ?? [],
              custom: { ...existing?.custom, tickCount: prev + 1, labelCount },
            },
          },
        }
      })
  },
})

// ── Schema ────────────────────────────────────────────────────────

export const testSchema = defineSchema({
  name: "bix-test-schema",
  version: "0.1.0",
  description: "Simple snap-together box system for engine integration tests.",
  traits: [colorTrait, sizeTrait],
  entityTypes: [BoxEntityType, ConnectorEntityType, LabelEntityType],
  constraints: [connectorParentIsBox, boxMinSize],
  systems: [labelTickSystem],
})
