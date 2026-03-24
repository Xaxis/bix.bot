import { z } from "zod"
import { type EntityStore } from "../entity/entity-store.js"

// ── Intent source ───────────────────────────────────────────────

export const IntentSource = z.enum(["user", "agent", "system"])
export type IntentSource = z.infer<typeof IntentSource>

// ── Intent ──────────────────────────────────────────────────────

/**
 * A serializable description of a desired state change.
 *
 * Every mutation to the World goes through an Intent. Human UI and
 * AI agents emit the same Intent types — this is non-negotiable.
 */
export const IntentSchema = z.object({
    /** Unique ID assigned by the bus on dispatch. */
    id: z.string().min(1),
    /** Intent type (e.g., "entity.create", "trait.update"). */
    type: z.string().min(1),
    /** Parameters validated against the IntentDefinition's paramsSchema. */
    params: z.record(z.string(), z.unknown()),
    /** Who emitted this intent. */
    source: IntentSource,
    /** Epoch millis when this intent was dispatched. */
    timestamp: z.number(),
})
export type Intent = z.infer<typeof IntentSchema>

// ── Input (what callers provide — bus fills in id + timestamp) ──

export interface IntentInput {
    type: string
    params: Record<string, unknown>
    source?: IntentSource
}

// ── Handler context ─────────────────────────────────────────────

/**
 * The context passed to intent handlers. Provides access to
 * the entity store for performing mutations.
 *
 * When World exists (Phase 1e), it will provide this context.
 */
export interface IntentHandlerContext {
    entities: EntityStore
}

// ── Handler result ──────────────────────────────────────────────

export interface IntentResult {
    /** The executed intent (with id and timestamp filled in). */
    intent: Intent
    /** The inverse intent for undo. Undefined means not undoable. */
    inverse?: Intent
    /** Optional data returned by the handler (e.g., created entity ID). */
    data?: Record<string, unknown>
    /**
     * Constraint violations from this dispatch.
     * "prevent" violations are never present here (they abort before execution);
     * "warn", "adjust", and "enforce" violations are included.
     */
    violations?: import("../constraint/constraint-definition.js").Violation[]
    /**
     * True when a "prevent" constraint blocked this intent.
     * When true, no state mutation occurred and `inverse` is undefined.
     */
    prevented?: boolean
}

// ── Intent definition ───────────────────────────────────────────

/**
 * Defines an intent type: its parameter schema, description, and
 * the handler that executes the mutation.
 *
 * Handlers receive the context + validated params. They perform the
 * mutation and return an inverse Intent for undo support.
 */
export interface IntentDefinition {
    /** Intent type name (e.g., "entity.create"). */
    readonly type: string
    /** Human + AI readable description. */
    readonly description: string
    /** Zod schema for validating intent params. */
    readonly paramsSchema: z.ZodType
    /**
     * Execute the intent. Returns the inverse intent for undo,
     * plus any data to return to the caller.
     */
    readonly handler: (
        ctx: IntentHandlerContext,
        params: Record<string, unknown>,
    ) => IntentHandlerResult
}

/** What a handler returns (before the bus wraps it into IntentResult). */
export interface IntentHandlerResult {
    /** Inverse intent input for undo. Undefined = not undoable. */
    inverse?: IntentInput
    /** Optional data to return to the caller. */
    data?: Record<string, unknown>
}
