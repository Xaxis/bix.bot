"use client"

import { useRef, useMemo } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import { OrbitControls, Stars, Line } from "@react-three/drei"
import * as THREE from "three"
import type { StoreApi, UseBoundStore } from "zustand"
import type { WorldStoreState } from "@bix/editor"
import type { Entity } from "@bix/engine"

// ── Entity appearance helpers ─────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
    star: "#FDB813",
    planet: "#4a80c4",
    moon: "#aaaaaa",
}

function getColor(entity: Entity): string {
    const custom = (entity.traits["metadata"] as any)?.custom?.color
    if (typeof custom === "string") return custom
    return TYPE_COLORS[entity.type] ?? "#888888"
}

function getSize(entity: Entity): number {
    return (entity.traits["spatial"] as any)?.scale?.x ?? 1
}

function getPosition(entity: Entity): [number, number, number] {
    const p = (entity.traits["spatial"] as any)?.position ?? { x: 0, y: 0, z: 0 }
    return [p.x, p.y, p.z]
}

function getParentPosition(
    entity: Entity,
    allEntities: readonly Entity[],
): [number, number, number] {
    if (!entity.parent) return [0, 0, 0]
    const parent = allEntities.find((e) => e.id === entity.parent)
    return getPosition(parent ?? entity)
}

// ── Orbit ring ────────────────────────────────────────────────────

function OrbitRing({ cx, cz, radius }: { cx: number; cz: number; radius: number }) {
    const points = useMemo(() => {
        const pts: [number, number, number][] = []
        for (let i = 0; i <= 128; i++) {
            const a = (i / 128) * Math.PI * 2
            pts.push([cx + Math.cos(a) * radius, 0, cz + Math.sin(a) * radius])
        }
        return pts
    }, [cx, cz, radius])

    return <Line points={points} color="#1a2040" lineWidth={1} />
}

// ── Entity body ───────────────────────────────────────────────────

function EntityBody({
    entity,
    selected,
    allEntities,
    onSelect,
}: {
    entity: Entity
    selected: boolean
    allEntities: readonly Entity[]
    onSelect: (id: string) => void
}) {
    const orbital = entity.traits["orbital"] as any
    const pos = getPosition(entity)
    const size = getSize(entity)
    const color = getColor(entity)
    const isStar = entity.type === "star"
    const parentPos = getParentPosition(entity, allEntities)

    return (
        <>
            {/* Orbit ring for non-stars */}
            {orbital && orbital.orbitRadius > 0 && (
                <OrbitRing
                    cx={parentPos[0]}
                    cz={parentPos[2]}
                    radius={orbital.orbitRadius}
                />
            )}

            {/* The body sphere */}
            <mesh
                position={pos}
                name={entity.id}
                onClick={(e) => {
                    e.stopPropagation()
                    onSelect(entity.id)
                }}
            >
                <sphereGeometry args={[size, 32, 16]} />
                {isStar ? (
                    <meshStandardMaterial
                        color={color}
                        emissive={color}
                        emissiveIntensity={2}
                        toneMapped={false}
                    />
                ) : (
                    <meshStandardMaterial
                        color={color}
                        roughness={0.8}
                        metalness={0.1}
                        emissive={selected ? "#ff6600" : "#000000"}
                        emissiveIntensity={selected ? 0.5 : 0}
                    />
                )}
            </mesh>

            {/* Selection ring */}
            {selected && (
                <mesh position={pos} rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[size * 1.4, size * 1.6, 32]} />
                    <meshBasicMaterial
                        color="#ff6600"
                        side={THREE.DoubleSide}
                        transparent
                        opacity={0.8}
                    />
                </mesh>
            )}

            {/* Point light for stars */}
            {isStar && (
                <pointLight
                    position={pos}
                    intensity={3}
                    distance={200}
                    color={color}
                    decay={0.5}
                />
            )}
        </>
    )
}

// ── Scene internals ───────────────────────────────────────────────

function SceneContent({
    entities,
    selection,
    activeTool,
    pendingEntityType,
    onSelect,
    onClearSelection,
    onPlaceEntity,
}: {
    entities: readonly Entity[]
    selection: ReadonlySet<string>
    activeTool: string
    pendingEntityType: string | null
    onSelect: (id: string) => void
    onClearSelection: () => void
    onPlaceEntity: (point: THREE.Vector3) => void
}) {
    const { camera, raycaster } = useThree()

    const renderableEntities = entities.filter(
        (e) => "spatial" in e.traits && "orbital" in e.traits,
    )

    return (
        <>
            {/* Background stars */}
            <Stars radius={300} depth={60} count={3000} factor={4} fade speed={0.3} />

            {/* Ambient and scene light */}
            <ambientLight intensity={0.08} />

            {/* Click-to-clear background plane (invisible) */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, -0.1, 0]}
                onClick={(e) => {
                    e.stopPropagation()
                    if (activeTool === "place" && pendingEntityType) {
                        onPlaceEntity(e.point)
                    } else {
                        onClearSelection()
                    }
                }}
            >
                <planeGeometry args={[2000, 2000]} />
                <meshBasicMaterial visible={false} />
            </mesh>

            {/* Entity bodies */}
            {renderableEntities.map((entity) => (
                <EntityBody
                    key={entity.id}
                    entity={entity}
                    selected={selection.has(entity.id)}
                    allEntities={entities}
                    onSelect={onSelect}
                />
            ))}

            {/* Camera controls */}
            <OrbitControls
                makeDefault
                enableDamping
                dampingFactor={0.05}
                minDistance={5}
                maxDistance={300}
            />
        </>
    )
}

// ── SolarViewport ─────────────────────────────────────────────────

export interface SolarViewportProps {
    store: UseBoundStore<StoreApi<WorldStoreState>>
    onViolation?: (message: string) => void
}

export default function SolarViewport({ store, onViolation }: SolarViewportProps) {
    const entities = store((s) => s.entities)
    const selection = store((s) => s.selection)
    const activeTool = store((s) => s.activeTool)
    const pendingEntityType = store((s) => s.pendingEntityType)
    const dispatch = store((s) => s.dispatch)
    const setSelection = store((s) => s.setSelection)
    const clearSelection = store((s) => s.clearSelection)
    const setActiveTool = store((s) => s.setActiveTool)
    const setPendingEntityType = store((s) => s.setPendingEntityType)

    const handleSelect = (id: string) => {
        setSelection([id])
    }

    const handlePlaceEntity = (point: THREE.Vector3) => {
        if (!pendingEntityType) return

        // Find the best parent: for planets, parent is the nearest star.
        // For moons, parent is the selected planet (if any) or nearest planet.
        let parentId: string | undefined
        const stars = entities.filter((e) => e.type === "star")
        const planets = entities.filter((e) => e.type === "planet")

        if (pendingEntityType === "moon") {
            // Moon needs a planet parent
            const selectedPlanet = [...selection].find((id) =>
                planets.some((p) => p.id === id),
            )
            parentId = selectedPlanet ?? planets[0]?.id
        } else if (pendingEntityType === "planet") {
            parentId = stars[0]?.id
        }
        // Stars have no parent

        const orbitRadius = Math.sqrt(point.x * point.x + point.z * point.z)

        const result = dispatch({
            type: "entity.create",
            params: {
                entityType: pendingEntityType,
                ...(parentId ? { parent: parentId } : {}),
                traits: {
                    orbital: {
                        orbitRadius: Math.max(orbitRadius, 2),
                        orbitSpeed:
                            pendingEntityType === "moon"
                                ? 1.5
                                : pendingEntityType === "star"
                                  ? 0
                                  : 0.5,
                        orbitAngle: Math.atan2(point.z, point.x),
                        parentBody: parentId ?? "",
                    },
                },
            },
        })

        if (result.prevented) {
            onViolation?.(
                result.violations?.map((v) => v.message).join("\n") ??
                    "Constraint prevented placement",
            )
        }

        setActiveTool("select")
        setPendingEntityType(null)
    }

    return (
        <Canvas
            camera={{ position: [0, 50, 80], fov: 45, near: 0.1, far: 2000 }}
            style={{
                background: "#030712",
                cursor: activeTool === "place" ? "crosshair" : "default",
            }}
        >
            <SceneContent
                entities={entities}
                selection={selection}
                activeTool={activeTool}
                pendingEntityType={pendingEntityType}
                onSelect={handleSelect}
                onClearSelection={clearSelection}
                onPlaceEntity={handlePlaceEntity}
            />
        </Canvas>
    )
}
