import { type IntentDefinition } from "./intent.js"

/**
 * IntentRegistry — registers IntentDefinitions by type name.
 *
 * Used by the IntentBus to look up definitions for validation and
 * handler execution. Also used by the Agent Interface to auto-generate
 * tool definitions from registered intent types.
 */
export class IntentRegistry {
  private readonly definitions: Map<string, IntentDefinition> = new Map()

  /** Register an IntentDefinition. Throws on duplicate type. */
  register(definition: IntentDefinition): void {
    if (this.definitions.has(definition.type)) {
      throw new Error(`Intent type "${definition.type}" is already registered`)
    }
    this.definitions.set(definition.type, definition)
  }

  /** Register multiple definitions at once. */
  registerAll(definitions: IntentDefinition[]): void {
    for (const def of definitions) {
      this.register(def)
    }
  }

  /** Get a definition by type, or undefined if not registered. */
  get(type: string): IntentDefinition | undefined {
    return this.definitions.get(type)
  }

  /** Get a definition by type, or throw if not registered. */
  getOrThrow(type: string): IntentDefinition {
    const def = this.definitions.get(type)
    if (def === undefined) {
      throw new Error(`Intent type "${type}" is not registered`)
    }
    return def
  }

  /** Check if an intent type is registered. */
  has(type: string): boolean {
    return this.definitions.has(type)
  }

  /** Get all registered definitions. */
  getAll(): IntentDefinition[] {
    return [...this.definitions.values()]
  }

  /** Get all registered type names. */
  getTypes(): string[] {
    return [...this.definitions.keys()]
  }

  /** Number of registered intent types. */
  get count(): number {
    return this.definitions.size
  }
}
