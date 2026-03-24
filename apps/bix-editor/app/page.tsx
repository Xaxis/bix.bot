"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import dynamic from "next/dynamic"
import { World } from "@bix/engine"
import { Palette, Inspector, Toolbar, WorldStoreProvider, createWorldStore } from "@bix/editor"
import solarSystemSchema from "../schema/index"

// R3F components must be dynamically imported (browser-only)
const SolarViewport = dynamic(() => import("../components/SolarViewport"), {
    ssr: false,
    loading: () => (
        <div
            style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#444",
                fontSize: 14,
            }}
        >
            Loading 3D viewport…
        </div>
    ),
})

const AgentPanel = dynamic(() => import("../components/AgentPanel"), {
    ssr: false,
})

// ── Solar system seed data ────────────────────────────────────────

interface BodyDef {
    id: string
    type: "star" | "planet" | "moon"
    parent?: string
    name: string
    color: string
    scale: number
    orbitRadius: number
    orbitSpeed: number
    orbitAngle: number
    luminosity?: number
}

const SOLAR_SYSTEM: BodyDef[] = [
    {
        id: "sol",
        type: "star",
        name: "Sol",
        color: "#FDB813",
        scale: 2.2,
        orbitRadius: 0,
        orbitSpeed: 0,
        orbitAngle: 0,
        luminosity: 2.5,
    },
    {
        id: "mercury",
        type: "planet",
        parent: "sol",
        name: "Mercury",
        color: "#b0b0b0",
        scale: 0.38,
        orbitRadius: 5,
        orbitSpeed: 1.6,
        orbitAngle: 0.8,
    },
    {
        id: "venus",
        type: "planet",
        parent: "sol",
        name: "Venus",
        color: "#e8cda0",
        scale: 0.9,
        orbitRadius: 8,
        orbitSpeed: 1.2,
        orbitAngle: 2.1,
    },
    {
        id: "earth",
        type: "planet",
        parent: "sol",
        name: "Earth",
        color: "#2266cc",
        scale: 1.0,
        orbitRadius: 12,
        orbitSpeed: 1.0,
        orbitAngle: 4.2,
    },
    {
        id: "luna",
        type: "moon",
        parent: "earth",
        name: "Luna",
        color: "#aaaaaa",
        scale: 0.27,
        orbitRadius: 1.8,
        orbitSpeed: 2.5,
        orbitAngle: 1.0,
    },
    {
        id: "mars",
        type: "planet",
        parent: "sol",
        name: "Mars",
        color: "#cc4422",
        scale: 0.55,
        orbitRadius: 17,
        orbitSpeed: 0.8,
        orbitAngle: 1.0,
    },
    {
        id: "phobos",
        type: "moon",
        parent: "mars",
        name: "Phobos",
        color: "#996655",
        scale: 0.15,
        orbitRadius: 0.8,
        orbitSpeed: 4.0,
        orbitAngle: 0.5,
    },
    {
        id: "jupiter",
        type: "planet",
        parent: "sol",
        name: "Jupiter",
        color: "#c8884a",
        scale: 1.8,
        orbitRadius: 26,
        orbitSpeed: 0.4,
        orbitAngle: 3.5,
    },
    {
        id: "io",
        type: "moon",
        parent: "jupiter",
        name: "Io",
        color: "#e8d040",
        scale: 0.25,
        orbitRadius: 2.4,
        orbitSpeed: 3.0,
        orbitAngle: 0.0,
    },
    {
        id: "europa",
        type: "moon",
        parent: "jupiter",
        name: "Europa",
        color: "#a0d0e8",
        scale: 0.22,
        orbitRadius: 3.2,
        orbitSpeed: 2.0,
        orbitAngle: 1.5,
    },
    {
        id: "ganymede",
        type: "moon",
        parent: "jupiter",
        name: "Ganymede",
        color: "#887766",
        scale: 0.38,
        orbitRadius: 4.2,
        orbitSpeed: 1.3,
        orbitAngle: 3.0,
    },
    {
        id: "saturn",
        type: "planet",
        parent: "sol",
        name: "Saturn",
        color: "#e8d070",
        scale: 1.6,
        orbitRadius: 38,
        orbitSpeed: 0.25,
        orbitAngle: 0.8,
    },
    {
        id: "titan",
        type: "moon",
        parent: "saturn",
        name: "Titan",
        color: "#e88040",
        scale: 0.4,
        orbitRadius: 3.5,
        orbitSpeed: 1.2,
        orbitAngle: 2.5,
    },
]

function seedWorld(world: World): void {
    for (const body of SOLAR_SYSTEM) {
        world.dispatch({
            type: "entity.create",
            params: {
                entityType: body.type,
                id: body.id,
                ...(body.parent ? { parent: body.parent } : {}),
                traits: {
                    orbital: {
                        orbitRadius: body.orbitRadius,
                        orbitSpeed: body.orbitSpeed,
                        orbitAngle: body.orbitAngle,
                        parentBody: body.parent ?? "",
                    },
                    spatial: {
                        position: {
                            x: body.orbitRadius,
                            y: 0,
                            z: 0,
                        },
                        rotation: { x: 0, y: 0, z: 0, w: 1 },
                        scale: { x: body.scale, y: body.scale, z: body.scale },
                    },
                    ...(body.luminosity !== undefined
                        ? { emissive: { luminosity: body.luminosity, color: body.color } }
                        : {}),
                    metadata: {
                        name: body.name,
                        description: `${body.name} — a ${body.type} in the solar system`,
                        tags: [body.type],
                        custom: { color: body.color },
                    },
                },
            },
        })
    }
    // Clear the dispatch history so undo doesn't undo the seed
    // (We just let it accumulate — users can undo their own actions)
}

// ── Violation toast ───────────────────────────────────────────────

function ViolationToast({
    message,
    onDismiss,
}: {
    message: string
    onDismiss: () => void
}) {
    useEffect(() => {
        const t = setTimeout(onDismiss, 4000)
        return () => clearTimeout(t)
    }, [onDismiss])

    return (
        <div
            style={{
                position: "fixed",
                bottom: 220,
                left: "50%",
                transform: "translateX(-50%)",
                background: "#2d1b1b",
                border: "1px solid #f85149",
                borderRadius: 8,
                padding: "10px 16px",
                color: "#f85149",
                fontSize: 13,
                zIndex: 1000,
                maxWidth: 400,
                textAlign: "center",
                boxShadow: "0 4px 20px rgba(248,81,73,0.3)",
            }}
        >
            ⛔ {message}
        </div>
    )
}

// ── Editor inner (uses store from provider) ───────────────────────

function EditorInner({ world }: { world: World }) {
    // Get store from context — all child components share one store
    const { store } = useMemo(() => {
        // This is called once; the WorldStoreProvider above owns the store
        // We access it via the store handle we pass down
        return { store: null }
    }, [])

    // Use the store via hooks in sub-components
    return null
}

// ── Main page ─────────────────────────────────────────────────────

export default function Page() {
    const [violation, setViolation] = useState<string | null>(null)

    const world = useMemo(() => {
        const w = World.create(solarSystemSchema)
        seedWorld(w)
        return w
    }, [])

    const { store, destroy } = useMemo(() => createWorldStore(world), [world])

    // Clean up store subscription on unmount
    useEffect(() => destroy, [destroy])

    // Animation loop
    const rafRef = useRef<number | null>(null)
    const lastTimeRef = useRef<number | null>(null)

    useEffect(() => {
        function tick(now: number) {
            const last = lastTimeRef.current ?? now
            const dt = Math.min((now - last) / 1000, 0.05)
            lastTimeRef.current = now
            world.tick(dt)
            rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [world])

    const handleViolation = (msg: string) => setViolation(msg)

    return (
        <WorldStoreProvider world={world}>
            <div
                style={{
                    width: "100vw",
                    height: "100vh",
                    display: "flex",
                    flexDirection: "column",
                    background: "#0d1117",
                    color: "#c9d1d9",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    overflow: "hidden",
                }}
            >
                {/* ── Toolbar ─────────────────────────────────────────── */}
                <div
                    style={{
                        height: 44,
                        borderBottom: "1px solid #21262d",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 12px",
                        gap: 8,
                        flexShrink: 0,
                        background: "#161b22",
                    }}
                >
                    <span style={{ fontSize: 16, marginRight: 4 }}>🌌</span>
                    <span
                        style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#e6edf3",
                            marginRight: 16,
                        }}
                    >
                        Solar System Editor
                    </span>
                    <Toolbar store={store} />
                </div>

                {/* ── Main body ────────────────────────────────────────── */}
                <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                    {/* ── Left sidebar: Palette ─────────────────────── */}
                    <div
                        style={{
                            width: 180,
                            borderRight: "1px solid #21262d",
                            background: "#161b22",
                            flexShrink: 0,
                            overflow: "auto",
                        }}
                    >
                        <Palette store={store} schema={solarSystemSchema} />
                    </div>

                    {/* ── Center: 3D viewport ───────────────────────── */}
                    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                        <SolarViewport store={store} onViolation={handleViolation} />

                        {/* Constraint count overlay */}
                        <ConstraintBadge store={store} />
                    </div>

                    {/* ── Right sidebar: Inspector ──────────────────── */}
                    <div
                        style={{
                            width: 240,
                            borderLeft: "1px solid #21262d",
                            background: "#161b22",
                            flexShrink: 0,
                            overflow: "auto",
                        }}
                    >
                        <Inspector store={store} schema={solarSystemSchema} />
                    </div>
                </div>

                {/* ── Bottom: Agent panel ──────────────────────────────── */}
                <div
                    style={{
                        height: 200,
                        borderTop: "1px solid #21262d",
                        flexShrink: 0,
                    }}
                >
                    <AgentPanel
                        store={store}
                        world={world}
                        onViolation={handleViolation}
                    />
                </div>

                {/* ── Violation toast ─────────────────────────────────── */}
                {violation && (
                    <ViolationToast
                        message={violation}
                        onDismiss={() => setViolation(null)}
                    />
                )}
            </div>
        </WorldStoreProvider>
    )
}

// ── Constraint badge ──────────────────────────────────────────────

function ConstraintBadge({
    store,
}: {
    store: ReturnType<typeof createWorldStore>["store"]
}) {
    const violations = store((s) => s.lastViolations)
    const count = store((s) => s.entities.length)

    return (
        <div
            style={{
                position: "absolute",
                top: 12,
                right: 12,
                background: "rgba(13,17,23,0.8)",
                border: "1px solid #21262d",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 11,
                color: "#7d8590",
                backdropFilter: "blur(4px)",
            }}
        >
            {count} bodies ·{" "}
            {violations.length > 0 ? (
                <span style={{ color: "#f0a500" }}>
                    ⚠ {violations.length} warning{violations.length > 1 ? "s" : ""}
                </span>
            ) : (
                <span style={{ color: "#3fb950" }}>✓ all constraints satisfied</span>
            )}
        </div>
    )
}
