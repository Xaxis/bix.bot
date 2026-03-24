import { type TraitDefinition } from "./trait-definition.js"

/**
 * Result of validating trait data against a registered definition.
 */
export interface TraitValidationResult {
    success: boolean
    /** The parsed (and possibly coerced) data, if validation succeeded. */
    data?: Record<string, unknown>
    /** Human-readable error message, if validation failed. */
    error?: string
}

/**
 * TraitRegistry — the canonical container for TraitDefinitions.
 *
 * Provides registration, lookup, validation, and default generation.
 * The World uses the registry to validate trait data before it's
 * stored on entities.
 */
export class TraitRegistry {
    private readonly definitions: Map<string, TraitDefinition> = new Map()

    /** Register a TraitDefinition. Throws if a trait with the same name already exists. */
    register(definition: TraitDefinition): void {
        if (this.definitions.has(definition.name)) {
            throw new Error(`Trait "${definition.name}" is already registered`)
        }
        this.definitions.set(definition.name, definition)
    }

    /** Register multiple TraitDefinitions at once. */
    registerAll(definitions: TraitDefinition[]): void {
        for (const def of definitions) {
            this.register(def)
        }
    }

    /** Get a TraitDefinition by name, or undefined if not registered. */
    get(name: string): TraitDefinition | undefined {
        return this.definitions.get(name)
    }

    /** Get a TraitDefinition by name, or throw if not registered. */
    getOrThrow(name: string): TraitDefinition {
        const def = this.definitions.get(name)
        if (def === undefined) {
            throw new Error(`Trait "${name}" is not registered`)
        }
        return def
    }

    /** Check if a trait is registered. */
    has(name: string): boolean {
        return this.definitions.has(name)
    }

    /** Get all registered trait definitions. */
    getAll(): TraitDefinition[] {
        return [...this.definitions.values()]
    }

    /** Get all registered trait names. */
    getNames(): string[] {
        return [...this.definitions.keys()]
    }

    /** Number of registered traits. */
    get count(): number {
        return this.definitions.size
    }

    /**
     * Validate data against a registered trait's Zod schema.
     *
     * Returns the parsed data on success (Zod may coerce/strip unknown fields).
     * Returns an error message on failure.
     */
    validate(traitName: string, data: unknown): TraitValidationResult {
        const def = this.definitions.get(traitName)
        if (def === undefined) {
            return { success: false, error: `Trait "${traitName}" is not registered` }
        }

        const result = def.schema.safeParse(data)
        if (result.success) {
            return { success: true, data: result.data as Record<string, unknown> }
        }

        return {
            success: false,
            error: `Trait "${traitName}" validation failed: ${result.error.message}`,
        }
    }

    /**
     * Get a deep clone of the default data for a trait.
     * Returns a fresh copy each time to prevent shared mutation.
     */
    getDefaults(traitName: string): Record<string, unknown> {
        const def = this.getOrThrow(traitName)
        return JSON.parse(JSON.stringify(def.defaults)) as Record<string, unknown>
    }
}
