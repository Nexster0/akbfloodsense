'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { AKTOBE_CENTER, MAP_DEFAULTS, STATUS_COLORS } from '@/lib/constants'
import type { StationWithReading, StationStatus, Building, FloodCalculation } from '@/lib/types'
import { FloodSlider } from '@/components/controls/flood-slider'
import { LayerToggles } from '@/components/controls/layer-toggles'
import { BuildingTooltip } from './building-tooltip'

interface CesiumViewerProps {
  stations: StationWithReading[]
  buildings: Building[]
  calculations: FloodCalculation[]
  floodSimulation: {
    realWaterLevelM: number
    effectiveWaterLevel: number
    simulationOffset: number
    isSimulating: boolean
    stats: {
      total: number
      flooded: number
      critical: number
      high: number
      medium: number
      low: number
      floodedPercent: number
    }
    setSimulationOffset: (offset: number) => void
    setIsSimulating: (enabled: boolean) => void
  }
  onStationSelect?: (station: StationWithReading) => void
}

export function CesiumViewer({
  stations,
  buildings,
  calculations,
  floodSimulation,
  onStationSelect,
}: CesiumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<unknown>(null)
  const waterEntityRef = useRef<unknown>(null)
  const cesiumRef = useRef<typeof import('cesium') | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [layerToggles, setLayerToggles] = useState({
    buildings: true,
    water: true,
    stations: true,
  })
  const [hoveredBuilding, setHoveredBuilding] = useState<{
    building: Building | null
    calc: FloodCalculation | null
    x: number
    y: number
  }>({ building: null, calc: null, x: 0, y: 0 })

  // Client-side mount check
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Initialize Cesium viewer
  useEffect(() => {
    if (!isMounted || !containerRef.current || viewerRef.current) return

    const initViewer = async () => {
      try {
        // Dynamically import Cesium
        const Cesium = await import('cesium')
        cesiumRef.current = Cesium

        // Import CSS
        await import('cesium/Build/Cesium/Widgets/widgets.css')

        // Set Ion token
        const cesiumToken = process.env.NEXT_PUBLIC_CESIUM_TOKEN || ''
        if (cesiumToken) {
          Cesium.Ion.defaultAccessToken = cesiumToken
        }

        // Create viewer with world terrain
        const viewer = new Cesium.Viewer(containerRef.current!, {
          terrain: Cesium.Terrain.fromWorldTerrain({
            requestVertexNormals: true,
          }),
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          vrButton: false,
          infoBox: false,
          selectionIndicator: false,
          creditContainer: document.createElement('div'),
        })

        // Set dark atmosphere
        viewer.scene.globe.enableLighting = false
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0a0a')
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a1a2e')

        // Try to add OSM buildings
        try {
          const osmBuildings = await Cesium.createOsmBuildingsAsync()
          viewer.scene.primitives.add(osmBuildings)
        } catch (err) {
          console.log('[v0] OSM Buildings unavailable:', err)
        }

        // Set initial camera position - Aktobe with tilted view
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(
            AKTOBE_CENTER.lng,
            AKTOBE_CENTER.lat - 0.05,
            15000
          ),
          orientation: {
            heading: Cesium.Math.toRadians(MAP_DEFAULTS.bearing + 180),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0,
          },
        })

        viewerRef.current = viewer
        setIsLoading(false)

        // Setup click handler for stations
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
        handler.setInputAction((movement: { position: { x: number; y: number } }) => {
          const pickedObject = viewer.scene.pick(movement.position)
          if (Cesium.defined(pickedObject) && pickedObject.id?.properties?.stationId) {
            const stationId = pickedObject.id.properties.stationId.getValue()
            const station = stations.find((s) => s.id === stationId)
            if (station) onStationSelect?.(station)
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

        return () => {
          handler.destroy()
        }
      } catch (error) {
        console.error('[v0] Cesium init error:', error)
        setIsLoading(false)
      }
    }

    initViewer()

    return () => {
      const viewer = viewerRef.current as { isDestroyed?: () => boolean; destroy?: () => void } | null
      if (viewer && typeof viewer.isDestroyed === 'function' && !viewer.isDestroyed()) {
        viewer.destroy?.()
        viewerRef.current = null
      }
    }
  }, [isMounted, stations, onStationSelect])

  // Update water surface based on flood simulation
  useEffect(() => {
    if (!viewerRef.current || !cesiumRef.current || !layerToggles.water) return

    const Cesium = cesiumRef.current
    const viewer = viewerRef.current as import('cesium').Viewer

    // Remove existing water entity
    if (waterEntityRef.current) {
      viewer.entities.remove(waterEntityRef.current as import('cesium').Entity)
      waterEntityRef.current = null
    }

    if (!floodSimulation.isSimulating) return

    // Create water surface as a rectangle at the effective water level
    const waterHeight = floodSimulation.effectiveWaterLevel

    // Define water extent around Aktobe (approximately 20km radius)
    const waterRectangle = Cesium.Rectangle.fromDegrees(
      AKTOBE_CENTER.lng - 0.2,
      AKTOBE_CENTER.lat - 0.15,
      AKTOBE_CENTER.lng + 0.2,
      AKTOBE_CENTER.lat + 0.15
    )

    const waterEntity = viewer.entities.add({
      rectangle: {
        coordinates: waterRectangle,
        material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.6),
        height: waterHeight,
        extrudedHeight: waterHeight + 0.5,
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#1d4ed8'),
        outlineWidth: 2,
      },
    })

    waterEntityRef.current = waterEntity
  }, [floodSimulation.effectiveWaterLevel, floodSimulation.isSimulating, layerToggles.water])

  // Add station markers
  useEffect(() => {
    if (!viewerRef.current || !cesiumRef.current || !layerToggles.stations) return

    const Cesium = cesiumRef.current
    const viewer = viewerRef.current as import('cesium').Viewer

    // Remove existing station entities
    const existingStations = viewer.entities.values.filter(
      (e) => e.properties?.isStation?.getValue() === true
    )
    existingStations.forEach((e) => viewer.entities.remove(e))

    // Add station markers
    stations.forEach((station) => {
      const status = station.latest_reading?.status || 'NORMAL'
      const color = Cesium.Color.fromCssColorString(STATUS_COLORS[status as StationStatus])

      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(station.lng, station.lat, 50),
        point: {
          pixelSize: 16,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: station.name_ru,
          font: '12px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, -25),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          isStation: true,
          stationId: station.id,
        },
      },
      )
    })
  }, [stations, layerToggles.stations])

  const handleLayerToggle = useCallback(
    (layer: 'buildings' | 'water' | 'stations', enabled: boolean) => {
      setLayerToggles((prev) => ({ ...prev, [layer]: enabled }))

      if (layer === 'buildings' && viewerRef.current) {
        const viewer = viewerRef.current as import('cesium').Viewer
        const primitives = viewer.scene.primitives as { _primitives?: unknown[] }
        primitives._primitives?.forEach((p: unknown) => {
          if ((p as { isCesium3DTileset?: boolean })?.isCesium3DTileset) {
            ;(p as { show: boolean }).show = enabled
          }
        })
      }
    },
    []
  )

  // Don't render anything on server
  if (!isMounted) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Инициализация...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Загрузка 3D карты...</p>
          </div>
        </div>
      )}

      {/* Cesium container */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Building hover tooltip */}
      <BuildingTooltip
        building={hoveredBuilding.building}
        calculation={hoveredBuilding.calc}
        x={hoveredBuilding.x}
        y={hoveredBuilding.y}
      />

      {/* Layer toggles - top right */}
      <div className="absolute right-4 top-4 z-10">
        <LayerToggles toggles={layerToggles} onToggle={handleLayerToggle} />
      </div>

      {/* Flood simulation slider - bottom right */}
      <div className="absolute bottom-8 right-4 z-10">
        <FloodSlider
          realWaterLevelM={floodSimulation.realWaterLevelM}
          effectiveWaterLevel={floodSimulation.effectiveWaterLevel}
          simulationOffset={floodSimulation.simulationOffset}
          isSimulating={floodSimulation.isSimulating}
          stats={floodSimulation.stats}
          onOffsetChange={floodSimulation.setSimulationOffset}
          onSimulationToggle={floodSimulation.setIsSimulating}
        />
      </div>
    </div>
  )
}
