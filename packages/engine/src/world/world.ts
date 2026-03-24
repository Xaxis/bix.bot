import { type Entity } from "../entity/entity.js"
import { EntityStore } from "../entity/entity-store.js"
import { TraitRegistry } from "../trait/trait-registry.js"
import { BUILT_IN_TRAITS } from "../trait/built-in-traits.js"
import { IntentRegistry } from "../intent/intent-registry.js"
import { IntentBus } from "../intent/intent-bus.js"
import { BUILT_IN_INTENTS } from "../intent/built-in-intents.js"
import { type Intent, type IntentResult, type IntentInput } from "../intent/intent.js"
import { type DomainSchema } from "../schema/schema.js"
import { ConstraintGraph } from "../constraint/constraint-graph.js"
import { ConstraintSolver } from "../constraint/constraint-solver.js"
import { SystemRunner } from "../system/system-runner.js"

// ── World events ─────────────────────────────────────────────────

/** Fired after a successful (non-prevented) dispatch. */
export interface DispatchedEvent {
    type: "dispatched"
    intent: Intent
    result: IntentResult
}

/** Fired after a successful undo. */
export interface UndoneEvent {
    type: "undone"
    /** The original intent that was reversed. */
    intent: Intent
}

/** Fired after a successful redo. */
export interface RedoneEvent {
    type: "redone"
    /** The intent that was re-applied. */
    intent: Intent
}

export type WorldEvent = DispatchedEvent | UndoneEvent | RedoneEvent

export type WorldEventHandler = (event: WorldEvent) => void

// ── WorldQuery ────────────────────────────────────────────────────

/**
 * Read-only query interface over the World's entity store.
 */
export class WorldQuery {
    constructor(private readonly entities: EntityStore) {}

    all(): readonly Entity[] {
        return this.entities.getAll()
    }

    byId(id: string): Entity | undefined {
        return this.entities.get(id)
    }

    byType(type: string): readonly Entity[] {
        return this.entities.getByType(type)
    }

    byTrait(traitName: string): readonly Entity[] {
        return this.entities.getAll().filter((e) => traitName in e.traits)
    }

    withTraits(traitNames: readonly string[]): readonly Entity[] {
        return this.entities
            .getAll()
            .filter((e) => traitNames.every((name) => name in e.traits))
    }

    /** Total number of entities in the world. */
    get count(): number {
        return this.entities.count
    }

    /**
     * Get all entities connected to the given entity via its Connectable trait's
     * connections array. Returns an empty array if the entity has no connectable
     * trait or no active connections.
     *
     * This is the `ctx.entities.connectedTo(id)` method promised by the
     * schema-authoring skill.
     */
    connectedTo(id: string): readonly Entity[] {
        const entity = this.entities.get(id)
        if (!entity) return []
        const connectable = entity.traits["connectable"] as
            | { connections?: Array<{ targetEntityId: string }> }
            | undefined
        if (!connectable?.connections?.length) return []
        return connectable.connections
            .map((conn) => this.entities.get(conn.targetEntityId))
            .filter((e): e is Entity => e !== undefined)
    }
}

// ── WorldSnapshot (serialize / deserialize) ───────────────────────

export interface EntitySnapshot {
    id: string
    type: string
    traits: Record<string, unknown>
    children: string[]
    parent?: string
}

export interface WorldSnapshot {
    schemaName: string
    schemaVersion: string
    entities: EntitySnapshot[]
}

// ── World ─────────────────────────────────────────────────────────

/**
 * World — the live runtime container. Single source of truth for all
 * entity state in a simulation session.
 *
 * ```typescript
 * import { World } from "@bix/engine"
 * const world = World.create(mySchema)
 * world.dispatch({ type: "entity.create", params: { entityType: "wall" } })
 * ```
 *
 * Multiple World instances can coexist in one process — no global singletons.
 */
export class World {
    readonly query: WorldQuery

    private readonly _entities: EntityStore
    private readonly _bus: IntentBus
    private readonly _solver: ConstraintSolver
    private readonly _runner: SystemRunner
    private readonly _traitRegistry: TraitRegistry
    private readonly _subscribers: Set<WorldEventHandler> = new Set()
    private readonly _schema: DomainSchema

    // ── Construction ─────────────────────────────────────────────

    private constructor(
        schema: DomainSchema,
        entities: EntityStore,
        bus: IntentBus,
        solver: ConstraintSolver,
        runner: SystemRunner,
        traitRegistry: TraitRegistry,
    ) {
        this._schema = schema
        this._entities = entities
        this._bus = bus
        this._solver = solver
        this._runner = runner
        this._traitRegistry = traitRegistry
        this.query = new WorldQuery(entities)
    }

    /**
     * Create a new World from a DomainSchema.
     *
     * Built-in traits are registered automatically. Schema traits, constraints,
     * and entity types are registered on top. Built-in intents are pre-loaded.
     */
    static create(schema: DomainSchema): World {
        // 1. Trait registry: built-ins first, then domain traits
        const traitRegistry = new TraitRegistry()
        traitRegistry.registerAll([...BUILT_IN_TRAITS])
        for (const trait of schema.traits) {
            traitRegistry.register(trait)
        }

        // 2. Entity store backed by the trait registry
        const entities = new EntityStore(traitRegistry)

        // 3. Intent registry + bus
        const intentRegistry = new IntentRegistry()
        intentRegistry.registerAll([...BUILT_IN_INTENTS])
        const bus = new IntentBus(intentRegistry, { entities })

        // 4. Constraint graph + solver
        const constraintGraph = new ConstraintGraph()
        for (const constraint of schema.constraints ?? []) {
            constraintGraph.register(constraint)
        }
        const solver = new ConstraintSolver(constraintGraph)

        // 5. System runner
        const runner = new SystemRunner()
        for (const system of schema.systems ?? []) {
            runner.register(system)
        }

        return new World(schema, entities, bus, solver, runner, traitRegistry)
    }

    // ── Schema ───────────────────────────────────────────────────

    get schema(): DomainSchema {
        return this._schema
    }

    // ── Dispatch ─────────────────────────────────────────────────

    /**
     * Dispatch an intent through the World.
     *
     * Flow:
     * 1. Validate params (Zod) and build the Intent object.
     * 2. Run constraint solver on current state + pending intent.
     *    - If any "prevent" constraint is violated → return prevented result
     *      without mutating state.
     * 3. Execute the intent handler (state mutates here).
     * 4. Dispatch "adjust"/"enforce" suggestions as system intents.
     * 5. Commit to undo stack.
     * 6. Emit "dispatched" event with any "warn" violations.
     */
    dispatch(input: IntentInput): IntentResult {
        // Step 1: inject entity type defaults for entity.create (Gap 1 fix)
        const enrichedInput = this.injectEntityTypeDefaults(input)

        // Step 1b: validate params and build the intent
        const intent = this._bus.buildAndValidateIntent(enrichedInput)

        // Step 2: pre-execution constraint evaluation
        const solverResult = this._solver.solve(intent, this.query, this._entities)

        if (solverResult.hasPreventViolations) {
            // Abort without mutation — do NOT emit an event (nothing changed)
            return {
                intent,
                prevented: true,
                violations: solverResult.violations.filter((v) => v.effect === "prevent"),
            }
        }

        // Step 3: execute the intent
        const busResult = this._bus.executeBuiltIntent(intent)

        // Step 4: dispatch adjustment intents (bypass constraint checks + undo stack)
        for (const adjustment of solverResult.adjustments) {
            const adjIntent = this._bus.buildAndValidateIntent({
                ...adjustment,
                source: "system",
            })
            this._bus.executeBuiltIntent(adjIntent)
        }

        // Step 5: commit to undo stack
        this._bus.commitToHistory(busResult)

        // Step 6: build final result, emit
        const result: IntentResult = {
            ...busResult,
            violations: solverResult.violations.filter((v) => v.effect !== "prevent"),
        }

        this.emit({ type: "dispatched", intent: busResult.intent, result })
        return result
    }

    // ── Undo / Redo ──────────────────────────────────────────────

    undo(): boolean {
        const undoneIntent = this._bus.undo()
        if (undoneIntent !== undefined) {
            this.emit({ type: "undone", intent: undoneIntent })
            return true
        }
        return false
    }

    redo(): boolean {
        const redoneIntent = this._bus.redo()
        if (redoneIntent !== undefined) {
            this.emit({ type: "redone", intent: redoneIntent })
            return true
        }
        return false
    }

    get canUndo(): boolean {
        return this._bus.canUndo
    }

    get canRedo(): boolean {
        return this._bus.canRedo
    }

    // ── Subscribe ────────────────────────────────────────────────

    subscribe(handler: WorldEventHandler): () => void {
        this._subscribers.add(handler)
        return () => {
            this._subscribers.delete(handler)
        }
    }

    get subscriberCount(): number {
        return this._subscribers.size
    }

    // ── Serialization ────────────────────────────────────────────

    serialize(): WorldSnapshot {
        const entities: EntitySnapshot[] = this._entities.getAll().map((entity) => {
            const snap: EntitySnapshot = {
                id: entity.id,
                type: entity.type,
                traits: JSON.parse(JSON.stringify(entity.traits)) as Record<
                    string,
                    unknown
                >,
                children: [...entity.children],
            }
            if (entity.parent !== undefined) {
                snap.parent = entity.parent
            }
            return snap
        })

        return {
            schemaName: this._schema.name,
            schemaVersion: this._schema.version,
            entities,
        }
    }

    static deserialize(snapshot: WorldSnapshot, schema: DomainSchema): World {
        if (snapshot.schemaName !== schema.name) {
            throw new Error(
                `Snapshot schema "${snapshot.schemaName}" does not match provided schema "${schema.name}"`,
            )
        }

        const world = World.create(schema)

        for (const snap of snapshot.entities) {
            world._entities.create(snap.type, {
                id: snap.id,
                traits: snap.traits,
            })
        }

        for (const snap of snapshot.entities) {
            if (snap.parent !== undefined && world._entities.has(snap.parent)) {
                world._entities.addChild(snap.parent, snap.id)
            }
        }

        return world
    }

    // ── System tick ──────────────────────────────────────────────

    /**
     * Advance the simulation by `dt` seconds.
     *
     * Runs all registered Systems in phase + priority order. Each system
     * receives the entities matching its required traits and may return
     * IntentInputs, which are dispatched as source="system".
     */
    tick(dt: number): void {
        this._runner.tick(dt, this)
    }

    // ── Internal ─────────────────────────────────────────────────

    private emit(event: WorldEvent): void {
        for (const handler of this._subscribers) {
            handler(event)
        }
    }

    /**
     * Gap 1 fix: For entity.create intents, merge the schema's entityType.defaults
     * into the params.traits before the intent is validated and executed.
     *
     * Merge priority (highest wins):
     *   1. params.traits (explicit caller-provided data)
     *   2. entityType.defaults (schema-level type defaults)
     *   3. TraitRegistry defaults (generic trait-level defaults)
     *
     * For each trait declared in entityType.traits, every trait is
     * initialized — not just those listed in entityType.defaults.
     */
    private injectEntityTypeDefaults(input: IntentInput): IntentInput {
        if (input.type !== "entity.create") return input

        const entityType = input.params["entityType"] as string | undefined
        if (!entityType) return input

        const entityTypeDef = this._schema.entityTypes?.find(
            (et) => et.type === entityType,
        )
        if (!entityTypeDef) return input

        const providedTraits =
            (input.params["traits"] as Record<string, unknown> | undefined) ?? {}
        const merged: Record<string, unknown> = {}

        // For every declared trait, build the merged data
        for (const traitName of entityTypeDef.traits) {
            // Layer 1: trait registry defaults (generic)
            const registryDefaults: Record<string, unknown> = this._traitRegistry.has(
                traitName,
            )
                ? this._traitRegistry.getDefaults(traitName)
                : {}

            // Layer 2: entity type-specific defaults (override registry)
            const typeDefault = entityTypeDef.defaults?.[traitName]
            const afterTypeDefault =
                typeDefault !== undefined
                    ? { ...registryDefaults, ...(typeDefault as Record<string, unknown>) }
                    : registryDefaults

            merged[traitName] = afterTypeDefault
        }

        // Layer 3: explicitly provided traits (highest priority, object-merge)
        for (const [traitName, data] of Object.entries(providedTraits)) {
            if (traitName in merged && typeof data === "object" && data !== null) {
                merged[traitName] = {
                    ...(merged[traitName] as Record<string, unknown>),
                    ...(data as Record<string, unknown>),
                }
            } else {
                merged[traitName] = data
            }
        }

        return {
            ...input,
            params: { ...input.params, traits: merged },
        }
    }
}
