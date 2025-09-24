// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
    | 'case_created' | 'case_updated' | 'case_completed' | 'case_cancelled'
    | 'session_scheduled' | 'session_postponed' | 'session_completed' | 'session_cancelled'
    | 'note_added'
  description: string
  details: any
  created_at: string
  created_by: string | null
}

// عمليات مريحة
export async function fetchMonthSessions(isoStart: string, isoEnd: string) {
  return supabase
    .from('v_calendar_sessions')
    .select('*')
    .gte('session_date', isoStart)
    .lte('session_date', isoEnd)
    .order('session_date', { ascending: true })
}

export async function createCaseAndSession(input: {
  title: string
  court_name?: string | null
  lawyers?: string[] | null
  reviewer?: string | null
  description?: string | null
  long_description?: string | null
  session_date: string
}) {
  const { data: caseRow, error: caseErr } = await supabase
    .from('cases')
    .insert([{
      title: input.title,
      court_name: input.court_name ?? null,
      lawyers: input.lawyers ?? null,
      reviewer: input.reviewer ?? null,
      description: input.description ?? null,
      long_description: input.long_description ?? null,
      status: 'active'
    }])
    .select()
    .single()
  if (caseErr) throw caseErr

  const { data: sessionRow, error: sessErr } = await supabase
    .from('case_sessions')
    .insert([{
      case_id: caseRow.id,
      session_date: input.session_date,
      status: 'scheduled'
    }])
    .select()
    .single()
  if (sessErr) throw sessErr

  return { caseRow, sessionRow }
}

export async function postponeSession(session: CaseSession, toDateISO: string, reason?: string) {
  const { data, error } = await supabase
    .from('case_sessions')
    .update({ status: 'postponed', postponed_to: toDateISO, postpone_reason: reason ?? null })
    .eq('id', session.id)
    .select()
    .single()
  return { data, error }
}

export async function completeSession(sessionId: string) {
  return supabase
    .from('case_sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId)
    .select()
    .single()
}

export async function updateCase(caseId: string, patch: Partial<Case>) {
  return supabase
    .from('cases')
    .update(patch)
    .eq('id', caseId)
    .select()
    .single()
}

export async function addNoteToLog(caseId: string, sessionId: string | null, msg: string) {
  return supabase
    .from('activity_logs')
    .insert([{ case_id: caseId, session_id: sessionId, action_type: 'note_added', description: msg }])
    .select()
    .single()
}
