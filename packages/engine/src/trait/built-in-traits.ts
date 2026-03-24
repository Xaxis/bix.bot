import { z } from "zod"
import { type TraitDefinition, defineTrait } from "./trait-definition.js"

// ── Shared geometry schemas ─────────────────────────────────────

export const Vec3Schema = z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
})
export type Vec3 = z.infer<typeof Vec3Schema>

export const QuatSchema = z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    w: z.number(),
})
export type Quat = z.infer<typeof QuatSchema>

// ── Spatial ─────────────────────────────────────────────────────

export const SpatialDataSchema = z.object({
    position: Vec3Schema,
    rotation: QuatSchema,
    scale: Vec3Schema,
})
export type SpatialData = z.infer<typeof SpatialDataSchema>

export const SpatialTrait: TraitDefinition = defineTrait({
    name: "spatial",
    schema: SpatialDataSchema,
    defaults: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
    },
    editable: {
        fields: {
            "position.x": { label: "X", widget: "input" },
            "position.y": { label: "Y", widget: "input" },
            "position.z": { label: "Z", widget: "input" },
            "scale.x": { label: "Scale X", widget: "input" },
            "scale.y": { label: "Scale Y", widget: "input" },
            "scale.z": { label: "Scale Z", widget: "input" },
        },
    },
})

// ── Renderable ──────────────────────────────────────────────────

export const RenderableDataSchema = z.object({
    meshRef: z.string().optional(),
    materialRef: z.string().optional(),
    visible: z.boolean(),
    opacity: z.number().min(0).max(1),
    layer: z.number().int().nonnegative(),
})
export type RenderableData = z.infer<typeof RenderableDataSchema>

export const RenderableTrait: TraitDefinition = defineTrait({
    name: "renderable",
    schema: RenderableDataSchema,
    defaults: {
        visible: true,
        opacity: 1,
        layer: 0,
    },
    editable: {
        fields: {
            visible: { label: "Visible", widget: "toggle" },
            opacity: { label: "Opacity", widget: "slider", min: 0, max: 1, step: 0.01 },
        },
    },
})

// ── Connectable ─────────────────────────────────────────────────

export const SnapPointSchema = z.object({
    id: z.string().min(1),
    position: Vec3Schema,
    normal: Vec3Schema,
    compatible: z.array(z.string()),
})
export type SnapPoint = z.infer<typeof SnapPointSchema>

export const ConnectionSchema = z.object({
    portId: z.string().min(1),
    targetEntityId: z.string().min(1),
    targetPortId: z.string().min(1),
})
export type Connection = z.infer<typeof ConnectionSchema>

export const ConnectableDataSchema = z.object({
    ports: z.array(SnapPointSchema),
    maxConnections: z.number().int().nonnegative(),
    connections: z.array(ConnectionSchema),
})
export type ConnectableData = z.infer<typeof ConnectableDataSchema>

export const ConnectableTrait: TraitDefinition = defineTrait({
    name: "connectable",
    schema: ConnectableDataSchema,
    defaults: {
        ports: [],
        maxConnections: 0,
        connections: [],
    },
})

// ── Editable ────────────────────────────────────────────────────

export const FieldOverrideSchema = z.object({
    label: z.string().optional(),
    widget: z.enum(["slider", "input", "dropdown", "color", "toggle", "vec3"]).optional(),
    hidden: z.boolean().optional(),
    readonly: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    options: z.array(z.string()).optional(),
})

export const EditableDataSchema = z.object({
    fieldOverrides: z.record(z.string(), FieldOverrideSchema),
})
export type EditableData = z.infer<typeof EditableDataSchema>

export const EditableTrait: TraitDefinition = defineTrait({
    name: "editable",
    schema: EditableDataSchema,
    defaults: {
        fieldOverrides: {},
    },
})

// ── Metadata ────────────────────────────────────────────────────

export const MetadataDataSchema = z.object({
    name: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    custom: z.record(z.string(), z.unknown()),
})
export type MetadataData = z.infer<typeof MetadataDataSchema>

export const MetadataTrait: TraitDefinition = defineTrait({
    name: "metadata",
    schema: MetadataDataSchema,
    defaults: {
        name: "",
        description: "",
        tags: [],
        custom: {},
    },
})

// ── All built-in traits ─────────────────────────────────────────

export const BUILT_IN_TRAITS: readonly TraitDefinition[] = [
    SpatialTrait,
    RenderableTrait,
    ConnectableTrait,
    EditableTrait,
    MetadataTrait,
] as const

export const BUILT_IN_TRAIT_NAMES: readonly string[] = BUILT_IN_TRAITS.map((t) => t.name)
