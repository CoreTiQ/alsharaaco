import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  { auth: { persistSession: false } }
)

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
  details: any
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

export async function fetchMonthSessions(fromISO: string, toISO: string) {
  return await supabase
    .from('v_calendar_sessions')
    .select('*')
    .gte('session_date', fromISO)
    .lte('session_date', toISO)
    .order('session_date', { ascending: true })
    .order('title', { ascending: true })
}

export async function createCaseAndSession(input: {
  title: string
  court_name: string | null
  lawyers: string[] | null
  reviewer: string | null
  description: string | null
  long_description: string | null
  session_date: string
}) {
  const { data: caseRow, error: e1 } = await supabase
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
  if (e1) throw e1

  const { data: sessionRow, error: e2 } = await supabase
    .from('case_sessions')
    .insert([
      {
        case_id: caseRow.id,
        session_date: input.session_date,
        status: 'scheduled'
      }
    ])
    .select()
    .single()
  if (e2) throw e2

  return { caseRow: caseRow as Case, sessionRow: sessionRow as CaseSession }
}

export async function updateCase(caseId: string, patch: Partial<Case>) {
  const { data, error } = await supabase
    .from('cases')
    .update(patch)
    .eq('id', caseId)
    .select()
    .single()
  return { data: data as Case | null, error }
}

export async function postponeSession(session: CaseSession, toDate: string, reason?: string | null) {
  return await supabase
    .from('case_sessions')
    .update({ status: 'postponed', postponed_to: toDate, postpone_reason: reason || null })
    .eq('id', session.id)
}

export async function completeSession(session_id: string) {
  return await supabase
    .from('case_sessions')
    .update({ status: 'completed' })
    .eq('id', session_id)
}

export async function addNoteToLog(case_id: string, session_id: string | null, note: string) {
  const { data, error } = await supabase
    .from('activity_logs')
    .insert([{ case_id, session_id, action_type: 'note_added', description: note, details: null }])
    .select()
    .single()
  return { data: data as ActivityLog | null, error }
}
