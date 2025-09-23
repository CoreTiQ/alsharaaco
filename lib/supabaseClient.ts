import { createClient } from "@supabase/supabase-js"

export type Event = {
  id: string
  date: string
  title: string
  description: string | null
  long_description: string | null
  court_name: string | null
  lawyers: string[] | null
  status: "open" | "postponed" | "closed" | "deleted"
  postponed_to: string | null
  case_ref: string
  created_at: string
  deleted_at: string | null
}

export type EventLog = {
  id: string
  case_ref: string
  kind: "create"|"update"|"postpone"|"note"|"close"|"reopen"|"delete"
  message: string
  changes: any
  from_date: string | null
  to_date: string | null
  actor: string | null
  created_at: string
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

export const supabase = createClient(url, key)
