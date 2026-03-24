import { type ConstraintDefinition } from "./constraint-definition.js"
import { type Intent } from "../intent/intent.js"

/**
 * ConstraintGraph — a targeted index that maps from "what changed" to
 * "which constraints care."
 *
 * Built at World.create() time from the schema's constraint list. At
 * dispatch time, the Graph returns only the constraints relevant to the
 * current intent, so evaluation is O(relevant constraints) rather than
 * O(all constraints).
 *
 * Index keys:
 * - `intentType` → constraints watching that specific intent type
 * - `entityType` → constraints watching entities of that type
 * - `traitName` → constraints watching that trait name
 * - `_global` → constraints with scope "global" (always evaluated)
 */
export class ConstraintGraph {
    private readonly byIntentType = new Map<string, Set<ConstraintDefinition>>()
    private readonly byEntityType = new Map<string, Set<ConstraintDefinition>>()
    private readonly byTraitName = new Map<string, Set<ConstraintDefinition>>()
    private readonly globals = new Set<ConstraintDefinition>()
    private readonly all = new Map<string, ConstraintDefinition>()

    // ── Registration ─────────────────────────────────────────────

    /** Register a single constraint. Throws if name is already registered. */
    register(constraint: ConstraintDefinition): void {
        if (this.all.has(constraint.name)) {
            throw new Error(`Constraint "${constraint.name}" is already registered`)
        }
        this.all.set(constraint.name, constraint)

        // Global constraints always evaluate
        if (constraint.scope === "global") {
            this.globals.add(constraint)
            return
        }

        const watch = constraint.watch

        // No watch declaration: treat as always-relevant (pessimistic/correct)
        if (
            watch === undefined ||
            ((!watch.intentTypes || watch.intentTypes.length === 0) &&
                (!watch.entityTypes || watch.entityTypes.length === 0) &&
                (!watch.traitNames || watch.traitNames.length === 0))
        ) {
            this.globals.add(constraint)
            return
        }

        // Index by intent type
        for (const intentType of watch.intentTypes ?? []) {
            this.addToIndex(this.byIntentType, intentType, constraint)
        }
        // Index by entity type
        for (const entityType of watch.entityTypes ?? []) {
            this.addToIndex(this.byEntityType, entityType, constraint)
        }
        // Index by trait name
        for (const traitName of watch.traitNames ?? []) {
            this.addToIndex(this.byTraitName, traitName, constraint)
        }
    }

    /** Register multiple constraints. */
    registerAll(constraints: readonly ConstraintDefinition[]): void {
        for (const c of constraints) {
            this.register(c)
        }
    }

    // ── Query ────────────────────────────────────────────────────

    /**
     * Get all constraints relevant to the given intent dispatch.
     *
     * Returns the union of:
     * - Global constraints
     * - Constraints watching the intent type
     * - Constraints watching any of the affected entity types
     * - Constraints watching any of the modified trait names
     *
     * Results are deduplicated and sorted by priority descending
     * (highest priority first).
     */
    getRelevant(
        intent: Intent,
        affectedEntityTypes: readonly string[],
        affectedTraitNames: readonly string[],
    ): ConstraintDefinition[] {
        const seen = new Set<string>()
        const result: ConstraintDefinition[] = []

        const add = (c: ConstraintDefinition): void => {
            if (!seen.has(c.name)) {
                seen.add(c.name)
                result.push(c)
            }
        }

        // Always include globals
        for (const c of this.globals) add(c)

        // By intent type
        for (const c of this.byIntentType.get(intent.type) ?? []) add(c)

        // By affected entity types
        for (const entityType of affectedEntityTypes) {
            for (const c of this.byEntityType.get(entityType) ?? []) add(c)
        }

        // By modified trait names
        for (const traitName of affectedTraitNames) {
            for (const c of this.byTraitName.get(traitName) ?? []) add(c)
        }

        // Sort by priority descending — higher priority constraints evaluate first
        result.sort((a, b) => b.priority - a.priority)

        return result
    }

    /** Get all registered constraints, sorted by priority. */
    getAll(): ConstraintDefinition[] {
        return [...this.all.values()].sort((a, b) => b.priority - a.priority)
    }

    /** Check if a constraint name is registered. */
    has(name: string): boolean {
        return this.all.has(name)
    }

    /** Number of registered constraints. */
    get count(): number {
        return this.all.size
    }

    // ── Internal ─────────────────────────────────────────────────

    private addToIndex(
        index: Map<string, Set<ConstraintDefinition>>,
        key: string,
        constraint: ConstraintDefinition,
    ): void {
        let bucket = index.get(key)
        if (bucket === undefined) {
            bucket = new Set()
            index.set(key, bucket)
        }
        bucket.add(constraint)
    }
}
