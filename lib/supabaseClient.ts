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
  reviewer: string | null
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
  changes: Record<string, { old: any; new: any }> | null
  from_date: string | null
  to_date: string | null
  actor: string | null
  created_at: string
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// إنشاء عميل Supabase مع إعدادات محسنة
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  global: {
    headers: {
      'apikey': supabaseAnonKey,
      'Content-Type': 'application/json'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 2
    }
  }
})

// دالة مساعدة لمعالجة أخطاء Supabase
export const handleSupabaseError = (error: any) => {
  console.error('Supabase Error:', error)
  
  // معالجة أخطاء شائعة
  if (error?.code === 'PGRST116') {
    return 'لا توجد بيانات متاحة'
  }
  
  if (error?.code === '42P01') {
    return 'خطأ في هيكل قاعدة البيانات'
  }
  
  if (error?.code === '23505') {
    return 'البيانات موجودة مسبقاً'
  }
  
  if (error?.message?.includes('jsonb_diff')) {
    return 'خطأ في تحديث البيانات، يرجى المحاولة مرة أخرى'
  }
  
  if (error?.message?.includes('RLS')) {
    return 'خطأ في صلاحيات الوصول'
  }
  
  // عرض رسالة الخطأ الأصلية إذا لم تكن معروفة
  return error?.message || 'حدث خطأ غير معروف'
}

// دالة مساعدة للتحديث الآمن
// حل بديل للتحديث بدون RLS issues
export const safeUpdate = async (table: string, data: any, filter: any) => {
  try {
    // إزالة القيم غير المعرفة
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined)
    )
    
    // استخدام rpc بدلاً من update للتجاوز حول مشاكل jsonb_diff
    const { data: result, error } = await supabase.rpc('safe_update_event', {
      table_name: table,
      update_data: cleanData,
      filter_data: filter
    })
    
    if (error) {
      // إذا فشل RPC، عد للطريقة القديمة
      const { data: fallbackResult, error: fallbackError } = await supabase
        .from(table)
        .update(cleanData)
        .match(filter)
        .select()
      
      if (fallbackError) {
        throw new Error(handleSupabaseError(fallbackError))
      }
      
      return { data: fallbackResult, error: null }
    }
    
    return { data: result, error: null }
  } catch (error: any) {
    return { data: null, error: error?.message || 'خطأ غير معروف' }
  }
}

// دالة مساعدة للإدراج الآمن
export const safeInsert = async (table: string, data: any) => {
  try {
    // إزالة القيم غير المعرفة
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined)
    )
    
    const { data: result, error } = await supabase
      .from(table)
      .insert(cleanData)
      .select()
    
    if (error) {
      throw new Error(handleSupabaseError(error))
    }
    
    return { data: result, error: null }
  } catch (error: any) {
    return { data: null, error: error?.message || 'خطأ غير معروف' }
  }
}

// دالة اختبار الاتصال
export const testConnection = async () => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('id')
      .limit(1)
    
    if (error) {
      console.error('Connection test failed:', error)
      return false
    }
    
    console.log('Supabase connection successful')
    return true
  } catch (error) {
    console.error('Connection test error:', error)
    return false
  }
}