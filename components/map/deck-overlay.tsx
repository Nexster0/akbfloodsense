'use client'

import { useEffect, useRef } from 'react'
import { Deck } from '@deck.gl/core'
import { PolygonLayer, ScatterplotLayer } from '@deck.gl/layers'
import type { MapRef } from 'react-map-gl/maplibre'
import type { Building, FloodCalculation, GaugeStation } from '@/lib/types'
import { getFloodColor, WATER_COLOR } from '@/lib/flood-calculator'
import { FLOOR_HEIGHT_M } from '@/lib/constants'

interface DeckOverlayProps {
  mapRef: React.RefObject<MapRef | null>
  buildings: Building[]
  calculations: FloodCalculation[]
  stations: GaugeStation[]
  effectiveWaterLevel: number
  layerToggles: { buildings: boolean; water: boolean; stations: boolean }
  onBuildingHover: (
    building: Building | null,
    calc: FloodCalculation | null,
    x: number,
    y: number
  ) => void
}

export function DeckOverlay({
  mapRef,
  buildings,
  calculations,
  stations,
  effectiveWaterLevel,
  layerToggles,
  onBuildingHover,
}: DeckOverlayProps) {
  const deckRef = useRef<Deck | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Build lookup map for calculations
  const calcMap = new Map(calculations.map((c) => [c.building_id, c]))

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !containerRef.current) return

    const deck = new Deck({
      parent: containerRef.current,
      controller: false,
      style: { pointerEvents: 'none' },
      views: [],
      layers: [],
      getTooltip: null,
    })

    const syncViewState = () => {
      const center = map.getCenter()
      deck.setProps({
        viewState: {
          longitude: center.lng,
          latitude: center.lat,
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        },
      })
    }

    map.on('move', syncViewState)
    map.on('resize', syncViewState)
    syncViewState()

    deckRef.current = deck

    return () => {
      map.off('move', syncViewState)
      map.off('resize', syncViewState)
      deck.finalize()
      deckRef.current = null
    }
  }, [mapRef])

  useEffect(() => {
    if (!deckRef.current) return

    const layers: (PolygonLayer | ScatterplotLayer)[] = []

    // Water surface polygon (flood zone approximation)
    if (layerToggles.water) {
      layers.push(
        new PolygonLayer({
          id: 'water-surface',
          data: [
            {
              polygon: [
                [57.05, 50.18],
                [57.32, 50.18],
                [57.32, 50.38],
                [57.05, 50.38],
              ],
            },
          ],
          getPolygon: (d: { polygon: number[][] }) => d.polygon,
          getFillColor: WATER_COLOR,
          getLineColor: [55, 138, 221, 200],
          lineWidthMinPixels: 1,
          extruded: false,
          pickable: false,
        })
      )
    }

    // 3D buildings
    if (layerToggles.buildings && buildings.length > 0) {
      layers.push(
        new PolygonLayer({
          id: 'buildings-3d',
          data: buildings,
          getPolygon: (b: Building) => b.footprint,
          getFillColor: (b: Building) => {
            const calc = calcMap.get(b.id)
            return calc ? getFloodColor(calc) : [180, 180, 180, 200]
          },
          getElevation: (b: Building) => (b.floors ?? 2) * FLOOR_HEIGHT_M,
          extruded: true,
          wireframe: false,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 80],
          onHover: (info) => {
            const building = info.object as Building | undefined
            const calc = building ? calcMap.get(building.id) ?? null : null
            onBuildingHover(building ?? null, calc, info.x, info.y)
          },
          updateTriggers: {
            getFillColor: [calculations],
          },
        })
      )
    }

    // Station markers (as 3D pillars)
    if (layerToggles.stations) {
      layers.push(
        new ScatterplotLayer({
          id: 'stations-deck',
          data: stations,
          getPosition: (s: GaugeStation) => [s.lng, s.lat],
          getRadius: 50,
          getFillColor: [239, 68, 68, 220],
          getLineColor: [255, 255, 255, 200],
          lineWidthMinPixels: 2,
          stroked: true,
          pickable: false,
        })
      )
    }

    deckRef.current.setProps({ layers })
  }, [
    buildings,
    calculations,
    stations,
    layerToggles,
    effectiveWaterLevel,
    calcMap,
    onBuildingHover,
  ])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}
