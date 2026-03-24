import React, { type MouseEvent, type CSSProperties } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { type StoreApi, type UseBoundStore } from "zustand"
import { type WorldStoreState } from "../stores/world-store.js"
import type { SpatialData, RenderableData } from "@bix/engine"

// ── EntityMesh ────────────────────────────────────────────────────

interface EntityMeshProps {
    entityId: string
    position: [number, number, number]
    scale: [number, number, number]
    selected: boolean
    onSelect: (id: string) => void
}

/**
 * Renders a single entity as a box mesh in the 3D viewport.
 *
 * In production (real R3F): `<mesh>` and children are Three.js objects.
 * In tests (Canvas mocked as div): `<mesh>` renders as a DOM element
 * and the onClick handler fires normally via React's event system.
 */
function EntityMesh({
    entityId,
    position,
    scale,
    selected,
    onSelect,
}: EntityMeshProps): JSX.Element {
    const handleClick = (e: MouseEvent): void => {
        e.stopPropagation()
        onSelect(entityId)
    }

    return (
        // @ts-expect-error — mesh is a Three.js JSX element registered by R3F
        // `name` is a real Three.js property — safe for R3F applyProps.
        // data-* attributes cause R3F path-traversal errors (data.entity.id fails).
        <mesh name={entityId} position={position} scale={scale} onClick={handleClick}>
            {/* @ts-expect-error — R3F intrinsic element */}
            <boxGeometry args={[1, 1, 1]} />
            {/* @ts-expect-error — R3F intrinsic element */}
            <meshStandardMaterial color={selected ? "orange" : "gray"} />
        </mesh>
    )
}

// ── Default spatial + renderable traits for placed entities ───────

const DEFAULT_SPATIAL = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
}

const DEFAULT_RENDERABLE = {
    visible: true,
    opacity: 1,
    layer: 0,
}

// ── Viewport3D ────────────────────────────────────────────────────

export interface Viewport3DProps {
    /** The Zustand world store. Created via createWorldStore(world). */
    store: UseBoundStore<StoreApi<WorldStoreState>>
    /** Optional CSS class for the canvas container. */
    className?: string
    /** Optional inline styles. */
    style?: CSSProperties
}

/**
 * 3D viewport that renders entities with Spatial + Renderable traits
 * as box meshes positioned in world space.
 *
 * Clicking a mesh selects the entity. Clicking the background clears
 * selection (or places an entity in place mode).
 *
 * In place mode: clicking the canvas creates an entity at a default
 * position (0, 0, 0) with spatial + renderable traits, then returns
 * to select mode. Full raycasting-based placement comes in a later phase.
 */
export default function Viewport3D({
    store,
    className,
    style,
}: Viewport3DProps): JSX.Element {
    const entities = store((s) => s.entities)
    const selection = store((s) => s.selection)
    const activeTool = store((s) => s.activeTool)
    const pendingEntityType = store((s) => s.pendingEntityType)
    const setSelection = store((s) => s.setSelection)
    const clearSelection = store((s) => s.clearSelection)
    const dispatch = store((s) => s.dispatch)
    const setActiveTool = store((s) => s.setActiveTool)
    const setPendingEntityType = store((s) => s.setPendingEntityType)

    const renderableEntities = entities.filter(
        (e) => "spatial" in e.traits && "renderable" in e.traits,
    )

    const handleCanvasClick = (): void => {
        if (activeTool === "place" && pendingEntityType !== null) {
            // Place at world origin — proper raycasting comes in a future phase
            dispatch({
                type: "entity.create",
                params: {
                    entityType: pendingEntityType,
                    traits: {
                        spatial: DEFAULT_SPATIAL,
                        renderable: DEFAULT_RENDERABLE,
                    },
                },
            })
            setActiveTool("select")
            setPendingEntityType(null)
        } else {
            clearSelection()
        }
    }

    return (
        <Canvas
            className={className}
            style={style}
            data-testid="viewport-3d"
            onClick={handleCanvasClick}
        >
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 10]} intensity={1} />

            {renderableEntities.map((entity) => {
                const spatial = entity.traits["spatial"] as SpatialData
                const renderable = entity.traits["renderable"] as RenderableData

                if (!renderable.visible) return null

                return (
                    <EntityMesh
                        key={entity.id}
                        entityId={entity.id}
                        position={[
                            spatial.position.x,
                            spatial.position.y,
                            spatial.position.z,
                        ]}
                        scale={[spatial.scale.x, spatial.scale.y, spatial.scale.z]}
                        selected={selection.has(entity.id)}
                        onSelect={(id) => setSelection([id])}
                    />
                )
            })}

            <OrbitControls />
        </Canvas>
    )
}
