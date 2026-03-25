-- Create gauge_stations table
CREATE TABLE IF NOT EXISTS public.gauge_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ru TEXT NOT NULL,
  river TEXT NOT NULL,
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  zero_elevation_m DECIMAL(8, 2) NOT NULL,
  danger_level_cm INTEGER NOT NULL,
  warning_level_cm INTEGER NOT NULL,
  normal_level_cm INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Create gauge_readings table
CREATE TABLE IF NOT EXISTS public.gauge_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES public.gauge_stations(id) ON DELETE CASCADE,
  level_cm INTEGER NOT NULL,
  change_cm INTEGER NOT NULL DEFAULT 0,
  flow_rate_m3s DECIMAL(10, 2),
  status TEXT NOT NULL CHECK (status IN ('NORMAL', 'WATCH', 'WARNING', 'DANGER', 'CRITICAL')),
  forecast TEXT NOT NULL CHECK (forecast IN ('rising', 'falling', 'stable')) DEFAULT 'stable',
  notes TEXT,
  bulletin_week INTEGER,
  bulletin_year INTEGER,
  recorded_at TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(station_id, bulletin_week, bulletin_year, recorded_at)
);

-- Create bulletin_cache table
CREATE TABLE IF NOT EXISTS public.bulletin_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  pdf_url TEXT,
  raw_json JSONB NOT NULL,
  general_situation TEXT,
  dangerous_sections TEXT[] DEFAULT ARRAY[]::TEXT[],
  parsed_at TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(week_number, year)
);

-- Create alerts table
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES public.gauge_stations(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('WARNING', 'DANGER', 'CRITICAL')),
  level_cm INTEGER NOT NULL,
  message_ru TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  resolved_at TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.gauge_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gauge_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletin_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies to allow public read access
CREATE POLICY "gauge_stations_select_public" ON public.gauge_stations 
  FOR SELECT USING (true);

CREATE POLICY "gauge_readings_select_public" ON public.gauge_readings 
  FOR SELECT USING (true);

CREATE POLICY "bulletin_cache_select_public" ON public.bulletin_cache 
  FOR SELECT USING (true);

CREATE POLICY "alerts_select_public" ON public.alerts 
  FOR SELECT USING (is_active = true);

-- Create buildings table
CREATE TABLE IF NOT EXISTS public.buildings (
  id TEXT PRIMARY KEY,
  osm_id BIGINT,
  name_ru TEXT,
  address TEXT,
  district TEXT,
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  footprint JSONB,
  floors INTEGER DEFAULT 2,
  building_type TEXT,
  height_m DECIMAL(8, 2),
  foundation_elevation_m DECIMAL(8, 2),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Enable RLS for buildings
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for public read access
CREATE POLICY "buildings_select_public" ON public.buildings 
  FOR SELECT USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_gauge_readings_station_id ON public.gauge_readings(station_id);
CREATE INDEX IF NOT EXISTS idx_gauge_readings_recorded_at ON public.gauge_readings(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulletin_cache_week_year ON public.bulletin_cache(week_number, year);
CREATE INDEX IF NOT EXISTS idx_alerts_station_id ON public.alerts(station_id);
CREATE INDEX IF NOT EXISTS idx_alerts_is_active ON public.alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_buildings_location ON public.buildings USING GIST (
  ST_SetSRID(ST_MakePoint(lng, lat), 4326)
);
CREATE INDEX IF NOT EXISTS idx_buildings_district ON public.buildings(district);
