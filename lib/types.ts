export type StationStatus = 'NORMAL' | 'WATCH' | 'WARNING' | 'DANGER' | 'CRITICAL'
export type FloodForecast = 'rising' | 'falling' | 'stable'
export type AlertSeverity = 'WARNING' | 'DANGER' | 'CRITICAL'

export interface GaugeStation {
  id: string
  name_ru: string
  river: string
  lat: number
  lng: number
  zero_elevation_m: number
  danger_level_cm: number
  warning_level_cm: number
  normal_level_cm: number
}

export interface GaugeReading {
  id: string
  station_id: string
  level_cm: number
  change_cm: number
  flow_rate_m3s: number | null
  status: StationStatus
  forecast: FloodForecast
  notes: string | null
  bulletin_week: number
  bulletin_year: number
  recorded_at: string
}

export interface StationWithReading extends GaugeStation {
  latest_reading: GaugeReading | null
  readings_history: GaugeReading[]
}

export interface Building {
  id: string
  osm_id: number
  name_ru: string | null
  address: string | null
  district: string | null
  lat: number
  lng: number
  footprint: number[][]
  floors: number
  building_type: string
  foundation_elevation_m: number | null
  height_m: number | null
}

export interface FloodCalculation {
  building_id: string
  flooded_meters: number
  flooded_floors: number
  flood_percentage: number
  risk_level: 'none' | 'low' | 'medium' | 'high' | 'critical'
}

export interface BulletinCache {
  id: string
  week_number: number
  year: number
  pdf_url: string
  raw_json: unknown
  general_situation: string
  dangerous_sections: string[]
  parsed_at: string
}

export interface Alert {
  id: string
  station_id: string
  severity: AlertSeverity
  level_cm: number
  message_ru: string
  is_active: boolean
  created_at: string
  resolved_at: string | null
}
