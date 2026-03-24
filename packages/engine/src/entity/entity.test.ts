import { describe, it, expect, beforeEach } from "vitest"
import { createEntity, EntitySchema } from "./entity.js"
import { EntityStore } from "./entity-store.js"

// ─── createEntity ───────────────────────────────────────────────

describe("createEntity", () => {
  it("creates an entity with a generated id", () => {
    const entity = createEntity("box")
    expect(entity.id).toBeTruthy()
    expect(entity.type).toBe("box")
    expect(entity.traits).toEqual({})
    expect(entity.children).toEqual([])
    expect(entity.parent).toBeUndefined()
  })

  it("accepts a custom id", () => {
    const entity = createEntity("box", { id: "custom-1" })
    expect(entity.id).toBe("custom-1")
  })

  it("accepts initial trait data", () => {
    const entity = createEntity("box", {
      traits: { color: { r: 255, g: 0, b: 0 } },
    })
    expect(entity.traits["color"]).toEqual({ r: 255, g: 0, b: 0 })
  })

  it("accepts a parent id", () => {
    const entity = createEntity("box", { parent: "parent-1" })
    expect(entity.parent).toBe("parent-1")
  })

  it("rejects empty type", () => {
    expect(() => createEntity("")).toThrow()
  })

  it("rejects empty id", () => {
    expect(() => createEntity("box", { id: "" })).toThrow()
  })

  it("validates against EntitySchema", () => {
    const entity = createEntity("wall")
    expect(EntitySchema.safeParse(entity).success).toBe(true)
  })
})

// ─── EntityStore CRUD ───────────────────────────────────────────

describe("EntityStore", () => {
  let store: EntityStore

  beforeEach(() => {
    store = new EntityStore()
  })

  describe("CRUD", () => {
    it("creates and retrieves an entity", () => {
      const entity = store.create("box")
      expect(store.get(entity.id)).toBe(entity)
    })

    it("getOrThrow returns the entity", () => {
      const entity = store.create("box")
      expect(store.getOrThrow(entity.id)).toBe(entity)
    })

    it("getOrThrow throws for missing entity", () => {
      expect(() => store.getOrThrow("nonexistent")).toThrow(
        'Entity "nonexistent" not found',
      )
    })

    it("get returns undefined for missing entity", () => {
      expect(store.get("nonexistent")).toBeUndefined()
    })

    it("has returns true for existing entities", () => {
      const entity = store.create("box")
      expect(store.has(entity.id)).toBe(true)
      expect(store.has("nonexistent")).toBe(false)
    })

    it("rejects duplicate ids", () => {
      store.create("box", { id: "dupe" })
      expect(() => store.create("box", { id: "dupe" })).toThrow(
        'Entity with id "dupe" already exists',
      )
    })

    it("deletes an entity", () => {
      const entity = store.create("box")
      store.delete(entity.id)
      expect(store.has(entity.id)).toBe(false)
      expect(store.count).toBe(0)
    })

    it("delete throws for missing entity", () => {
      expect(() => store.delete("nonexistent")).toThrow()
    })

    it("getAll returns all entities", () => {
      store.create("box", { id: "a" })
      store.create("wall", { id: "b" })
      store.create("box", { id: "c" })
      expect(store.getAll()).toHaveLength(3)
    })

    it("getByType filters entities", () => {
      store.create("box", { id: "a" })
      store.create("wall", { id: "b" })
      store.create("box", { id: "c" })
      expect(store.getByType("box")).toHaveLength(2)
      expect(store.getByType("wall")).toHaveLength(1)
      expect(store.getByType("door")).toHaveLength(0)
    })

    it("count tracks entity count", () => {
      expect(store.count).toBe(0)
      store.create("box", { id: "a" })
      expect(store.count).toBe(1)
      store.create("box", { id: "b" })
      expect(store.count).toBe(2)
      store.delete("a")
      expect(store.count).toBe(1)
    })

    it("clear removes all entities", () => {
      store.create("box", { id: "a" })
      store.create("box", { id: "b" })
      store.clear()
      expect(store.count).toBe(0)
      expect(store.getAll()).toEqual([])
    })
  })

  // ─── Parent/Child Composition ───────────────────────────────

  describe("composition", () => {
    it("addChild establishes parent-child relationship", () => {
      const parent = store.create("group", { id: "p" })
      const child = store.create("box", { id: "c" })

      store.addChild("p", "c")

      expect(child.parent).toBe("p")
      expect(parent.children).toContain("c")
    })

    it("create with parent option wires up the relationship", () => {
      store.create("group", { id: "p" })
      const child = store.create("box", { id: "c", parent: "p" })

      expect(child.parent).toBe("p")
      expect(store.getOrThrow("p").children).toContain("c")
    })

    it("getChildren returns direct children", () => {
      store.create("group", { id: "p" })
      store.create("box", { id: "c1", parent: "p" })
      store.create("box", { id: "c2", parent: "p" })

      const children = store.getChildren("p")
      expect(children).toHaveLength(2)
      expect(children.map((c) => c.id)).toEqual(["c1", "c2"])
    })

    it("getParent returns the parent", () => {
      store.create("group", { id: "p" })
      store.create("box", { id: "c", parent: "p" })

      const parent = store.getParent("c")
      expect(parent?.id).toBe("p")
    })

    it("getParent returns undefined for root entities", () => {
      store.create("box", { id: "root" })
      expect(store.getParent("root")).toBeUndefined()
    })

    it("removeChild detaches the child", () => {
      store.create("group", { id: "p" })
      store.create("box", { id: "c", parent: "p" })

      store.removeChild("p", "c")

      const parent = store.getOrThrow("p")
      const child = store.getOrThrow("c")
      expect(parent.children).not.toContain("c")
      expect(child.parent).toBeUndefined()
    })

    it("removeChild throws if not actually a child", () => {
      store.create("group", { id: "p" })
      store.create("box", { id: "other" })

      expect(() => store.removeChild("p", "other")).toThrow(
        'Entity "other" is not a child of "p"',
      )
    })

    it("addChild reparents from previous parent", () => {
      store.create("group", { id: "p1" })
      store.create("group", { id: "p2" })
      store.create("box", { id: "c", parent: "p1" })

      store.addChild("p2", "c")

      expect(store.getOrThrow("p1").children).not.toContain("c")
      expect(store.getOrThrow("p2").children).toContain("c")
      expect(store.getOrThrow("c").parent).toBe("p2")
    })

    it("addChild rejects self-parenting", () => {
      store.create("box", { id: "x" })
      expect(() => store.addChild("x", "x")).toThrow("An entity cannot be its own child")
    })

    it("addChild rejects circular composition", () => {
      store.create("group", { id: "a" })
      store.create("group", { id: "b", parent: "a" })
      store.create("group", { id: "c", parent: "b" })

      // Trying to make "a" a child of "c" would create a→b→c→a cycle
      expect(() => store.addChild("c", "a")).toThrow("cycle")
    })

    it("addChild rejects deep circular composition", () => {
      store.create("group", { id: "a" })
      store.create("group", { id: "b", parent: "a" })
      store.create("group", { id: "c", parent: "b" })
      store.create("group", { id: "d", parent: "c" })

      // a→b→c→d, trying to make a child of d creates a→b→c→d→a
      expect(() => store.addChild("d", "a")).toThrow("cycle")
    })
  })

  // ─── Cascade / Detach Delete ──────────────────────────────────

  describe("delete with composition", () => {
    it("cascade delete removes all descendants", () => {
      store.create("group", { id: "root" })
      store.create("group", { id: "mid", parent: "root" })
      store.create("box", { id: "leaf1", parent: "mid" })
      store.create("box", { id: "leaf2", parent: "mid" })
      store.create("box", { id: "sibling", parent: "root" })

      store.delete("root", { cascade: true })

      expect(store.count).toBe(0)
      expect(store.has("root")).toBe(false)
      expect(store.has("mid")).toBe(false)
      expect(store.has("leaf1")).toBe(false)
      expect(store.has("leaf2")).toBe(false)
      expect(store.has("sibling")).toBe(false)
    })

    it("cascade is the default delete behavior", () => {
      store.create("group", { id: "p" })
      store.create("box", { id: "c", parent: "p" })

      store.delete("p")

      expect(store.count).toBe(0)
    })

    it("non-cascade delete detaches children", () => {
      store.create("group", { id: "p" })
      store.create("box", { id: "c1", parent: "p" })
      store.create("box", { id: "c2", parent: "p" })

      store.delete("p", { cascade: false })

      expect(store.has("p")).toBe(false)
      expect(store.has("c1")).toBe(true)
      expect(store.has("c2")).toBe(true)
      expect(store.getOrThrow("c1").parent).toBeUndefined()
      expect(store.getOrThrow("c2").parent).toBeUndefined()
    })

    it("deleting a child removes it from parent's children list", () => {
      store.create("group", { id: "p" })
      store.create("box", { id: "c1", parent: "p" })
      store.create("box", { id: "c2", parent: "p" })

      store.delete("c1")

      const parent = store.getOrThrow("p")
      expect(parent.children).toEqual(["c2"])
    })
  })

  // ─── Traversal ────────────────────────────────────────────────

  describe("traversal", () => {
    beforeEach(() => {
      // Build a tree: root → [mid1 → [leaf1, leaf2], mid2 → [leaf3]]
      store.create("group", { id: "root" })
      store.create("group", { id: "mid1", parent: "root" })
      store.create("group", { id: "mid2", parent: "root" })
      store.create("box", { id: "leaf1", parent: "mid1" })
      store.create("box", { id: "leaf2", parent: "mid1" })
      store.create("box", { id: "leaf3", parent: "mid2" })
    })

    it("getDescendants returns all descendants depth-first", () => {
      const desc = store.getDescendants("root")
      const ids = desc.map((e) => e.id)

      expect(ids).toHaveLength(5)
      // mid1 comes before its children, mid2 before leaf3
      expect(ids.indexOf("mid1")).toBeLessThan(ids.indexOf("leaf1"))
      expect(ids.indexOf("mid1")).toBeLessThan(ids.indexOf("leaf2"))
      expect(ids.indexOf("mid2")).toBeLessThan(ids.indexOf("leaf3"))
    })

    it("getDescendants returns empty for leaf nodes", () => {
      expect(store.getDescendants("leaf1")).toEqual([])
    })

    it("getAncestors returns ancestors nearest-first", () => {
      const ancestors = store.getAncestors("leaf1")
      const ids = ancestors.map((e) => e.id)

      expect(ids).toEqual(["mid1", "root"])
    })

    it("getAncestors returns empty for root entities", () => {
      expect(store.getAncestors("root")).toEqual([])
    })
  })

  // ─── Trait Data (basic storage) ───────────────────────────────

  describe("trait data storage", () => {
    it("setTrait and getTrait round-trip", () => {
      store.create("box", { id: "b" })
      store.setTrait("b", "color", { r: 255, g: 0, b: 0 })

      expect(store.getTrait("b", "color")).toEqual({ r: 255, g: 0, b: 0 })
    })

    it("hasTrait checks for trait presence", () => {
      store.create("box", { id: "b" })
      expect(store.hasTrait("b", "color")).toBe(false)

      store.setTrait("b", "color", { r: 0, g: 0, b: 0 })
      expect(store.hasTrait("b", "color")).toBe(true)
    })

    it("removeTrait removes a trait", () => {
      store.create("box", { id: "b" })
      store.setTrait("b", "color", { r: 0, g: 0, b: 0 })

      expect(store.removeTrait("b", "color")).toBe(true)
      expect(store.hasTrait("b", "color")).toBe(false)
    })

    it("removeTrait returns false if trait didn't exist", () => {
      store.create("box", { id: "b" })
      expect(store.removeTrait("b", "nonexistent")).toBe(false)
    })

    it("setTrait overwrites existing trait data", () => {
      store.create("box", { id: "b" })
      store.setTrait("b", "color", { r: 255, g: 0, b: 0 })
      store.setTrait("b", "color", { r: 0, g: 255, b: 0 })

      expect(store.getTrait("b", "color")).toEqual({ r: 0, g: 255, b: 0 })
    })

    it("getTrait returns undefined for missing traits", () => {
      store.create("box", { id: "b" })
      expect(store.getTrait("b", "nope")).toBeUndefined()
    })

    it("trait data persists on the entity object", () => {
      store.create("box", { id: "b" })
      store.setTrait("b", "spatial", { x: 10, y: 20, z: 30 })

      const entity = store.getOrThrow("b")
      expect(entity.traits["spatial"]).toEqual({ x: 10, y: 20, z: 30 })
    })

    it("initial traits from create are accessible", () => {
      store.create("box", {
        id: "b",
        traits: { color: { r: 100, g: 100, b: 100 } },
      })
      expect(store.getTrait("b", "color")).toEqual({
        r: 100,
        g: 100,
        b: 100,
      })
    })
  })
})
