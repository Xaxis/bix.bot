import React from "react"
import { type StoreApi, type UseBoundStore } from "zustand"
import { type DomainSchema, BUILT_IN_TRAITS } from "@bix/engine"
import { type WorldStoreState } from "../stores/world-store.js"

// ── Dot-path helpers ──────────────────────────────────────────────

/** Read a value from a nested object using a dot-path like "position.x". */
function getPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".")
    let current: unknown = obj
    for (const part of parts) {
        if (typeof current !== "object" || current === null) return undefined
        current = (current as Record<string, unknown>)[part]
    }
    return current
}

/** Return a new object with the value at dot-path updated (immutably). */
function setPath(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
): Record<string, unknown> {
    const parts = path.split(".")
    if (parts.length === 1) {
        return { ...obj, [parts[0]!]: value }
    }
    const [first, ...rest] = parts
    return {
        ...obj,
        [first!]: setPath(
            (obj[first!] as Record<string, unknown>) ?? {},
            rest.join("."),
            value,
        ),
    }
}

// ── Inspector ─────────────────────────────────────────────────────

export interface InspectorProps {
    store: UseBoundStore<StoreApi<WorldStoreState>>
    schema: DomainSchema
}

/**
 * Inspector — shows and edits the traits of the selected entity.
 *
 * Reads the selected entity from the store, looks up each trait's
 * definition (built-ins or schema traits) for label/widget hints,
 * and renders a labeled input per editable field.
 *
 * All changes dispatch `trait.update` intents — the Inspector never
 * writes to World state directly.
 */
export function Inspector({ store, schema }: InspectorProps): JSX.Element {
    const selection = store((s) => s.selection)
    const entities = store((s) => s.entities)
    const dispatch = store((s) => s.dispatch)

    // Show the first selected entity
    const selectedId = [...selection][0]
    const entity =
        selectedId !== undefined ? entities.find((e) => e.id === selectedId) : undefined

    if (!entity) {
        return (
            <div data-testid="inspector" className="inspector inspector--empty">
                <p>No entity selected</p>
            </div>
        )
    }

    // Build a map of all known trait definitions
    const traitDefs = new Map(
        [...BUILT_IN_TRAITS, ...schema.traits].map((t) => [t.name, t]),
    )

    const handleFieldChange = (
        traitName: string,
        currentData: Record<string, unknown>,
        fieldPath: string,
        rawValue: string,
        isNumber: boolean,
    ): void => {
        const newValue = isNumber ? Number(rawValue) : rawValue
        const newData = setPath(currentData, fieldPath, newValue)
        dispatch({
            type: "trait.update",
            params: { entityId: entity.id, traitName, data: newData },
        })
    }

    return (
        <div data-testid="inspector" className="inspector">
            <div className="inspector-header">
                <span data-testid="inspector-entity-id">{entity.id}</span>
                <span data-testid="inspector-entity-type" className="inspector-type">
                    {entity.type}
                </span>
            </div>

            {Object.entries(entity.traits).map(([traitName, traitData]) => {
                if (typeof traitData !== "object" || traitData === null) return null
                const data = traitData as Record<string, unknown>
                const def = traitDefs.get(traitName)
                const editableFields = def?.editable?.fields ?? {}

                // Build the list of fields to render.
                // Prefer explicit editable.fields; fall back to flattening the data.
                const fieldsToRender = buildFieldList(data, editableFields)

                return (
                    <div
                        key={traitName}
                        data-testid={`trait-section-${traitName}`}
                        className="inspector-trait"
                    >
                        <h4 className="inspector-trait-name">{traitName}</h4>
                        {fieldsToRender.map(({ path, label, value, isNumber }) => (
                            <label
                                key={path}
                                data-testid={`field-${traitName}-${path.replace(/\./g, "-")}`}
                                className="inspector-field"
                            >
                                <span className="inspector-field-label">{label}</span>
                                <input
                                    type={isNumber ? "number" : "text"}
                                    value={
                                        isNumber
                                            ? typeof value === "number"
                                                ? value
                                                : ""
                                            : String(value ?? "")
                                    }
                                    onChange={(e) =>
                                        handleFieldChange(
                                            traitName,
                                            data,
                                            path,
                                            e.target.value,
                                            isNumber,
                                        )
                                    }
                                    className="inspector-field-input"
                                />
                            </label>
                        ))}
                    </div>
                )
            })}
        </div>
    )
}

// ── Field list builder ────────────────────────────────────────────

interface FieldDescriptor {
    path: string
    label: string
    value: unknown
    isNumber: boolean
}

/**
 * Build the list of fields to show in the inspector for one trait.
 *
 * If the trait has explicit editable.fields config, those paths
 * are used (in declaration order). Otherwise, flattens the trait
 * data one level deep (skipping object values that have no config).
 */
function buildFieldList(
    data: Record<string, unknown>,
    editableFields: Record<string, { label?: string; widget?: string }>,
): FieldDescriptor[] {
    if (Object.keys(editableFields).length > 0) {
        // Use declared editable fields
        return Object.entries(editableFields).map(([path, config]) => {
            const value = getPath(data, path)
            return {
                path,
                label: config.label ?? path,
                value,
                isNumber: typeof value === "number",
            }
        })
    }

    // Fallback: flatten one level
    const result: FieldDescriptor[] = []
    for (const [key, value] of Object.entries(data)) {
        if (typeof value === "object" && value !== null) {
            // Flatten one level of nesting
            for (const [subKey, subVal] of Object.entries(
                value as Record<string, unknown>,
            )) {
                result.push({
                    path: `${key}.${subKey}`,
                    label: `${key}.${subKey}`,
                    value: subVal,
                    isNumber: typeof subVal === "number",
                })
            }
        } else {
            result.push({
                path: key,
                label: key,
                value,
                isNumber: typeof value === "number",
            })
        }
    }
    return result
}
