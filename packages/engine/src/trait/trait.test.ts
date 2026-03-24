import { describe, it, expect, beforeEach } from "vitest"
import { z } from "zod"
import { defineTrait, type TraitDefinition } from "./trait-definition.js"
import { TraitRegistry } from "./trait-registry.js"
import {
  BUILT_IN_TRAITS,
  BUILT_IN_TRAIT_NAMES,
  SpatialTrait,
  RenderableTrait,
  ConnectableTrait,
  EditableTrait,
  MetadataTrait,
  SpatialDataSchema,
  type SpatialData,
} from "./built-in-traits.js"
import { EntityStore } from "../entity/entity-store.js"

// ─── defineTrait ────────────────────────────────────────────────

describe("defineTrait", () => {
  it("creates a TraitDefinition from valid config", () => {
    const ColorSchema = z.object({
      r: z.number().min(0).max(255),
      g: z.number().min(0).max(255),
      b: z.number().min(0).max(255),
    })

    const trait = defineTrait({
      name: "color",
      schema: ColorSchema,
      defaults: { r: 128, g: 128, b: 128 },
    })

    expect(trait.name).toBe("color")
    expect(trait.schema).toBe(ColorSchema)
    expect(trait.defaults).toEqual({ r: 128, g: 128, b: 128 })
  })

  it("accepts editable config", () => {
    const trait = defineTrait({
      name: "temperature",
      schema: z.object({ value: z.number() }),
      defaults: { value: 20 },
      editable: {
        fields: {
          value: { label: "Temperature", widget: "slider", min: -40, max: 100 },
        },
      },
    })

    expect(trait.editable?.fields["value"]?.widget).toBe("slider")
  })

  it("rejects defaults that don't match schema", () => {
    expect(() =>
      defineTrait({
        name: "broken",
        schema: z.object({ count: z.number() }),
        defaults: { count: "not a number" } as unknown as { count: number },
      }),
    ).toThrow('Trait "broken" defaults do not match schema')
  })

  it("rejects defaults with missing required fields", () => {
    expect(() =>
      defineTrait({
        name: "broken",
        schema: z.object({ x: z.number(), y: z.number() }),
        defaults: { x: 1 } as unknown as { x: number; y: number },
      }),
    ).toThrow('Trait "broken" defaults do not match schema')
  })

  it("strips extra fields from defaults (Zod default behavior)", () => {
    const trait = defineTrait({
      name: "clean",
      schema: z.object({ value: z.number() }),
      defaults: { value: 42, extra: "ignored" } as unknown as { value: number },
    })

    // Zod strips unknown keys by default
    expect(trait.defaults).toEqual({ value: 42 })
  })
})

// ─── TraitRegistry ──────────────────────────────────────────────

describe("TraitRegistry", () => {
  let registry: TraitRegistry
  let colorTrait: TraitDefinition

  beforeEach(() => {
    registry = new TraitRegistry()
    colorTrait = defineTrait({
      name: "color",
      schema: z.object({
        r: z.number().min(0).max(255),
        g: z.number().min(0).max(255),
        b: z.number().min(0).max(255),
      }),
      defaults: { r: 128, g: 128, b: 128 },
    })
  })

  describe("registration", () => {
    it("registers and retrieves a trait definition", () => {
      registry.register(colorTrait)
      expect(registry.get("color")).toBe(colorTrait)
    })

    it("has returns true for registered traits", () => {
      registry.register(colorTrait)
      expect(registry.has("color")).toBe(true)
      expect(registry.has("nonexistent")).toBe(false)
    })

    it("getOrThrow throws for unregistered traits", () => {
      expect(() => registry.getOrThrow("missing")).toThrow(
        'Trait "missing" is not registered',
      )
    })

    it("rejects duplicate registration", () => {
      registry.register(colorTrait)
      expect(() => registry.register(colorTrait)).toThrow(
        'Trait "color" is already registered',
      )
    })

    it("registerAll registers multiple traits", () => {
      const sizeTrait = defineTrait({
        name: "size",
        schema: z.object({ width: z.number(), height: z.number() }),
        defaults: { width: 1, height: 1 },
      })

      registry.registerAll([colorTrait, sizeTrait])
      expect(registry.count).toBe(2)
      expect(registry.has("color")).toBe(true)
      expect(registry.has("size")).toBe(true)
    })

    it("getAll returns all registered definitions", () => {
      registry.register(colorTrait)
      const all = registry.getAll()
      expect(all).toHaveLength(1)
      expect(all[0]).toBe(colorTrait)
    })

    it("getNames returns all registered names", () => {
      registry.register(colorTrait)
      expect(registry.getNames()).toEqual(["color"])
    })

    it("count tracks registrations", () => {
      expect(registry.count).toBe(0)
      registry.register(colorTrait)
      expect(registry.count).toBe(1)
    })
  })

  describe("validation", () => {
    beforeEach(() => {
      registry.register(colorTrait)
    })

    it("validates good data", () => {
      const result = registry.validate("color", { r: 255, g: 0, b: 0 })
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ r: 255, g: 0, b: 0 })
    })

    it("rejects data with wrong types", () => {
      const result = registry.validate("color", {
        r: "red",
        g: 0,
        b: 0,
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain("validation failed")
    })

    it("rejects data with out-of-range values", () => {
      const result = registry.validate("color", { r: 300, g: 0, b: 0 })
      expect(result.success).toBe(false)
    })

    it("rejects data with missing required fields", () => {
      const result = registry.validate("color", { r: 255 })
      expect(result.success).toBe(false)
    })

    it("returns parsed data (strips extra fields)", () => {
      const result = registry.validate("color", {
        r: 100,
        g: 100,
        b: 100,
        extra: "junk",
      })
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ r: 100, g: 100, b: 100 })
    })

    it("returns error for unregistered trait", () => {
      const result = registry.validate("nonexistent", {})
      expect(result.success).toBe(false)
      expect(result.error).toContain("not registered")
    })
  })

  describe("defaults", () => {
    beforeEach(() => {
      registry.register(colorTrait)
    })

    it("returns defaults for a registered trait", () => {
      const defaults = registry.getDefaults("color")
      expect(defaults).toEqual({ r: 128, g: 128, b: 128 })
    })

    it("returns a fresh clone each time", () => {
      const a = registry.getDefaults("color")
      const b = registry.getDefaults("color")
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })

    it("throws for unregistered trait", () => {
      expect(() => registry.getDefaults("missing")).toThrow(
        'Trait "missing" is not registered',
      )
    })
  })
})

// ─── Built-in Traits ────────────────────────────────────────────

describe("built-in traits", () => {
  let registry: TraitRegistry

  beforeEach(() => {
    registry = new TraitRegistry()
    registry.registerAll([...BUILT_IN_TRAITS])
  })

  it("registers all 5 built-in traits", () => {
    expect(registry.count).toBe(5)
    expect(BUILT_IN_TRAIT_NAMES).toEqual([
      "spatial",
      "renderable",
      "connectable",
      "editable",
      "metadata",
    ])
  })

  it("all built-in traits are retrievable", () => {
    for (const name of BUILT_IN_TRAIT_NAMES) {
      expect(registry.has(name)).toBe(true)
    }
  })

  describe("Spatial", () => {
    it("validates correct spatial data", () => {
      const result = registry.validate("spatial", {
        position: { x: 10, y: 20, z: 30 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      })
      expect(result.success).toBe(true)
    })

    it("rejects spatial data with missing position", () => {
      const result = registry.validate("spatial", {
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      })
      expect(result.success).toBe(false)
    })

    it("rejects spatial data with non-numeric position", () => {
      const result = registry.validate("spatial", {
        position: { x: "ten", y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      })
      expect(result.success).toBe(false)
    })

    it("has correct defaults (origin, identity rotation, unit scale)", () => {
      const defaults = registry.getDefaults("spatial") as SpatialData
      expect(defaults.position).toEqual({ x: 0, y: 0, z: 0 })
      expect(defaults.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 })
      expect(defaults.scale).toEqual({ x: 1, y: 1, z: 1 })
    })

    it("has editable field config", () => {
      expect(SpatialTrait.editable).toBeDefined()
      expect(SpatialTrait.editable?.fields["position.x"]).toBeDefined()
    })

    it("inferred type matches schema", () => {
      const data: SpatialData = SpatialDataSchema.parse({
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      })
      expect(data.position.x).toBe(1)
    })
  })

  describe("Renderable", () => {
    it("validates correct renderable data", () => {
      const result = registry.validate("renderable", {
        meshRef: "cube",
        materialRef: "red-metal",
        visible: true,
        opacity: 0.5,
        layer: 0,
      })
      expect(result.success).toBe(true)
    })

    it("allows optional meshRef/materialRef", () => {
      const result = registry.validate("renderable", {
        visible: true,
        opacity: 1,
        layer: 0,
      })
      expect(result.success).toBe(true)
    })

    it("rejects opacity out of range", () => {
      const result = registry.validate("renderable", {
        visible: true,
        opacity: 1.5,
        layer: 0,
      })
      expect(result.success).toBe(false)
    })

    it("rejects negative layer", () => {
      const result = registry.validate("renderable", {
        visible: true,
        opacity: 1,
        layer: -1,
      })
      expect(result.success).toBe(false)
    })

    it("has correct defaults", () => {
      const defaults = registry.getDefaults("renderable")
      expect(defaults).toEqual({ visible: true, opacity: 1, layer: 0 })
    })
  })

  describe("Connectable", () => {
    it("validates connectable data with ports and connections", () => {
      const result = registry.validate("connectable", {
        ports: [
          {
            id: "top",
            position: { x: 0, y: 1, z: 0 },
            normal: { x: 0, y: 1, z: 0 },
            compatible: ["bottom"],
          },
        ],
        maxConnections: 4,
        connections: [
          {
            portId: "top",
            targetEntityId: "other-entity",
            targetPortId: "bottom",
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it("validates empty connectable data", () => {
      const result = registry.validate("connectable", {
        ports: [],
        maxConnections: 0,
        connections: [],
      })
      expect(result.success).toBe(true)
    })

    it("rejects port with missing id", () => {
      const result = registry.validate("connectable", {
        ports: [
          {
            position: { x: 0, y: 0, z: 0 },
            normal: { x: 0, y: 1, z: 0 },
            compatible: [],
          },
        ],
        maxConnections: 1,
        connections: [],
      })
      expect(result.success).toBe(false)
    })

    it("has correct defaults (empty ports/connections)", () => {
      const defaults = registry.getDefaults("connectable")
      expect(defaults).toEqual({
        ports: [],
        maxConnections: 0,
        connections: [],
      })
    })
  })

  describe("Editable", () => {
    it("validates editable data with field overrides", () => {
      const result = registry.validate("editable", {
        fieldOverrides: {
          "position.x": {
            label: "X Position",
            widget: "slider",
            min: -100,
            max: 100,
          },
        },
      })
      expect(result.success).toBe(true)
    })

    it("validates empty field overrides", () => {
      const result = registry.validate("editable", { fieldOverrides: {} })
      expect(result.success).toBe(true)
    })

    it("rejects invalid widget type", () => {
      const result = registry.validate("editable", {
        fieldOverrides: {
          foo: { widget: "not-a-widget" },
        },
      })
      expect(result.success).toBe(false)
    })
  })

  describe("Metadata", () => {
    it("validates metadata data", () => {
      const result = registry.validate("metadata", {
        name: "My Entity",
        description: "A test entity",
        tags: ["test", "example"],
        custom: { author: "wilneeley" },
      })
      expect(result.success).toBe(true)
    })

    it("rejects missing name", () => {
      const result = registry.validate("metadata", {
        description: "test",
        tags: [],
        custom: {},
      })
      expect(result.success).toBe(false)
    })

    it("has correct defaults (empty strings, empty arrays)", () => {
      const defaults = registry.getDefaults("metadata")
      expect(defaults).toEqual({
        name: "",
        description: "",
        tags: [],
        custom: {},
      })
    })
  })
})

// ─── EntityStore + TraitRegistry integration ────────────────────

describe("EntityStore with TraitRegistry", () => {
  let registry: TraitRegistry
  let store: EntityStore

  beforeEach(() => {
    registry = new TraitRegistry()
    registry.registerAll([...BUILT_IN_TRAITS])

    // Add a custom "color" trait for testing
    registry.register(
      defineTrait({
        name: "color",
        schema: z.object({
          r: z.number().min(0).max(255),
          g: z.number().min(0).max(255),
          b: z.number().min(0).max(255),
        }),
        defaults: { r: 128, g: 128, b: 128 },
      }),
    )

    store = new EntityStore(registry)
  })

  it("setTrait validates and stores good data", () => {
    store.create("box", { id: "b" })
    store.setTrait("b", "spatial", {
      position: { x: 10, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    })

    const data = store.getTrait("b", "spatial") as SpatialData
    expect(data.position.x).toBe(10)
  })

  it("setTrait rejects invalid data", () => {
    store.create("box", { id: "b" })
    expect(() => store.setTrait("b", "spatial", { position: "not a vec3" })).toThrow(
      "validation failed",
    )
  })

  it("setTrait rejects unregistered trait", () => {
    store.create("box", { id: "b" })
    expect(() => store.setTrait("b", "nonexistent", { foo: "bar" })).toThrow(
      "not registered",
    )
  })

  it("setTrait strips extra fields (Zod parsing)", () => {
    store.create("box", { id: "b" })
    store.setTrait("b", "color", { r: 255, g: 0, b: 0, extra: "junk" })

    const data = store.getTrait("b", "color")
    expect(data).toEqual({ r: 255, g: 0, b: 0 })
  })

  it("setTraitDefaults applies registered defaults", () => {
    store.create("box", { id: "b" })
    store.setTraitDefaults("b", "spatial")

    const data = store.getTrait("b", "spatial") as SpatialData
    expect(data.position).toEqual({ x: 0, y: 0, z: 0 })
    expect(data.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 })
    expect(data.scale).toEqual({ x: 1, y: 1, z: 1 })
  })

  it("setTraitDefaults merges overrides on top of defaults", () => {
    store.create("box", { id: "b" })
    store.setTraitDefaults("b", "spatial", {
      position: { x: 50, y: 0, z: 0 },
    })

    const data = store.getTrait("b", "spatial") as SpatialData
    expect(data.position).toEqual({ x: 50, y: 0, z: 0 })
    // Overrides only replaced position — rotation and scale came from defaults
    expect(data.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 })
    expect(data.scale).toEqual({ x: 1, y: 1, z: 1 })
  })

  it("setTraitDefaults validates the merged result", () => {
    store.create("box", { id: "b" })
    expect(() => store.setTraitDefaults("b", "color", { r: 999 })).toThrow(
      "validation failed",
    )
  })

  it("setTraitDefaults throws without a registry", () => {
    const bareStore = new EntityStore()
    bareStore.create("box", { id: "b" })

    expect(() => bareStore.setTraitDefaults("b", "spatial")).toThrow(
      "requires a TraitRegistry",
    )
  })

  it("getTrait returns undefined for unset traits", () => {
    store.create("box", { id: "b" })
    expect(store.getTrait("b", "spatial")).toBeUndefined()
  })

  it("removeTrait removes trait data", () => {
    store.create("box", { id: "b" })
    store.setTraitDefaults("b", "spatial")
    expect(store.hasTrait("b", "spatial")).toBe(true)

    store.removeTrait("b", "spatial")
    expect(store.hasTrait("b", "spatial")).toBe(false)
    expect(store.getTrait("b", "spatial")).toBeUndefined()
  })

  it("hasTrait correctly checks presence", () => {
    store.create("box", { id: "b" })
    expect(store.hasTrait("b", "spatial")).toBe(false)

    store.setTraitDefaults("b", "spatial")
    expect(store.hasTrait("b", "spatial")).toBe(true)
  })

  it("multiple traits on same entity", () => {
    store.create("box", { id: "b" })
    store.setTraitDefaults("b", "spatial")
    store.setTraitDefaults("b", "renderable")
    store.setTrait("b", "color", { r: 255, g: 0, b: 0 })

    expect(store.hasTrait("b", "spatial")).toBe(true)
    expect(store.hasTrait("b", "renderable")).toBe(true)
    expect(store.hasTrait("b", "color")).toBe(true)

    const entity = store.getOrThrow("b")
    expect(Object.keys(entity.traits)).toHaveLength(3)
  })

  it("getTraitRegistry returns the registry", () => {
    expect(store.getTraitRegistry()).toBe(registry)
  })

  it("EntityStore without registry allows any trait data", () => {
    const bareStore = new EntityStore()
    bareStore.create("box", { id: "b" })
    bareStore.setTrait("b", "anything", { foo: "bar" })
    expect(bareStore.getTrait("b", "anything")).toEqual({ foo: "bar" })
  })
})
