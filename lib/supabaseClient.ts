import { createClient } from "@supabase/supabase-js"

export type Event = {
  id: string
  date: string
  title: string
  description: string | null
  created_at: string
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

export const supabase = createClient(url, key)
