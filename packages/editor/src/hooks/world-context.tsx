import React, { createContext, useContext, useMemo, useEffect } from "react"
import { type StoreApi, type UseBoundStore } from "zustand"
import { type World } from "@bix/engine"
import { createWorldStore, type WorldStoreState } from "../stores/world-store.js"

// ── Context ───────────────────────────────────────────────────────

interface WorldContextValue {
    world: World
    store: UseBoundStore<StoreApi<WorldStoreState>>
}

const WorldContext = createContext<WorldContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────

export interface WorldStoreProviderProps {
    world: World
    children: React.ReactNode
}

/**
 * Provides a World instance and its reactive Zustand store to all
 * descendant components via React context.
 *
 * All `useWorld*` hooks require this provider to be present in the tree.
 * `BixEditor` renders this provider automatically — only needed when
 * building custom editor layouts without BixEditor.
 *
 * ```tsx
 * <WorldStoreProvider world={world}>
 *   <Palette schema={schema} />
 *   <Inspector schema={schema} />
 *   <Viewport3D />
 * </WorldStoreProvider>
 * ```
 */
export function WorldStoreProvider({
    world,
    children,
}: WorldStoreProviderProps): JSX.Element {
    const { store, destroy } = useMemo(() => createWorldStore(world), [world])
    useEffect(() => destroy, [destroy])

    const value = useMemo(() => ({ world, store }), [world, store])

    return <WorldContext.Provider value={value}>{children}</WorldContext.Provider>
}

// ── Context accessor ──────────────────────────────────────────────

/**
 * Internal hook — access the raw WorldContext value.
 * Use the typed convenience hooks instead (useWorld, useWorldStore, etc.).
 */
export function useWorldContext(): WorldContextValue {
    const ctx = useContext(WorldContext)
    if (ctx === null) {
        throw new Error(
            "useWorldContext must be used inside a <WorldStoreProvider>. " +
                "If you're using custom layout, wrap your components with WorldStoreProvider.",
        )
    }
    return ctx
}
