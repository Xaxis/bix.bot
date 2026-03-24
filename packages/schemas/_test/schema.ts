/**
 * packages/schemas/_test/schema.ts
 *
 * Template showing how a consumer project defines its schema.
 * This file uses @bix/engine imports (the published package) — exactly
 * how a domain project (my-homescape/, asteroid-sim/, etc.) would author
 * their schema. It is NOT imported by the engine's own tests; it exists
 * as a reference / scaffolding template.
 *
 * In a real consumer project, this would live at:
 *   schema/index.ts (or schema/index.ts with sub-files for traits, entities, constraints)
 *
 * To scaffold a new domain project, run:
 *   npx create-bix-app my-new-domain   (Phase 5 — not yet implemented)
 */

// In a real consumer project, these imports come from @bix/engine (npm).
// In the monorepo, they resolve to packages/engine/src/index.ts.
import {
    defineSchema,
    defineTrait,
    defineEntityType,
    defineConstraint,
    defineSystem,
} from "@bix/engine"
import { z } from "zod"

// ── Domain traits ─────────────────────────────────────────────────

const colorTrait = defineTrait({
    name: "color",
    schema: z.object({
        value: z.enum(["red", "green", "blue", "yellow", "white"]),
    }),
    defaults: { value: "white" as const },
})

const sizeTrait = defineTrait({
    name: "size",
    schema: z.object({
        width: z.number().min(0.1),
        height: z.number().min(0.1),
        depth: z.number().min(0.1),
    }),
    defaults: { width: 1, height: 1, depth: 1 },
})

// ── Entity types ──────────────────────────────────────────────────

const Box = defineEntityType({
    type: "box",
    label: "Box",
    description: "A physical container with color and size.",
    traits: ["color", "size"],
    icon: "box",
})

const Connector = defineEntityType({
    type: "connector",
    label: "Connector",
    description: "An attachment point. Must be parented to a Box.",
    traits: ["metadata"],
    icon: "link",
})

const Label = defineEntityType({
    type: "label",
    label: "Label",
    description: "A text annotation attached to the world.",
    traits: ["metadata"],
    icon: "tag",
})

// ── Constraints ───────────────────────────────────────────────────

const connectorParentIsBox = defineConstraint({
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
        const isConnectorCreate =
            intent.type === "entity.create" && intent.params["entityType"] === "connector"
        if (!isConnectorCreate) return { valid: true, violations: [] }

        const parentId = intent.params["parent"] as string | undefined
        if (!parentId || ctx.entities.byId(parentId)?.type !== "box") {
            return {
                valid: false,
                violations: [
                    {
                        constraintName: "connector-parent-is-box",
                        message: "A Connector must be parented to a Box.",
                        entityIds: [],
                        effect: "prevent" as const,
                    },
                ],
            }
        }
        return { valid: true, violations: [] }
    },
})

const boxMinSize = defineConstraint({
    name: "box-min-size",
    description: "Box dimensions must each be ≥ 1.",
    priority: 10,
    scope: "local",
    effect: "prevent",
    watch: { entityTypes: ["box"], traitNames: ["size"] },
    evaluate(ctx) {
        const intent = ctx.trigger.intent
        if (intent.type !== "trait.update" || intent.params["traitName"] !== "size") {
            return { valid: true, violations: [] }
        }
        const proposed = intent.params["data"] as {
            width?: number
            height?: number
            depth?: number
        }
        const tooSmall = Object.entries(proposed).some(
            ([, v]) => typeof v === "number" && v < 1,
        )
        if (tooSmall) {
            return {
                valid: false,
                violations: [
                    {
                        constraintName: "box-min-size",
                        message: "Box dimensions must each be at least 1.",
                        entityIds: [intent.params["entityId"] as string],
                        effect: "prevent" as const,
                    },
                ],
            }
        }
        return { valid: true, violations: [] }
    },
})

// ── Systems ───────────────────────────────────────────────────────

const labelTickerSystem = defineSystem({
    name: "label-ticker",
    requiredTraits: ["metadata"],
    phase: "pre-physics",
    priority: 5,
    update() {
        return [] // placeholder — see full implementation in engine test fixture
    },
})

// ── Schema ────────────────────────────────────────────────────────

export default defineSchema({
    name: "bix-test-schema",
    version: "0.1.0",
    description: "Simple snap-together box system — template for consumer projects.",
    traits: [colorTrait, sizeTrait],
    entityTypes: [Box, Connector, Label],
    constraints: [connectorParentIsBox, boxMinSize],
    systems: [labelTickerSystem],
})
