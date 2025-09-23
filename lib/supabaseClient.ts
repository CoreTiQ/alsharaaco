import { createClient } from '@supabase/supabase-js'

export interface Event {
  id: string
  case_ref: string
  date: string
  title: string
  description: string | null
  long_description: string | null
  court_name: string | null
  lawyers: string[] | null
  status: 'open' | 'postponed' | 'closed' | 'deleted'
  postponed_to: string | null
  created_at: string
  deleted_at: string | null
}

export interface EventLog {
  id: string
  case_ref: string
  kind: 'create' | 'update' | 'postpone' | 'note' | 'close' | 'reopen' | 'delete'
  message: string | null
  changes: Record<string, {old: any, new: any}> | null
  from_date: string | null
  to_date: string | null
  actor: string | null
  created_at: string
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
