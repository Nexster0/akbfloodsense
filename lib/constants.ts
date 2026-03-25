import type { GaugeStation, GaugeReading, StationStatus, FloodForecast } from './types'

export const AKTOBE_CENTER = { lat: 50.2839, lng: 57.1667 }
export const MAP_DEFAULTS = { zoom: 11, pitch: 55, bearing: -15 }

export const STATUS_COLORS: Record<StationStatus, string> = {
  NORMAL: '#22c55e',
  WATCH: '#eab308',
  WARNING: '#f97316',
  DANGER: '#ef4444',
  CRITICAL: '#7f1d1d',
}

export const STATUS_LABELS_RU: Record<StationStatus, string> = {
  NORMAL: 'Норма',
  WATCH: 'Наблюдение',
  WARNING: 'Предупреждение',
  DANGER: 'Опасность',
  CRITICAL: 'Критично',
}

export const FORECAST_LABELS_RU: Record<FloodForecast, string> = {
  rising: 'рост',
  falling: 'спад',
  stable: 'стабильно',
}

export const FLOOR_HEIGHT_M = 3.0

export const FLOOD_RISK_COLORS = {
  none: '#22c55e22',
  low: '#eab30866',
  medium: '#f9731666',
  high: '#ef444499',
  critical: '#7f1d1dcc',
}

export const STATION_IDS = [
  'ilek-aktobe',
  'ilek-ilek',
  'khobda-kandyag',
  'uil-uil',
  'aktobe-aktobe',
]

// Mock gauge stations data
export const MOCK_STATIONS: GaugeStation[] = [
  {
    id: 'ilek-aktobe',
    name_ru: 'Илек - Актобе',
    river: 'р. Илек',
    lat: 50.2839,
    lng: 57.1667,
    zero_elevation_m: 185.5,
    danger_level_cm: 400,
    warning_level_cm: 350,
    normal_level_cm: 200,
  },
  {
    id: 'ilek-ilek',
    name_ru: 'Илек - пос. Илек',
    river: 'р. Илек',
    lat: 50.5167,
    lng: 57.3833,
    zero_elevation_m: 178.2,
    danger_level_cm: 380,
    warning_level_cm: 320,
    normal_level_cm: 180,
  },
  {
    id: 'khobda-kandyag',
    name_ru: 'Хобда - Кандыагаш',
    river: 'р. Хобда',
    lat: 49.4667,
    lng: 57.4333,
    zero_elevation_m: 165.8,
    danger_level_cm: 250,
    warning_level_cm: 200,
    normal_level_cm: 120,
  },
  {
    id: 'uil-uil',
    name_ru: 'Уил - пос. Уил',
    river: 'р. Уил',
    lat: 49.0667,
    lng: 54.6833,
    zero_elevation_m: 142.3,
    danger_level_cm: 220,
    warning_level_cm: 180,
    normal_level_cm: 100,
  },
  {
    id: 'aktobe-aktobe',
    name_ru: 'Актобе - город',
    river: 'р. Илек (город)',
    lat: 50.2797,
    lng: 57.2072,
    zero_elevation_m: 188.0,
    danger_level_cm: 300,
    warning_level_cm: 250,
    normal_level_cm: 150,
  },
]

// Generate mock historical readings for sparklines
function generateHistoricalReadings(
  stationId: string,
  currentLevel: number,
  currentChange: number,
  status: StationStatus,
  forecast: FloodForecast
): GaugeReading[] {
  const readings: GaugeReading[] = []
  let level = currentLevel - currentChange * 6

  for (let i = 6; i >= 0; i--) {
    const dayChange = i === 0 ? currentChange : Math.round((Math.random() - 0.3) * 15)
    level = i === 0 ? currentLevel : level + dayChange

    readings.push({
      id: `${stationId}-${i}`,
      station_id: stationId,
      level_cm: Math.max(50, level),
      change_cm: dayChange,
      flow_rate_m3s: null,
      status: i === 0 ? status : 'NORMAL',
      forecast: i === 0 ? forecast : 'stable',
      notes: null,
      bulletin_week: 15,
      bulletin_year: 2024,
      recorded_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
    })
  }

  return readings
}

// Mock readings data (realistic April 2024 Aktobe flood peak)
export const MOCK_READINGS: Array<{
  station_id: string
  level_cm: number
  change_cm: number
  status: StationStatus
  forecast: FloodForecast
}> = [
  { station_id: 'ilek-aktobe', level_cm: 421, change_cm: 18, status: 'DANGER', forecast: 'rising' },
  { station_id: 'ilek-ilek', level_cm: 395, change_cm: 12, status: 'WARNING', forecast: 'rising' },
  { station_id: 'khobda-kandyag', level_cm: 187, change_cm: 5, status: 'WATCH', forecast: 'stable' },
  { station_id: 'uil-uil', level_cm: 142, change_cm: -3, status: 'NORMAL', forecast: 'falling' },
  { station_id: 'aktobe-aktobe', level_cm: 234, change_cm: 22, status: 'CRITICAL', forecast: 'rising' },
]

// Generate full mock data with stations and readings
export function getMockStationsWithReadings() {
  return MOCK_STATIONS.map((station) => {
    const mockReading = MOCK_READINGS.find((r) => r.station_id === station.id)!
    const historicalReadings = generateHistoricalReadings(
      station.id,
      mockReading.level_cm,
      mockReading.change_cm,
      mockReading.status,
      mockReading.forecast
    )

    return {
      ...station,
      latest_reading: historicalReadings[historicalReadings.length - 1],
      readings_history: historicalReadings,
    }
  })
}

export const MOCK_GENERAL_SITUATION = `По данным Казгидромета на 15 апреля 2024 года, на территории Актюбинской области наблюдается паводковая ситуация. 
Уровень воды в реке Илек в районе города Актобе превышает опасную отметку. 
Рекомендуется соблюдать осторожность жителям прибрежных районов.`
