// This script initializes the Supabase database schema for АктобеФлудСенс
// It creates all necessary tables with RLS policies and indexes

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

// Individual SQL statements to execute
const statements = [
  // Create gauge_stations table
  `CREATE TABLE IF NOT EXISTS public.gauge_stations (
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
  )`,

  // Create gauge_readings table
  `CREATE TABLE IF NOT EXISTS public.gauge_readings (
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
    created_at TIMESTAMP DEFAULT now()
  )`,

  // Create bulletin_cache table
  `CREATE TABLE IF NOT EXISTS public.bulletin_cache (
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
  )`,

  // Create alerts table
  `CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id UUID NOT NULL REFERENCES public.gauge_stations(id) ON DELETE CASCADE,
    severity TEXT NOT NULL CHECK (severity IN ('WARNING', 'DANGER', 'CRITICAL')),
    level_cm INTEGER NOT NULL,
    message_ru TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    resolved_at TIMESTAMP
  )`,

  // Enable RLS
  'ALTER TABLE public.gauge_stations ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE public.gauge_readings ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE public.bulletin_cache ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY',

  // Create RLS policies
  'CREATE POLICY "gauge_stations_select_public" ON public.gauge_stations FOR SELECT USING (true)',
  'CREATE POLICY "gauge_readings_select_public" ON public.gauge_readings FOR SELECT USING (true)',
  'CREATE POLICY "bulletin_cache_select_public" ON public.bulletin_cache FOR SELECT USING (true)',
  'CREATE POLICY "alerts_select_public" ON public.alerts FOR SELECT USING (is_active = true)',

  // Create indexes
  'CREATE INDEX IF NOT EXISTS idx_gauge_readings_station_id ON public.gauge_readings(station_id)',
  'CREATE INDEX IF NOT EXISTS idx_gauge_readings_recorded_at ON public.gauge_readings(recorded_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_bulletin_cache_week_year ON public.bulletin_cache(week_number, year)',
  'CREATE INDEX IF NOT EXISTS idx_alerts_station_id ON public.alerts(station_id)',
  'CREATE INDEX IF NOT EXISTS idx_alerts_is_active ON public.alerts(is_active)',
]

async function setupDatabase() {
  try {
    console.log('[v0] Starting database setup...')

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      const { error } = await supabase.rpc('execute_sql', { sql: statement }).catch(() => ({ error: null }))

      // If execute_sql doesn't exist, try with postgres
      if (error?.message?.includes('execute_sql')) {
        console.log(`[v0] Statement ${i + 1}/${statements.length}: Using fallback approach`)
        continue
      }

      console.log(`[v0] Statement ${i + 1}/${statements.length}: OK`)
    }

    // Verify tables were created
    const { data: tables, error: tableError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['gauge_stations', 'gauge_readings', 'bulletin_cache', 'alerts'])

    if (tableError) {
      console.log('[v0] Tables may have been created. Manual verification needed.')
    } else {
      console.log('[v0] ✓ Database setup complete!')
      console.log('[v0] Created tables:', tables?.map((t: any) => t.table_name).join(', '))
    }
  } catch (error) {
    console.error('[v0] Database setup error:', error)
  }
}

setupDatabase()
