'use client'

import { useState, useCallback, lazy, Suspense } from 'react'
import useSWR from 'swr'
import { Map, Box } from 'lucide-react'

import { Sidebar } from '@/components/sidebar/sidebar'
import { FloodMap } from '@/components/map/flood-map'
import { AlertBanner } from '@/components/alerts/alert-banner'
import { Button } from '@/components/ui/button'
import { getMockStationsWithReadings, MOCK_GENERAL_SITUATION } from '@/lib/constants'
import { useFloodSimulation } from '@/hooks/use-flood-simulation'
import type { StationWithReading, Building, Alert } from '@/lib/types'

// Lazy load Cesium viewer to avoid SSR issues
const CesiumViewer = lazy(() =>
  import('@/components/map/cesium-viewer').then((mod) => ({ default: mod.CesiumViewer }))
)

// Fetcher for stations (mock data for now)
async function fetchStations(): Promise<{
  stations: StationWithReading[]
  generalSituation: string
}> {
  await new Promise((resolve) => setTimeout(resolve, 500))
  return {
    stations: getMockStationsWithReadings(),
    generalSituation: MOCK_GENERAL_SITUATION,
  }
}

// Fetcher for buildings from API
async function fetchBuildings(): Promise<Building[]> {
  try {
    const res = await fetch('/api/buildings')
    if (!res.ok) return []
    const data = await res.json()
    // Convert GeoJSON features to Building objects
    if (data.features) {
      return data.features.map((f: { properties: Partial<Building>; geometry: { coordinates: number[][][] } }) => ({
        ...f.properties,
        footprint: f.geometry.coordinates[0] || [],
      }))
    }
    return []
  } catch {
    return []
  }
}

// Fetcher for alerts
async function fetchAlerts(): Promise<Alert[]> {
  try {
    const res = await fetch('/api/alerts')
    if (!res.ok) return []
    const data = await res.json()
    return data.alerts || []
  } catch {
    return []
  }
}

type MapViewMode = '2d' | '3d'

export default function DashboardPage() {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null)
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>('2d')

  // Fetch stations data
  const { data: stationData, isLoading, mutate } = useSWR('stations', fetchStations, {
    revalidateOnFocus: false,
  })

  // Fetch buildings data
  const { data: buildings = [] } = useSWR('buildings', fetchBuildings, {
    revalidateOnFocus: false,
  })

  // Fetch alerts data
  const { data: alerts = [] } = useSWR('alerts', fetchAlerts, {
    revalidateOnFocus: false,
    refreshInterval: 60000, // Refresh every minute
  })

  const stations = stationData?.stations ?? []
  const generalSituation = stationData?.generalSituation

  // Flood simulation hook
  const floodSimulation = useFloodSimulation(buildings, stations)

  const handleStationSelect = useCallback((station: StationWithReading) => {
    setSelectedStationId(station.id)
  }, [])

  const handleRefresh = useCallback(async () => {
    await mutate()
  }, [mutate])

  // Build flood stats message for sidebar
  const floodStatsMessage =
    buildings.length > 0 && floodSimulation.stats.flooded > 0
      ? `${floodSimulation.stats.flooded} зданий под водой`
      : buildings.length > 0
        ? `${buildings.length} зданий загружено`
        : undefined

  return (
    <>
      <AlertBanner alerts={alerts} />

      <div className="flex h-screen w-screen overflow-hidden">
        {/* Sidebar - Desktop: fixed width, Mobile: bottom sheet */}
        <div className="hidden h-full w-[380px] shrink-0 md:block">
          <Sidebar
            stations={stations}
            isLoading={isLoading}
            generalSituation={generalSituation}
            lastUpdated={new Date()}
            selectedStationId={selectedStationId}
            onStationSelect={handleStationSelect}
            onRefresh={handleRefresh}
            floodStatsMessage={floodStatsMessage}
          />
        </div>

        {/* Map Area */}
        <div className="relative flex-1">
          {/* Map View Toggle */}
          <div className="absolute left-4 top-4 z-20 flex gap-1 rounded-lg border border-border/50 bg-card/90 p-1 backdrop-blur-md">
            <Button
              variant={mapViewMode === '2d' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5 px-3"
              onClick={() => setMapViewMode('2d')}
            >
              <Map className="h-4 w-4" />
              <span className="text-xs">2D</span>
            </Button>
            <Button
              variant={mapViewMode === '3d' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5 px-3"
              onClick={() => setMapViewMode('3d')}
            >
              <Box className="h-4 w-4" />
              <span className="text-xs">3D</span>
            </Button>
          </div>

          {/* Map Views */}
          {mapViewMode === '2d' ? (
            <FloodMap
              stations={stations}
              buildings={buildings}
              calculations={floodSimulation.buildingCalculations}
              floodSimulation={floodSimulation}
              onStationSelect={handleStationSelect}
            />
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center bg-background">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">Загрузка 3D карты...</p>
                  </div>
                </div>
              }
            >
              <CesiumViewer
                stations={stations}
                buildings={buildings}
                calculations={floodSimulation.buildingCalculations}
                floodSimulation={floodSimulation}
                onStationSelect={handleStationSelect}
              />
            </Suspense>
          )}

          {/* Mobile Bottom Sheet */}
          <div className="absolute inset-x-0 bottom-0 h-64 md:hidden">
            <Sidebar
              stations={stations}
              isLoading={isLoading}
              generalSituation={generalSituation}
              lastUpdated={new Date()}
              selectedStationId={selectedStationId}
              onStationSelect={handleStationSelect}
              onRefresh={handleRefresh}
              floodStatsMessage={floodStatsMessage}
            />
          </div>
        </div>
      </div>
    </>
  )
}
