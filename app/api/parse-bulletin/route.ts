import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// Schema for parsed bulletin data
const BulletinDataSchema = z.object({
  general_situation: z.string().describe('General flood situation description in Russian'),
  dangerous_sections: z.array(z.string()).describe('List of dangerous river sections'),
  stations: z.array(
    z.object({
      name: z.string().describe('Station name in Russian'),
      river: z.string().describe('River name'),
      level_cm: z.number().describe('Water level in centimeters'),
      change_cm: z.number().describe('Change from previous day in cm'),
      status: z.enum(['NORMAL', 'WATCH', 'WARNING', 'DANGER', 'CRITICAL']),
      forecast: z.enum(['rising', 'falling', 'stable']),
    })
  ),
  bulletin_date: z.string().describe('Bulletin date in YYYY-MM-DD format'),
  week_number: z.number().describe('Week number of the year'),
})

// Validate if the API response contains valid float values
function validateStationData(stations: z.infer<typeof BulletinDataSchema>['stations']): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  for (const station of stations) {
    if (!Number.isFinite(station.level_cm)) {
      errors.push(`Invalid level_cm for ${station.name}: ${station.level_cm}`)
    }
    if (!Number.isFinite(station.change_cm)) {
      errors.push(`Invalid change_cm for ${station.name}: ${station.change_cm}`)
    }
    if (station.level_cm < 0 || station.level_cm > 2000) {
      errors.push(`Suspicious level_cm for ${station.name}: ${station.level_cm}cm`)
    }
  }

  return { valid: errors.length === 0, errors }
}

// Check if API is active and responding
async function checkAPIHealth(): Promise<{ active: boolean; error?: string }> {
  try {
    const result = await generateText({
      model: 'anthropic/claude-opus-4',
      prompt: 'Reply with just "OK" to confirm you are operational.',
      maxOutputTokens: 10,
    })
    return { active: result.text.toLowerCase().includes('ok') }
  } catch (error) {
    return { active: false, error: (error as Error).message }
  }
}

export async function POST(req: Request) {
  try {
    const { pdfUrl, pdfBase64 } = await req.json()

    if (!pdfUrl && !pdfBase64) {
      return Response.json(
        { error: 'Either pdfUrl or pdfBase64 is required' },
        { status: 400 }
      )
    }

    // Check API health first
    const health = await checkAPIHealth()
    if (!health.active) {
      return Response.json(
        { error: 'Claude API is not responding', details: health.error },
        { status: 503 }
      )
    }

    // Prepare the PDF content for Claude
    let pdfContent: { type: 'file'; data: string; mimeType: 'application/pdf' } | { type: 'url'; url: string }

    if (pdfBase64) {
      pdfContent = {
        type: 'file',
        data: pdfBase64,
        mimeType: 'application/pdf',
      }
    } else {
      // Fetch PDF and convert to base64
      const pdfResponse = await fetch(pdfUrl)
      if (!pdfResponse.ok) {
        return Response.json(
          { error: 'Failed to fetch PDF', details: pdfResponse.statusText },
          { status: 400 }
        )
      }
      const pdfBuffer = await pdfResponse.arrayBuffer()
      const base64 = Buffer.from(pdfBuffer).toString('base64')
      pdfContent = {
        type: 'file',
        data: base64,
        mimeType: 'application/pdf',
      }
    }

    // Parse the PDF using Claude with vision capabilities
    const result = await generateText({
      model: 'anthropic/claude-opus-4',
      messages: [
        {
          role: 'user',
          content: [
            pdfContent,
            {
              type: 'text',
              text: `This is a Kazhydromet flood bulletin (гидрологический бюллетень) for Aktobe Oblast, Kazakhstan.

Please extract the following information from this PDF:

1. General flood situation description (общая обстановка)
2. List of dangerous river sections (опасные участки)
3. For each monitoring station, extract:
   - Station name (название поста)
   - River name (река)
   - Current water level in cm (уровень воды)
   - Change from previous measurement in cm (изменение)
   - Status based on levels: NORMAL, WATCH, WARNING, DANGER, or CRITICAL
   - Forecast: rising (рост), falling (спад), or stable (стабильно)
4. Bulletin date
5. Week number

Important: 
- All text should remain in Russian
- Water levels should be in centimeters (cm)
- If a value is unclear, use the most reasonable estimate
- Look for tables with station data

Return the data as structured JSON matching the schema.`,
            },
          ],
        },
      ],
      output: Output.object({ schema: BulletinDataSchema }),
      maxOutputTokens: 4000,
    })

    const parsedData = result.output

    if (!parsedData) {
      return Response.json(
        { error: 'Failed to parse bulletin', details: 'No output from model' },
        { status: 500 }
      )
    }

    // Validate the extracted data
    const validation = validateStationData(parsedData.stations)
    if (!validation.valid) {
      console.warn('[v0] Validation warnings:', validation.errors)
    }

    // Store in Supabase bulletin_cache
    const supabase = await createClient()
    const currentYear = new Date().getFullYear()

    const { error: cacheError } = await supabase.from('bulletin_cache').upsert({
      week_number: parsedData.week_number,
      year: currentYear,
      pdf_url: pdfUrl || null,
      raw_json: parsedData,
      general_situation: parsedData.general_situation,
      dangerous_sections: parsedData.dangerous_sections,
      parsed_at: new Date().toISOString(),
    }, {
      onConflict: 'week_number,year',
    })

    if (cacheError) {
      console.error('[v0] Failed to cache bulletin:', cacheError)
    }

    // Update gauge_readings if we matched stations
    for (const stationData of parsedData.stations) {
      // Try to match with existing stations
      const { data: matchedStations } = await supabase
        .from('gauge_stations')
        .select('id')
        .ilike('name_ru', `%${stationData.name}%`)
        .limit(1)

      if (matchedStations && matchedStations.length > 0) {
        const { error: readingError } = await supabase.from('gauge_readings').insert({
          station_id: matchedStations[0].id,
          level_cm: stationData.level_cm,
          change_cm: stationData.change_cm,
          status: stationData.status,
          forecast: stationData.forecast,
          bulletin_week: parsedData.week_number,
          bulletin_year: currentYear,
          recorded_at: parsedData.bulletin_date,
        })

        if (readingError) {
          console.error(`[v0] Failed to insert reading for ${stationData.name}:`, readingError)
        }
      }
    }

    return Response.json({
      success: true,
      data: parsedData,
      validation: validation,
      usage: result.usage,
    })
  } catch (error) {
    console.error('[v0] Parse bulletin error:', error)
    return Response.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    )
  }
}

// GET endpoint to check API health
export async function GET() {
  const health = await checkAPIHealth()
  return Response.json({
    status: health.active ? 'healthy' : 'unhealthy',
    error: health.error,
    timestamp: new Date().toISOString(),
  })
}
