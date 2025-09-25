import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    | 'case_created' | 'case_updated' | 'case_completed' | 'case_cancelled'
    | 'session_scheduled' | 'session_postponed' | 'session_completed' | 'session_cancelled'
    | 'note_added'
  description: string
  details: any
  created_at: string
  created_by: string | null
}

export async function fetchMonthSessions(from: string, to: string) {
  return await supabase
    .from('v_calendar_sessions')
    .select('*')
    .gte('session_date', from)
    .lte('session_date', to)
    .order('session_date', { ascending: true })
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
  const casePayload: Partial<Case> = {
    title: input.title,
    court_name: input.court_name,
    lawyers: input.lawyers && input.lawyers.length ? input.lawyers : null,
    reviewer: input.reviewer,
    description: input.description,
    long_description: input.long_description,
    status: 'active'
  }

  const { data: casesIns, error: caseErr } = await supabase
    .from('cases')
    .insert([casePayload])
    .select('*')
  if (caseErr) throw caseErr
  const caseRow = casesIns![0] as Case

  const { error: sesErr } = await supabase
    .from('case_sessions')
    .insert([{ case_id: caseRow.id, session_date: input.session_date, status: 'scheduled' }])
  if (sesErr) throw sesErr

  return { caseRow }
}

export async function postponeSession(sessionId: string, newDate: string, reason?: string | null) {
  // اقرأ الجلسة للحصول على case_id
  const { data: s, error: e0 } = await supabase
    .from('case_sessions')
    .select('case_id, session_date, status')
    .eq('id', sessionId)
    .single();
  if (e0) throw e0;

  // علِّم الجلسة الحالية كمؤجَّلة
  const { error: e1 } = await supabase
    .from('case_sessions')
    .update({
      status: 'postponed',
      postponed_to: newDate,
      postpone_reason: reason ?? null,
    })
    .eq('id', sessionId);
  if (e1) throw e1;

  // أضف جلسة "scheduled" في التاريخ الجديد مع منع التكرار
  // ملاحظة: استخدم upsert مع onConflict + ignoreDuplicates = true
  const { error: e2 } = await supabase
    .from('case_sessions')
    .upsert(
      [{ case_id: s.case_id, session_date: newDate, status: 'scheduled' }],
      { onConflict: 'case_id,session_date', ignoreDuplicates: true }
    );
  if (e2) throw e2;

  return true; // نجاح صريح
}


export async function completeSession(session_id: string) {
  const { error } = await supabase
    .from('case_sessions')
    .update({ status: 'completed' })
    .eq('id', session_id)
  return { error }
}

/**
 * إصلاح خطأ 400 عند PATCH:
 * - لا نستخدم .single() لتجنّب إرسال Accept: application/vnd.pgrst.object+json
 * - نرجع الصف الأول من المصفوفة
 */
export async function updateCase(id: string, patch: Partial<Case>) {
  const payload: any = {
    title: patch.title ?? undefined,
    court_name: patch.court_name ?? null,
    lawyers: (patch.lawyers && patch.lawyers.length) ? patch.lawyers : null,
    reviewer: patch.reviewer ?? null,
    description: patch.description ?? null,
    long_description: patch.long_description ?? null
  }

  const { data, error } = await supabase
    .from('cases')
    .update(payload)
    .eq('id', id)
    .select('*')

  return { data: data?.[0] as Case | undefined, error }
}

export async function addNoteToLog(case_id: string, session_id: string, text: string) {
  const { data, error } = await supabase
    .from('activity_logs')
    .insert([{
      case_id,
      session_id,
      action_type: 'note_added',
      description: text,
      details: null
    }])
    .select('*')

  return { data: data?.[0] as ActivityLog | undefined, error }
}
