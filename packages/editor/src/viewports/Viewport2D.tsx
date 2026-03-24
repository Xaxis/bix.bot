import React, { useCallback } from "react"
import { type StoreApi, type UseBoundStore } from "zustand"
import { type WorldStoreState } from "../stores/world-store.js"
import type { SpatialData } from "@bix/engine"

// ── Constants ────────────────────────────────────────────────────

/** SVG pixels per world unit. */
const SCALE = 30

// ── Coordinate helpers ────────────────────────────────────────────

function worldToSVG(
  worldX: number,
  worldZ: number,
  svgWidth: number,
  svgHeight: number,
): { x: number; y: number } {
  return {
    x: svgWidth / 2 + worldX * SCALE,
    y: svgHeight / 2 + worldZ * SCALE,
  }
}

function svgToWorld(
  svgX: number,
  svgY: number,
  svgWidth: number,
  svgHeight: number,
): { x: number; z: number } {
  return {
    x: (svgX - svgWidth / 2) / SCALE,
    z: (svgY - svgHeight / 2) / SCALE,
  }
}

// ── Viewport2D ────────────────────────────────────────────────────

export interface Viewport2DProps {
  /** The Zustand world store. Created via createWorldStore(world). */
  store: UseBoundStore<StoreApi<WorldStoreState>>
  /** SVG canvas width in pixels. */
  width?: number
  /** SVG canvas height in pixels. */
  height?: number
  /** Optional CSS class. */
  className?: string
}

/**
 * SVG-based top-down 2D viewport.
 *
 * Renders all entities that have a `spatial` trait as rectangles,
 * positioned by (x, z) world coordinates. The y-axis is ignored —
 * this is a floor-plan / top-down view.
 *
 * Entity size is derived from `spatial.scale.x` (width) and
 * `spatial.scale.z` (depth).
 *
 * In place mode: clicking the SVG background creates an entity at
 * the clicked world position, then returns to select mode.
 *
 * In select mode: clicking background clears selection; clicking
 * an entity rect selects it.
 */
export default function Viewport2D({
  store,
  width = 600,
  height = 400,
  className,
}: Viewport2DProps): JSX.Element {
  const entities = store((s) => s.entities)
  const selection = store((s) => s.selection)
  const activeTool = store((s) => s.activeTool)
  const pendingEntityType = store((s) => s.pendingEntityType)
  const setSelection = store((s) => s.setSelection)
  const clearSelection = store((s) => s.clearSelection)
  const dispatch = store((s) => s.dispatch)
  const setActiveTool = store((s) => s.setActiveTool)
  const setPendingEntityType = store((s) => s.setPendingEntityType)

  const spatialEntities = entities.filter((e) => "spatial" in e.traits)

  const handleSVGClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (activeTool === "place" && pendingEntityType !== null) {
        // Convert SVG click coordinates to world coordinates
        const rect = e.currentTarget.getBoundingClientRect()
        const svgX = e.clientX - rect.left
        const svgY = e.clientY - rect.top
        const { x: worldX, z: worldZ } = svgToWorld(svgX, svgY, width, height)

        dispatch({
          type: "entity.create",
          params: {
            entityType: pendingEntityType,
            traits: {
              spatial: {
                position: { x: worldX, y: 0, z: worldZ },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                scale: { x: 1, y: 1, z: 1 },
              },
              renderable: {
                visible: true,
                opacity: 1,
                layer: 0,
              },
            },
          },
        })

        // Return to select mode after placement
        setActiveTool("select")
        setPendingEntityType(null)
      } else {
        clearSelection()
      }
    },
    [
      activeTool,
      pendingEntityType,
      dispatch,
      setActiveTool,
      setPendingEntityType,
      clearSelection,
      width,
      height,
    ],
  )

  return (
    <svg
      data-testid="viewport-2d"
      width={width}
      height={height}
      className={className}
      onClick={handleSVGClick}
      style={{
        background: "#1a1a2e",
        cursor: activeTool === "place" ? "crosshair" : "default",
      }}
    >
      {/* Grid lines for orientation */}
      <line
        x1={width / 2}
        y1={0}
        x2={width / 2}
        y2={height}
        stroke="#333"
        strokeWidth={1}
      />
      <line
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke="#333"
        strokeWidth={1}
      />

      {/* Entity rects */}
      {spatialEntities.map((entity) => {
        const spatial = entity.traits["spatial"] as SpatialData
        const pos = worldToSVG(spatial.position.x, spatial.position.z, width, height)
        const w = Math.max(spatial.scale.x * SCALE, 4)
        const h = Math.max(spatial.scale.z * SCALE, 4)
        const selected = selection.has(entity.id)

        return (
          <rect
            key={entity.id}
            data-entity-id={entity.id}
            data-selected={selected}
            x={pos.x - w / 2}
            y={pos.y - h / 2}
            width={w}
            height={h}
            fill={selected ? "orange" : "steelblue"}
            stroke={selected ? "#ff8c00" : "#4169e1"}
            strokeWidth={selected ? 2 : 1}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation()
              setSelection([entity.id])
            }}
          />
        )
      })}
    </svg>
  )
}
