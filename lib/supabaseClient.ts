import { createClient } from "@supabase/supabase-js"

export type Event = {
  id: string
  date: string
  title: string
  description: string | null
  long_description: string | null
  court_name: string | null
  lawyers: string[] | null
  status: "open" | "postponed" | "closed"
  postponed_to: string | null
  case_ref: string
  created_at: string
}

export type EventLog = {
  id: string
  case_ref: string
  message: string
  created_at: string
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

export const supabase = createClient(url, key)
