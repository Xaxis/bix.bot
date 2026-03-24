import { nanoid } from "nanoid"
import {
  type Intent,
  type IntentInput,
  type IntentResult,
  type IntentHandlerContext,
} from "./intent.js"
import { type IntentRegistry } from "./intent-registry.js"

// ── Undo stack entry ────────────────────────────────────────────

interface UndoEntry {
  forward: Intent
  inverse: Intent
}

// ── IntentBus ───────────────────────────────────────────────────

/**
 * IntentBus — the dispatch + undo/redo engine for Intents.
 *
 * Provides both a high-level `dispatch()` API and lower-level
 * primitives (`buildAndValidateIntent`, `executeBuiltIntent`,
 * `commitToHistory`) used by World to interpose the constraint solver
 * between validation and execution.
 */
export class IntentBus {
  private readonly registry: IntentRegistry
  private readonly context: IntentHandlerContext
  private readonly undoStack: UndoEntry[] = []
  private readonly redoStack: UndoEntry[] = []

  constructor(registry: IntentRegistry, context: IntentHandlerContext) {
    this.registry = registry
    this.context = context
  }

  // ── High-level dispatch ──────────────────────────────────────

  /**
   * Validate, execute, and commit an intent to the undo stack in one
   * step. Clears the redo stack.
   *
   * Used by tests and any caller that doesn't need constraint interposition.
   * World.dispatch() uses the three lower-level primitives instead.
   */
  dispatch(input: IntentInput): IntentResult {
    const intent = this.buildAndValidateIntent(input)
    const result = this.executeBuiltIntent(intent)
    this.commitToHistory(result)
    return result
  }

  // ── Lower-level primitives (used by World for constraint integration) ──

  /**
   * Validate params against the registered Zod schema and build a
   * fully-formed Intent (with id + timestamp). Does NOT execute the
   * handler or touch the undo stack.
   *
   * Throws if the intent type is not registered or params are invalid.
   */
  buildAndValidateIntent(input: IntentInput): Intent {
    const def = this.registry.getOrThrow(input.type)

    const parseResult = def.paramsSchema.safeParse(input.params)
    if (!parseResult.success) {
      throw new Error(
        `Intent "${input.type}" params invalid: ${parseResult.error.message}`,
      )
    }
    const validatedParams = parseResult.data as Record<string, unknown>

    return {
      id: nanoid(),
      type: input.type,
      params: validatedParams,
      source: input.source ?? "user",
      timestamp: Date.now(),
    }
  }

  /**
   * Execute a pre-built, pre-validated Intent: run the handler and
   * return the result. Does NOT touch the undo stack.
   *
   * The caller is responsible for having validated the intent first via
   * `buildAndValidateIntent` (or equivalent). Params are NOT re-validated.
   */
  executeBuiltIntent(intent: Intent): IntentResult {
    const def = this.registry.getOrThrow(intent.type)
    const handlerResult = def.handler(
      this.context,
      intent.params as Record<string, unknown>,
    )

    let inverse: Intent | undefined
    if (handlerResult.inverse !== undefined) {
      inverse = {
        id: nanoid(),
        type: handlerResult.inverse.type,
        params: handlerResult.inverse.params,
        source: handlerResult.inverse.source ?? "system",
        timestamp: intent.timestamp,
      }
    }

    return {
      intent,
      inverse,
      data: handlerResult.data,
    }
  }

  /**
   * Commit an IntentResult to the undo stack and clear the redo stack.
   * No-op if the result has no inverse (not undoable).
   *
   * Call this AFTER a successful execute + constraint pass to finalize
   * the intent in the session history.
   */
  commitToHistory(result: IntentResult): void {
    if (result.inverse !== undefined) {
      this.undoStack.push({
        forward: result.intent,
        inverse: result.inverse,
      })
    }
    this.redoStack.length = 0
  }

  // ── Undo / Redo ─────────────────────────────────────────────

  /**
   * Undo the last dispatched intent.
   * Returns the intent that was reversed, or undefined if nothing to undo.
   */
  undo(): Intent | undefined {
    const entry = this.undoStack.pop()
    if (entry === undefined) return undefined

    // Execute the inverse — no stack record
    this.executeRaw({
      type: entry.inverse.type,
      params: entry.inverse.params,
      source: entry.inverse.source,
    })

    this.redoStack.push(entry)
    return entry.forward
  }

  /**
   * Redo the last undone intent.
   * Returns the intent that was re-applied, or undefined if nothing to redo.
   */
  redo(): Intent | undefined {
    const entry = this.redoStack.pop()
    if (entry === undefined) return undefined

    const result = this.executeRaw({
      type: entry.forward.type,
      params: entry.forward.params,
      source: entry.forward.source,
    })

    this.undoStack.push({
      forward: result.intent,
      inverse: result.inverse ?? entry.inverse,
    })

    return entry.forward
  }

  // ── Stack inspection ────────────────────────────────────────

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoStackSize(): number {
    return this.undoStack.length
  }

  get redoStackSize(): number {
    return this.redoStack.length
  }

  clearHistory(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }

  // ── Internal ────────────────────────────────────────────────

  /**
   * Validate + execute in one step without touching stacks.
   * Used internally by undo() and redo() for inverse execution.
   */
  private executeRaw(input: IntentInput): IntentResult {
    const intent = this.buildAndValidateIntent(input)
    return this.executeBuiltIntent(intent)
  }
}
