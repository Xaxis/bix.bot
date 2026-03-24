import { type Entity, type CreateEntityOptions, createEntity } from "./entity.js"
import { type TraitRegistry } from "../trait/trait-registry.js"

export interface DeleteOptions {
  /** If true (default), recursively delete all descendants. If false, detach children to root level. */
  cascade?: boolean
}

/**
 * EntityStore — the canonical container for all Entity instances.
 *
 * Provides CRUD operations and parent/child composition management.
 * This is the low-level store; all mutation in production flows through
 * Intent handlers that call these methods.
 *
 * When constructed with a TraitRegistry, trait mutations are validated
 * against registered Zod schemas. Without a registry, trait data is
 * stored as-is (useful for tests or registry-free usage).
 */
export class EntityStore {
  private readonly entities: Map<string, Entity> = new Map()
  private readonly traitRegistry: TraitRegistry | undefined

  constructor(traitRegistry?: TraitRegistry) {
    this.traitRegistry = traitRegistry
  }

  // ── CRUD ──────────────────────────────────────────────────────

  /** Create a new entity and add it to the store. Returns the created entity. */
  create(type: string, options: CreateEntityOptions = {}): Entity {
    const entity = createEntity(type, options)

    if (this.entities.has(entity.id)) {
      throw new Error(`Entity with id "${entity.id}" already exists`)
    }

    this.entities.set(entity.id, entity)

    // If a parent was specified, wire up the relationship
    if (entity.parent !== undefined) {
      const parent = this.getOrThrow(entity.parent)
      if (!parent.children.includes(entity.id)) {
        parent.children.push(entity.id)
      }
    }

    return entity
  }

  /** Get an entity by ID, or undefined if not found. */
  get(id: string): Entity | undefined {
    return this.entities.get(id)
  }

  /** Get an entity by ID, or throw if not found. */
  getOrThrow(id: string): Entity {
    const entity = this.entities.get(id)
    if (entity === undefined) {
      throw new Error(`Entity "${id}" not found`)
    }
    return entity
  }

  /** Check if an entity exists. */
  has(id: string): boolean {
    return this.entities.has(id)
  }

  /**
   * Delete an entity from the store.
   *
   * With cascade=true (default): recursively deletes all descendants.
   * With cascade=false: detaches children (they become root entities).
   */
  delete(id: string, options: DeleteOptions = {}): void {
    const entity = this.getOrThrow(id)
    const cascade = options.cascade ?? true

    if (cascade) {
      // Depth-first deletion of descendants
      for (const childId of [...entity.children]) {
        this.delete(childId, { cascade: true })
      }
    } else {
      // Detach children — they become root entities
      for (const childId of entity.children) {
        const child = this.entities.get(childId)
        if (child !== undefined) {
          child.parent = undefined
        }
      }
    }

    // Remove from parent's children list
    if (entity.parent !== undefined) {
      const parent = this.entities.get(entity.parent)
      if (parent !== undefined) {
        const idx = parent.children.indexOf(id)
        if (idx !== -1) {
          parent.children.splice(idx, 1)
        }
      }
    }

    this.entities.delete(id)
  }

  /** Return all entities as an array. */
  getAll(): Entity[] {
    return [...this.entities.values()]
  }

  /** Return all entities of a given type. */
  getByType(type: string): Entity[] {
    return this.getAll().filter((e) => e.type === type)
  }

  /** Number of entities in the store. */
  get count(): number {
    return this.entities.size
  }

  /** Remove all entities. */
  clear(): void {
    this.entities.clear()
  }

  // ── Composition ───────────────────────────────────────────────

  /**
   * Add a child entity to a parent.
   * The child is detached from any previous parent first.
   */
  addChild(parentId: string, childId: string): void {
    if (parentId === childId) {
      throw new Error("An entity cannot be its own child")
    }

    const parent = this.getOrThrow(parentId)
    const child = this.getOrThrow(childId)

    // Prevent circular composition: parent cannot be a descendant of child
    if (this.isDescendantOf(parentId, childId)) {
      throw new Error(
        `Cannot add "${childId}" as parent of "${parentId}" — would create a cycle`,
      )
    }

    // Detach from previous parent
    if (child.parent !== undefined) {
      this.removeChild(child.parent, childId)
    }

    child.parent = parentId
    if (!parent.children.includes(childId)) {
      parent.children.push(childId)
    }
  }

  /** Remove a child from a parent. The child becomes a root entity. */
  removeChild(parentId: string, childId: string): void {
    const parent = this.getOrThrow(parentId)
    const child = this.getOrThrow(childId)

    const idx = parent.children.indexOf(childId)
    if (idx === -1) {
      throw new Error(`Entity "${childId}" is not a child of "${parentId}"`)
    }

    parent.children.splice(idx, 1)
    child.parent = undefined
  }

  /** Get direct children of an entity. */
  getChildren(id: string): Entity[] {
    const entity = this.getOrThrow(id)
    return entity.children
      .map((childId) => this.entities.get(childId))
      .filter((e): e is Entity => e !== undefined)
  }

  /** Get the parent of an entity, or undefined if root. */
  getParent(id: string): Entity | undefined {
    const entity = this.getOrThrow(id)
    if (entity.parent === undefined) return undefined
    return this.entities.get(entity.parent)
  }

  /**
   * Get all descendants of an entity (recursive, depth-first).
   * Does NOT include the entity itself.
   */
  getDescendants(id: string): Entity[] {
    const entity = this.getOrThrow(id)
    const result: Entity[] = []

    for (const childId of entity.children) {
      const child = this.entities.get(childId)
      if (child !== undefined) {
        result.push(child)
        result.push(...this.getDescendants(childId))
      }
    }

    return result
  }

  /**
   * Get all ancestors of an entity (parent, grandparent, etc.).
   * Ordered from nearest (parent) to farthest (root).
   */
  getAncestors(id: string): Entity[] {
    const entity = this.getOrThrow(id)
    const result: Entity[] = []
    let currentParentId = entity.parent

    while (currentParentId !== undefined) {
      const parent = this.entities.get(currentParentId)
      if (parent === undefined) break
      result.push(parent)
      currentParentId = parent.parent
    }

    return result
  }

  // ── Trait data ─────────────────────────────────────────────────

  /**
   * Set trait data on an entity.
   *
   * When a TraitRegistry is present, data is validated against the
   * registered Zod schema. The stored value is the Zod-parsed result
   * (which may strip unknown fields or apply coercions).
   *
   * Without a registry, data is stored as-is.
   */
  setTrait(entityId: string, traitName: string, data: unknown): void {
    const entity = this.getOrThrow(entityId)

    if (this.traitRegistry !== undefined) {
      const result = this.traitRegistry.validate(traitName, data)
      if (!result.success) {
        throw new Error(result.error)
      }
      entity.traits[traitName] = result.data
    } else {
      entity.traits[traitName] = data
    }
  }

  /**
   * Set trait data on an entity using the trait's registered defaults.
   * Optionally accepts partial overrides that are merged on top of defaults.
   *
   * Requires a TraitRegistry — throws if none is configured.
   */
  setTraitDefaults(
    entityId: string,
    traitName: string,
    overrides?: Record<string, unknown>,
  ): void {
    if (this.traitRegistry === undefined) {
      throw new Error(
        "setTraitDefaults requires a TraitRegistry — construct EntityStore with one",
      )
    }

    const defaults = this.traitRegistry.getDefaults(traitName)
    const merged = overrides !== undefined ? { ...defaults, ...overrides } : defaults

    this.setTrait(entityId, traitName, merged)
  }

  /** Get trait data from an entity, or undefined if not present. */
  getTrait(entityId: string, traitName: string): unknown {
    const entity = this.getOrThrow(entityId)
    return entity.traits[traitName]
  }

  /** Remove a trait from an entity. Returns true if the trait existed. */
  removeTrait(entityId: string, traitName: string): boolean {
    const entity = this.getOrThrow(entityId)
    if (traitName in entity.traits) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete entity.traits[traitName]
      return true
    }
    return false
  }

  /** Check if an entity has a specific trait. */
  hasTrait(entityId: string, traitName: string): boolean {
    const entity = this.getOrThrow(entityId)
    return traitName in entity.traits
  }

  /** Get the TraitRegistry, if one was configured. */
  getTraitRegistry(): TraitRegistry | undefined {
    return this.traitRegistry
  }

  // ── Internal helpers ──────────────────────────────────────────

  /** Check if `ancestorId` is a descendant of `entityId`. */
  private isDescendantOf(ancestorId: string, entityId: string): boolean {
    const entity = this.entities.get(entityId)
    if (entity === undefined) return false

    for (const childId of entity.children) {
      if (childId === ancestorId) return true
      if (this.isDescendantOf(ancestorId, childId)) return true
    }

    return false
  }
}
