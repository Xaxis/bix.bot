import { describe, it, expect, beforeEach } from "vitest"
import { z } from "zod"
import { World } from "../world/world.js"
import { testSchema } from "../schemas/test-schema.js"
import type { Size } from "../schemas/test-schema.js"
import { generateToolDefinitions } from "./tool-definitions.js"
import { executeAgentTool } from "./execute-tool.js"
import { generateGlossary } from "./glossary.js"
import { zodToJsonSchema } from "./zod-to-json-schema.js"
import { defineSchema } from "../schema/schema.js"
import { defineTrait } from "../trait/trait-definition.js"

// ── zodToJsonSchema ───────────────────────────────────────────────

describe("zodToJsonSchema", () => {
  it("converts ZodString to {type: 'string'}", () => {
    expect(zodToJsonSchema(z.string())).toEqual({ type: "string" })
  })

  it("converts ZodNumber to {type: 'number'}", () => {
    expect(zodToJsonSchema(z.number())).toEqual({ type: "number" })
  })

  it("converts ZodBoolean to {type: 'boolean'}", () => {
    expect(zodToJsonSchema(z.boolean())).toEqual({ type: "boolean" })
  })

  it("converts ZodEnum to {type: 'string', enum: [...]}", () => {
    const result = zodToJsonSchema(z.enum(["a", "b", "c"]))
    expect(result.type).toBe("string")
    expect(result.enum).toEqual(["a", "b", "c"])
  })

  it("converts ZodObject with required fields", () => {
    const schema = z.object({ x: z.number(), y: z.number() })
    const result = zodToJsonSchema(schema)
    expect(result.type).toBe("object")
    expect(result.properties?.["x"]).toEqual({ type: "number" })
    expect(result.properties?.["y"]).toEqual({ type: "number" })
    expect(result.required).toEqual(["x", "y"])
  })

  it("marks ZodOptional fields as not required", () => {
    const schema = z.object({ name: z.string(), tag: z.string().optional() })
    const result = zodToJsonSchema(schema)
    expect(result.required).toContain("name")
    expect(result.required).not.toContain("tag")
  })

  it("converts ZodArray to {type: 'array', items: ...}", () => {
    const result = zodToJsonSchema(z.array(z.string()))
    expect(result.type).toBe("array")
    expect(result.items?.type).toBe("string")
  })

  it("unwraps ZodOptional", () => {
    expect(zodToJsonSchema(z.string().optional())).toEqual({ type: "string" })
  })

  it("converts ZodNumber with min constraint", () => {
    const result = zodToJsonSchema(z.number().min(0.1))
    expect(result.type).toBe("number")
    expect(result.minimum).toBe(0.1)
  })

  it("converts ZodNumber with max constraint", () => {
    const result = zodToJsonSchema(z.number().max(1))
    expect(result.maximum).toBe(1)
  })

  it("converts nested ZodObject", () => {
    const schema = z.object({
      position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    })
    const result = zodToJsonSchema(schema)
    const posSchema = result.properties?.["position"]
    expect(posSchema?.type).toBe("object")
    expect(posSchema?.properties?.["x"]).toEqual({ type: "number" })
  })

  it("converts ZodRecord", () => {
    const result = zodToJsonSchema(z.record(z.string(), z.unknown()))
    expect(result.type).toBe("object")
  })

  it("returns {} for ZodUnknown/ZodAny", () => {
    expect(zodToJsonSchema(z.unknown())).toEqual({})
    expect(zodToJsonSchema(z.any())).toEqual({})
  })
})

// ── generateToolDefinitions ───────────────────────────────────────

describe("generateToolDefinitions", () => {
  it("generates create tools for each entity type", () => {
    const tools = generateToolDefinitions(testSchema)
    const names = tools.map((t) => t.name)
    expect(names).toContain("create_box")
    expect(names).toContain("create_connector")
    expect(names).toContain("create_label")
  })

  it("generates all generic tools", () => {
    const tools = generateToolDefinitions(testSchema)
    const names = tools.map((t) => t.name)
    expect(names).toContain("delete_entity")
    expect(names).toContain("update_trait")
    expect(names).toContain("list_entities")
    expect(names).toContain("get_entity")
    expect(names).toContain("get_connections")
    expect(names).toContain("undo")
    expect(names).toContain("redo")
  })

  it("create_box tool has correct description from schema", () => {
    const tools = generateToolDefinitions(testSchema)
    const createBox = tools.find((t) => t.name === "create_box")!
    expect(createBox.description).toContain("Box")
    expect(createBox.description).toContain("color")
    expect(createBox.description).toContain("size")
  })

  it("create_box parameters include color trait schema", () => {
    const tools = generateToolDefinitions(testSchema)
    const createBox = tools.find((t) => t.name === "create_box")!
    const colorParam = createBox.parameters.properties["color"]
    expect(colorParam).toBeDefined()
    expect(colorParam?.type).toBe("object")
    // The color trait has a 'value' field with enum
    expect(colorParam?.properties?.["value"]).toBeDefined()
    expect(colorParam?.properties?.["value"]?.enum).toContain("red")
    expect(colorParam?.properties?.["value"]?.enum).toContain("blue")
  })

  it("create_box parameters include size trait schema", () => {
    const tools = generateToolDefinitions(testSchema)
    const createBox = tools.find((t) => t.name === "create_box")!
    const sizeParam = createBox.parameters.properties["size"]
    expect(sizeParam).toBeDefined()
    expect(sizeParam?.type).toBe("object")
    expect(sizeParam?.properties?.["width"]).toEqual({ type: "number", minimum: 0.1 })
    expect(sizeParam?.properties?.["height"]).toEqual({ type: "number", minimum: 0.1 })
    expect(sizeParam?.properties?.["depth"]).toEqual({ type: "number", minimum: 0.1 })
  })

  it("create_box parameters include optional id, parent, position", () => {
    const tools = generateToolDefinitions(testSchema)
    const createBox = tools.find((t) => t.name === "create_box")!
    expect(createBox.parameters.properties["id"]).toBeDefined()
    expect(createBox.parameters.properties["parent"]).toBeDefined()
    expect(createBox.parameters.properties["position"]).toBeDefined()
    // None are required
    expect(createBox.parameters.required ?? []).toHaveLength(0)
  })

  it("create_connector includes metadata trait schema", () => {
    const tools = generateToolDefinitions(testSchema)
    const createConnector = tools.find((t) => t.name === "create_connector")!
    const metaParam = createConnector.parameters.properties["metadata"]
    expect(metaParam).toBeDefined()
    expect(metaParam?.type).toBe("object")
    expect(metaParam?.properties?.["name"]).toBeDefined()
  })

  it("delete_entity requires 'id'", () => {
    const tools = generateToolDefinitions(testSchema)
    const del = tools.find((t) => t.name === "delete_entity")!
    expect(del.parameters.required).toContain("id")
  })

  it("update_trait requires entityId, traitName, data", () => {
    const tools = generateToolDefinitions(testSchema)
    const update = tools.find((t) => t.name === "update_trait")!
    expect(update.parameters.required).toContain("entityId")
    expect(update.parameters.required).toContain("traitName")
    expect(update.parameters.required).toContain("data")
  })

  it("list_entities type filter includes schema entity type names", () => {
    const tools = generateToolDefinitions(testSchema)
    const list = tools.find((t) => t.name === "list_entities")!
    const typeParam = list.parameters.properties["type"]
    expect(typeParam?.enum).toContain("box")
    expect(typeParam?.enum).toContain("connector")
    expect(typeParam?.enum).toContain("label")
  })

  it("entity type names with hyphens become underscored tool names", () => {
    const schema = defineSchema({
      name: "test",
      version: "0.1.0",
      traits: [],
      entityTypes: [
        {
          type: "load-bearing-wall",
          label: "Load Bearing Wall",
          description: "A wall",
          traits: [],
        },
      ],
    })
    const tools = generateToolDefinitions(schema)
    expect(tools.map((t) => t.name)).toContain("create_load_bearing_wall")
  })

  it("schema with no entityTypes produces only generic tools", () => {
    const emptySchema = defineSchema({ name: "empty", version: "1.0.0", traits: [] })
    const tools = generateToolDefinitions(emptySchema)
    expect(tools.every((t) => !t.name.startsWith("create_"))).toBe(true)
    expect(tools.some((t) => t.name === "delete_entity")).toBe(true)
  })
})

// ── executeAgentTool ──────────────────────────────────────────────

describe("executeAgentTool — create tools", () => {
  let world: World

  beforeEach(() => {
    world = World.create(testSchema)
  })

  it("execute create_box creates an entity in the World", () => {
    const result = executeAgentTool(world, testSchema, "create_box", {})
    expect(result.success).toBe(true)
    expect(world.query.count).toBe(1)
    expect(world.query.all()[0]?.type).toBe("box")
  })

  it("returns entityId in data", () => {
    const result = executeAgentTool(world, testSchema, "create_box", { id: "b1" })
    expect(result.data).toMatchObject({ entityId: "b1" })
  })

  it("create with position adds spatial trait", () => {
    executeAgentTool(world, testSchema, "create_box", {
      id: "b1",
      position: { x: 5, y: 0, z: 3 },
    })
    const spatial = world.query.byId("b1")?.traits["spatial"] as {
      position: { x: number; z: number }
    }
    expect(spatial.position.x).toBe(5)
    expect(spatial.position.z).toBe(3)
  })

  it("create with trait params sets trait data", () => {
    executeAgentTool(world, testSchema, "create_box", {
      id: "b1",
      color: { value: "red" },
      size: { width: 2, height: 2, depth: 2 },
    })
    const entity = world.query.byId("b1")!
    expect((entity.traits["color"] as { value: string }).value).toBe("red")
    expect((entity.traits["size"] as Size).width).toBe(2)
  })

  it("create_box blocked by constraint returns prevented=true", () => {
    // create_connector without parent → blocked by connector-parent-is-box
    const result = executeAgentTool(world, testSchema, "create_connector", {})
    expect(result.success).toBe(false)
    expect(result.prevented).toBe(true)
    expect(result.error).toContain("Connector")
    expect(world.query.count).toBe(0)
  })

  it("create_connector with valid box parent succeeds", () => {
    executeAgentTool(world, testSchema, "create_box", { id: "box1" })
    const result = executeAgentTool(world, testSchema, "create_connector", {
      id: "con1",
      parent: "box1",
    })
    expect(result.success).toBe(true)
    expect(world.query.byId("con1")?.parent).toBe("box1")
  })

  it("auto-generates ID when not provided", () => {
    const result = executeAgentTool(world, testSchema, "create_box", {})
    expect(result.success).toBe(true)
    const entityId = (result.data as { entityId: string }).entityId
    expect(entityId).toBeTruthy()
    expect(world.query.byId(entityId)).toBeDefined()
  })
})

describe("executeAgentTool — delete_entity", () => {
  let world: World

  beforeEach(() => {
    world = World.create(testSchema)
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
  })

  it("deletes the specified entity", () => {
    const result = executeAgentTool(world, testSchema, "delete_entity", { id: "b1" })
    expect(result.success).toBe(true)
    expect(world.query.byId("b1")).toBeUndefined()
  })

  it("returns error for missing entity", () => {
    const result = executeAgentTool(world, testSchema, "delete_entity", { id: "nope" })
    expect(result.success).toBe(false)
    expect(result.error).toContain("nope")
  })

  it("returns error for missing id param", () => {
    const result = executeAgentTool(world, testSchema, "delete_entity", {})
    expect(result.success).toBe(false)
  })

  it("delete is undoable (went through intent bus)", () => {
    executeAgentTool(world, testSchema, "delete_entity", { id: "b1" })
    expect(world.canUndo).toBe(true)
    world.undo()
    expect(world.query.byId("b1")).toBeDefined()
  })
})

describe("executeAgentTool — update_trait", () => {
  let world: World

  beforeEach(() => {
    world = World.create(testSchema)
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    world.dispatch({
      type: "trait.update",
      params: { entityId: "b1", traitName: "color", data: { value: "white" } },
    })
  })

  it("updates trait data on the entity", () => {
    const result = executeAgentTool(world, testSchema, "update_trait", {
      entityId: "b1",
      traitName: "color",
      data: { value: "blue" },
    })
    expect(result.success).toBe(true)
    expect((world.query.byId("b1")?.traits["color"] as { value: string }).value).toBe(
      "blue",
    )
  })

  it("returns error for missing entity", () => {
    const result = executeAgentTool(world, testSchema, "update_trait", {
      entityId: "ghost",
      traitName: "color",
      data: { value: "red" },
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain("ghost")
  })

  it("constraint prevents invalid size update", () => {
    world.dispatch({
      type: "trait.update",
      params: {
        entityId: "b1",
        traitName: "size",
        data: { width: 2, height: 2, depth: 2 },
      },
    })
    const result = executeAgentTool(world, testSchema, "update_trait", {
      entityId: "b1",
      traitName: "size",
      data: { width: 0.1, height: 2, depth: 2 }, // width too small
    })
    expect(result.success).toBe(false)
    expect(result.prevented).toBe(true)
    expect(result.error).toContain("0.1")
  })
})

describe("executeAgentTool — query tools", () => {
  let world: World

  beforeEach(() => {
    world = World.create(testSchema)
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box1" } })
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "box2" } })
    world.dispatch({ type: "entity.create", params: { entityType: "label", id: "lbl1" } })
    world.dispatch({
      type: "entity.create",
      params: { entityType: "connector", id: "con1", parent: "box1" },
    })
  })

  it("list_entities returns all entities", () => {
    const result = executeAgentTool(world, testSchema, "list_entities", {})
    expect(result.success).toBe(true)
    const data = result.data as { entities: unknown[]; count: number }
    expect(data.count).toBe(4)
  })

  it("list_entities filters by type", () => {
    const result = executeAgentTool(world, testSchema, "list_entities", { type: "box" })
    const data = result.data as { entities: Array<{ type: string }>; count: number }
    expect(data.count).toBe(2)
    expect(data.entities.every((e) => e.type === "box")).toBe(true)
  })

  it("list_entities returns entity summaries with traitNames", () => {
    world.dispatch({
      type: "trait.update",
      params: { entityId: "box1", traitName: "color", data: { value: "red" } },
    })
    const result = executeAgentTool(world, testSchema, "list_entities", { type: "box" })
    const data = result.data as { entities: Array<{ id: string; traitNames: string[] }> }
    const box1 = data.entities.find((e) => e.id === "box1")!
    expect(box1.traitNames).toContain("color")
  })

  it("get_entity returns full entity detail", () => {
    world.dispatch({
      type: "trait.update",
      params: { entityId: "box1", traitName: "color", data: { value: "green" } },
    })
    const result = executeAgentTool(world, testSchema, "get_entity", { id: "box1" })
    const entity = (
      result.data as {
        entity: { id: string; type: string; traits: Record<string, unknown> }
      }
    ).entity
    expect(entity.id).toBe("box1")
    expect(entity.type).toBe("box")
    expect((entity.traits["color"] as { value: string }).value).toBe("green")
  })

  it("get_entity returns null for missing entity", () => {
    const result = executeAgentTool(world, testSchema, "get_entity", { id: "nope" })
    expect(result.success).toBe(true)
    expect((result.data as { entity: null }).entity).toBeNull()
  })

  it("get_connections returns parent and children", () => {
    const result = executeAgentTool(world, testSchema, "get_connections", { id: "box1" })
    const data = result.data as { parent: null; children: string[] }
    expect(data.parent).toBeNull()
    expect(data.children).toContain("con1")
  })

  it("get_connections returns error for missing entity", () => {
    const result = executeAgentTool(world, testSchema, "get_connections", { id: "ghost" })
    expect(result.success).toBe(false)
  })
})

describe("executeAgentTool — undo / redo", () => {
  let world: World

  beforeEach(() => {
    world = World.create(testSchema)
  })

  it("undo reverses last action", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    const result = executeAgentTool(world, testSchema, "undo", {})
    expect(result.success).toBe(true)
    expect((result.data as { changed: boolean }).changed).toBe(true)
    expect(world.query.count).toBe(0)
  })

  it("undo returns changed=false when nothing to undo", () => {
    const result = executeAgentTool(world, testSchema, "undo", {})
    expect((result.data as { changed: boolean }).changed).toBe(false)
  })

  it("redo re-applies after undo", () => {
    world.dispatch({ type: "entity.create", params: { entityType: "box", id: "b1" } })
    world.undo()
    const result = executeAgentTool(world, testSchema, "redo", {})
    expect((result.data as { changed: boolean }).changed).toBe(true)
    expect(world.query.count).toBe(1)
  })
})

describe("executeAgentTool — unknown tool", () => {
  it("returns error for unknown tool name", () => {
    const world = World.create(testSchema)
    const result = executeAgentTool(world, testSchema, "fly_to_moon", {})
    expect(result.success).toBe(false)
    expect(result.error).toContain("Unknown tool")
  })
})

// ── generateGlossary ──────────────────────────────────────────────

describe("generateGlossary", () => {
  it("contains schema name and version", () => {
    const glossary = generateGlossary(testSchema)
    expect(glossary).toContain("bix-test-schema")
    expect(glossary).toContain("0.1.0")
  })

  it("contains schema description", () => {
    const glossary = generateGlossary(testSchema)
    expect(glossary).toContain("snap-together box system")
  })

  it("contains all entity type names and labels", () => {
    const glossary = generateGlossary(testSchema)
    expect(glossary).toContain("Box")
    expect(glossary).toContain("Connector")
    expect(glossary).toContain("Label")
    expect(glossary).toContain("`box`")
    expect(glossary).toContain("`connector`")
    expect(glossary).toContain("`label`")
  })

  it("contains entity type descriptions", () => {
    const glossary = generateGlossary(testSchema)
    expect(glossary).toContain("physical container")
    expect(glossary).toContain("attachment point")
    expect(glossary).toContain("text annotation")
  })

  it("contains domain trait names", () => {
    const glossary = generateGlossary(testSchema)
    expect(glossary).toContain("color")
    expect(glossary).toContain("size")
  })

  it("contains built-in trait names", () => {
    const glossary = generateGlossary(testSchema)
    expect(glossary).toContain("spatial")
    expect(glossary).toContain("renderable")
    expect(glossary).toContain("metadata")
  })

  it("contains constraint names and descriptions", () => {
    const glossary = generateGlossary(testSchema)
    expect(glossary).toContain("connector-parent-is-box")
    expect(glossary).toContain("box-min-size")
    expect(glossary).toContain("Connectors must be parented")
    expect(glossary).toContain("width, height, and depth")
  })

  it("contains available action list", () => {
    const glossary = generateGlossary(testSchema)
    expect(glossary).toContain("create_box")
    expect(glossary).toContain("delete_entity")
    expect(glossary).toContain("update_trait")
    expect(glossary).toContain("list_entities")
    expect(glossary).toContain("undo")
    expect(glossary).toContain("redo")
  })

  it("returns a non-empty string", () => {
    const glossary = generateGlossary(testSchema)
    expect(glossary.length).toBeGreaterThan(200)
  })

  it("works for schema with no entity types", () => {
    const emptySchema = defineSchema({ name: "empty", version: "0.1.0", traits: [] })
    expect(() => generateGlossary(emptySchema)).not.toThrow()
  })

  it("contains trait field information from editable config", () => {
    const schema = defineSchema({
      name: "fields-test",
      version: "0.1.0",
      traits: [
        defineTrait({
          name: "temperature",
          schema: z.object({ celsius: z.number() }),
          defaults: { celsius: 20 },
          editable: {
            fields: { celsius: { label: "Temperature (°C)", widget: "slider" } },
          },
        }),
      ],
    })
    const glossary = generateGlossary(schema)
    expect(glossary).toContain("temperature")
    expect(glossary).toContain("celsius")
  })
})
