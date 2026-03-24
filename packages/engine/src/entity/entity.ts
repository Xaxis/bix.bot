import { z } from "zod"
import { nanoid } from "nanoid"

/**
 * Zod schema for an Entity — the universal "thing" in the simulation.
 *
 * Entities are identity containers composed via Traits. They gain all
 * meaning from attached Trait data. Entities can form hierarchies via
 * parent/children composition.
 */
export const EntitySchema = z.object({
  /** Unique identifier — nanoid, never sequential. */
  id: z.string().min(1),

  /** Entity type from the domain Schema (e.g., "wall", "asteroid", "neuron"). */
  type: z.string().min(1),

  /**
   * Trait data keyed by trait name. Each value is the trait's data,
   * validated by the Trait system (not at the Entity level).
   */
  traits: z.record(z.string(), z.unknown()),

  /** IDs of child entities (composition). */
  children: z.array(z.string()),

  /** ID of parent entity, if this entity is a child. */
  parent: z.string().optional(),
})

export type Entity = z.infer<typeof EntitySchema>

/** Options for creating a new entity. */
export interface CreateEntityOptions {
  /** Override the auto-generated ID. Useful for deserialization. */
  id?: string
  /** Initial trait data to attach. */
  traits?: Record<string, unknown>
  /** Parent entity ID. */
  parent?: string
}

/**
 * Create a new Entity with sensible defaults.
 * Does NOT add it to any store — that's the caller's job.
 */
export function createEntity(type: string, options: CreateEntityOptions = {}): Entity {
  const entity: Entity = {
    id: options.id ?? nanoid(),
    type,
    traits: options.traits ?? {},
    children: [],
    parent: options.parent,
  }

  // Validate — catches programming errors early
  return EntitySchema.parse(entity)
}
