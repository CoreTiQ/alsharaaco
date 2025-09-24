import { createClient, PostgrestError } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})

export type Case = {
  id: string
  title: string
  court_name: string | null
  lawyers: string[] | null
  reviewer: string | null
  description: string | null
  long_description: string | null
  status: 'active' | 'completed' | 'cancelled'
  created_at: string
  created_by: string | null
}

export type CaseSession = {
  id: string
  case_id: string
  session_date: string
  status: 'scheduled' | 'completed' | 'postponed' | 'cancelled'
  postponed_to: string | null
  postpone_reason: string | null
  notes: string | null
  created_at: string
}

export type ActivityLog = {
  id: string
  case_id: string | null
  session_id: string | null
  action_type:
    | 'case_created'
    | 'case_updated'
    | 'case_completed'
    | 'case_cancelled'
    | 'session_scheduled'
    | 'session_postponed'
    | 'session_completed'
    | 'session_cancelled'
    | 'note_added'
  description: string
  details: any | null
  created_at: string
  created_by: string | null
}

export type CalendarRow = {
  session_id: string
  session_date: string
  session_status: 'scheduled' | 'completed' | 'postponed' | 'cancelled'
  postponed_to: string | null
  case_id: string
  title: string
  court_name: string | null
  lawyers: string[] | null
  reviewer: string | null
  case_status: 'active' | 'completed' | 'cancelled'
}

export async function fetchMonthSessions(
  fromISO: string,
  toISO: string
): Promise<{ data: CalendarRow[] | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('v_calendar_sessions')
    .select('*')
    .gte('session_date', fromISO)
    .lte('session_date', toISO)
    .order('session_date', { ascending: true })

  return { data: (data as CalendarRow[]) || null, error }
}

export async function createCaseAndSession(input: {
  title: string
  court_name: string | null
  lawyers: string[] | null
  reviewer: string | null
  description: string | null
  long_description: string | null
  session_date: string
}): Promise<{
  caseRow: Case
  sessionRow: CaseSession
}> {
  const { data: caseInserted, error: caseErr } = await supabase
    .from('cases')
    .insert([
      {
        title: input.title,
        court_name: input.court_name,
        lawyers: input.lawyers,
        reviewer: input.reviewer,
        description: input.description,
        long_description: input.long_description,
        status: 'active'
      }
    ])
    .select()
    .single()

  if (caseErr || !caseInserted) {
    throw caseErr || new Error('failed to insert case')
  }

  const { data: sessionInserted, error: sessErr } = await supabase
    .from('case_sessions')
    .insert([
      {
        case_id: caseInserted.id,
        session_date: input.session_date,
        status: 'scheduled'
      }
    ])
    .select()
    .single()

  if (sessErr || !sessionInserted) {
    throw sessErr || new Error('failed to insert session')
  }

  return { caseRow: caseInserted as Case, sessionRow: sessionInserted as CaseSession }
}

export async function updateCase(
  id: string,
  patch: Partial<Case>
): Promise<{ data: Case | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('cases')
    .update({
      title: patch.title,
      court_name: patch.court_name ?? null,
      lawyers: patch.lawyers ?? null,
      reviewer: patch.reviewer ?? null,
      description: patch.description ?? null,
      long_description: patch.long_description ?? null,
      status: patch.status
    })
    .eq('id', id)
    .select()
    .single()

  return { data: (data as Case) || null, error }
}

export async function postponeSession(
  session: CaseSession,
  newDateISO: string,
  reason: string | null = null
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from('case_sessions')
    .update({
      status: 'postponed',
      postponed_to: newDateISO,
      postpone_reason: reason ?? session.postpone_reason ?? null
    })
    .eq('id', session.id)

  return { error }
}

export async function completeSession(sessionId: string): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from('case_sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId)

  return { error }
}

export async function addNoteToLog(
  case_id: string,
  session_id: string | null,
  message: string
): Promise<{ data: ActivityLog | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('activity_logs')
    .insert([
      {
        case_id,
        session_id,
        action_type: 'note_added',
        description: message,
        details: null
      }
    ])
    .select()
    .single()

  return { data: (data as ActivityLog) || null, error }
}
