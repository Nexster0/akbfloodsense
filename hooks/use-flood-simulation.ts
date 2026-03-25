'use client'

import { useState, useMemo } from 'react'
import type { Building, StationWithReading } from '@/lib/types'
import { calculateBuildingFlood } from '@/lib/flood-calculator'

export function useFloodSimulation(
  buildings: Building[],
  stations: StationWithReading[]
) {
  // Real water level from the most critical station
  const realWaterLevelM = useMemo(() => {
    if (!stations.length) return 205
    return stations.reduce((max, s) => {
      if (!s.latest_reading) return max
      const abs = (s.zero_elevation_m ?? 162) + s.latest_reading.level_cm / 100
      return Math.max(max, abs)
    }, 0)
  }, [stations])

  const [simulationOffset, setSimulationOffset] = useState(0) // -3 to +5 meters offset
  const [isSimulating, setIsSimulating] = useState(false)

  const effectiveWaterLevel = isSimulating
    ? realWaterLevelM + simulationOffset
    : realWaterLevelM

  const buildingCalculations = useMemo(() => {
    return buildings.map((b) => calculateBuildingFlood(b, effectiveWaterLevel))
  }, [buildings, effectiveWaterLevel])

  const stats = useMemo(() => {
    const flooded = buildingCalculations.filter((c) => c.risk_level !== 'none')
    return {
      total: buildings.length,
      flooded: flooded.length,
      critical: flooded.filter((c) => c.risk_level === 'critical').length,
      high: flooded.filter((c) => c.risk_level === 'high').length,
      medium: flooded.filter((c) => c.risk_level === 'medium').length,
      low: flooded.filter((c) => c.risk_level === 'low').length,
      floodedPercent: Math.round(
        (flooded.length / Math.max(buildings.length, 1)) * 100
      ),
    }
  }, [buildingCalculations, buildings.length])

  return {
    realWaterLevelM,
    effectiveWaterLevel,
    simulationOffset,
    setSimulationOffset,
    isSimulating,
    setIsSimulating,
    buildingCalculations,
    stats,
  }
}
