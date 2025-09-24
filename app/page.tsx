'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns'
import { ar } from 'date-fns/locale'
import { supabase, Event, EventLog } from '@/lib/supabaseClient'
import { getAuthStatus, logout } from '@/lib/auth'
import LoginModal from '@/components/LoginModal'
import toast from 'react-hot-toast'

type SuggestFetcher = (q: string) => Promise<string[]>

function useDebouncedValue<T>(value: T, delay = 200) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

function uniq(arr: string[]) {
  const set = new Set<string>()
  const out: string[] = []
  for (const s of arr) {
    const k = s.trim()
    if (!k) continue
    if (!set.has(k)) {
      set.add(k)
      out.push(k)
    }
  }
  return out
}

function readMRU(key: string) {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const arr = JSON.parse(raw) as string[]
    return Array.isArray(arr) ? uniq(arr) : []
  } catch {
    return []
  }
}

function pushMRU(key: string, value: string, max = 15) {
  if (typeof window === 'undefined') return
  const list = readMRU(key)
  const next = uniq([value, ...list]).slice(0, max)
  localStorage.setItem(key, JSON.stringify(next))
}

function mergeSuggestions(primary: string[], mru: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of primary) {
    const k = s.trim()
    if (k && !seen.has(k)) {
      seen.add(k)
      out.push(k)
    }
  }
  for (const s of mru) {
    const k = s.trim()
    if (k && !seen.has(k)) {
      seen.add(k)
      out.push(k)
    }
  }
  return out
}

function MobileAutocompleteInput(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  fetcher: SuggestFetcher
  mruKey: string
  onSelect?: (v: string) => void
  icon?: string
}) {
  const { value, onChange, placeholder, fetcher, mruKey, onSelect, icon } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const debounced = useDebouncedValue(query, 200)
  const [items, setItems] = useState<string[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const mru = useMemo(() => readMRU(mruKey), [mruKey])

  useEffect(() => setQuery(value), [value])

  useEffect(() => {
    let ignore = false
    const run = async () => {
      const q = debounced.trim()
      const base = await fetcher(q)
      const merged = mergeSuggestions(base, mru).slice(0, 8)
      if (!ignore) setItems(merged)
    }
    run()
    return () => {
      ignore = true
    }
  }, [debounced, fetcher, mru])

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!boxRef.current) return
      if (!boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={boxRef} className="mobile-autocomplete">
      <input
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="mobile-field"
      />
      {open && items.length > 0 && (
        <div className="mobile-autocomplete-dropdown">
          {items.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s)
                setQuery(s)
                setOpen(false)
                pushMRU(mruKey, s)
                onSelect && onSelect(s)
              }}
              className="mobile-autocomplete-item"
            >
              {icon && <span style={{ marginLeft: '8px' }}>{icon}</span>}
              {s}
            </button>
          ))}
          {mru.length > 0 && (
            <div style={{ 
              padding: '4px 12px', 
              fontSize: '0.6875rem', 
              color: '#94a3b8', 
              borderTop: '1px solid rgba(71, 85, 105, 0.3)',
              textAlign: 'center'
            }}>
              الاقتراحات من الاستخدام السابق والقاعدة
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MobileTokenInput(props: {
  tokens: string[]
  onTokensChange: (t: string[]) => void
  placeholder?: string
  fetcher: SuggestFetcher
  mruKey: string
}) {
  const { tokens, onTokensChange, placeholder, fetcher, mruKey } = props
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const debounced = useDebouncedValue(input, 200)
  const [items, setItems] = useState<string[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const mru = useMemo(() => readMRU(mruKey), [mruKey])

  useEffect(() => {
    let ignore = false
    const run = async () => {
      const base = await fetcher(debounced.trim())
      const merged = mergeSuggestions(base, mru).filter(s => !tokens.includes(s)).slice(0, 8)
      if (!ignore) setItems(merged)
    }
    run()
    return () => {
      ignore = true
    }
  }, [debounced, fetcher, mru, tokens])

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!boxRef.current) return
      if (!boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const addToken = (t: string) => {
    const trimmed = t.trim()
    if (!trimmed) return
    const next = uniq([...tokens, trimmed])
    onTokensChange(next)
    pushMRU(mruKey, trimmed)
    setInput('')
    setOpen(false)
  }

  const tryCommit = () => {
    const t = input.trim()
    if (!t) return
    addToken(t)
  }

  return (
    <div ref={boxRef} className="mobile-autocomplete">
      <div className="mobile-token-input">
        {tokens.map((t, i) => (
          <div key={`${t}-${i}`} className="mobile-token">
            {t}
            <button
              type="button"
              onClick={() => onTokensChange(tokens.filter(x => x !== t))}
              className="mobile-token-remove"
              aria-label={`إزالة ${t}`}
            >
              ×
            </button>
          </div>
        ))}
        <input
          value={input}
          onChange={e => {
            setInput(e.target.value)
            setOpen(true)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              tryCommit()
            }
            if (e.key === 'Backspace' && input === '' && tokens.length > 0) {
              onTokensChange(tokens.slice(0, -1))
            }
          }}
          placeholder={tokens.length === 0 ? placeholder : 'إضافة محامي آخر...'}
          className="mobile-token-input-field"
        />
      </div>
      {open && items.length > 0 && (
        <div className="mobile-autocomplete-dropdown">
          {items.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => addToken(s)}
              className="mobile-autocomplete-item"
            >
              <span style={{ marginLeft: '8px' }}>👤</span>
              {s}
            </button>
          ))}
        </div>
      )}
      {tokens.length > 0 && (
        <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#94a3b8' }}>
          تم إضافة {tokens.length} محامي • اضغط Enter أو فاصلة لإضافة المزيد
        </div>
      )}
    </div>
  )
}

export default function MobileCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [events, setEvents] = useState<Event[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showDayModal, setShowDayModal] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [logs, setLogs] = useState<Record<string, EventLog[]>>({})
  const [loading, setLoading] = useState(false)
  const [authStatus, setAuthStatus] = useState(getAuthStatus())
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [postponeDate, setPostponeDate] = useState('')
  const [postponingEvent, setPostponingEvent] = useState<Event | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [addingEvent, setAddingEvent] = useState(false)

  const [newEvent, setNewEvent] = useState({
    title: '',
    court_name: '',
    lawyers: [] as string[],
    reviewer: '',
    description: '',
    long_description: ''
  })
  const [editData, setEditData] = useState({
    title: '',
    court_name: '',
    lawyers: [] as string[],
    reviewer: '',
    description: '',
    long_description: ''
  })

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 6 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 6 })
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  useEffect(() => {
    fetchEvents()
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')
  }, [currentMonth])

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('date', format(monthStart, 'yyyy-MM-dd'))
        .lte('date', format(monthEnd, 'yyyy-MM-dd'))
        .neq('status', 'deleted')
        .order('date', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      setEvents(data || [])
    } catch {
      toast.error('فشل تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date: string | Date) => format(new Date(date), 'dd/MM/yyyy')
  const formatDateISO = (date: Date) => format(date, 'yyyy-MM-dd')
  const formatDateTime = (date: string) => format(new Date(date), 'dd/MM/yyyy HH:mm')
  const isCurrentMonth = (date: Date) => date.getMonth() === currentMonth.getMonth()
  const dayEvents = (d: Date) => events.filter(e => isSameDay(new Date(e.date), d))

  const openDay = (d: Date) => {
    setSelectedDate(d)
    setShowDayModal(true)
    setNewEvent({ title: '', court_name: '', lawyers: [], reviewer: '', description: '', long_description: '' })
  }

  const fetchLogs = async (caseRef: string) => {
    if (logs[caseRef]) return
    const { data, error } = await supabase.from('event_logs').select('*').eq('case_ref', caseRef).order('created_at', { ascending: true })
    if (!error && data) setLogs(prev => ({ ...prev, [caseRef]: data }))
  }

  const openEventDetails = async (event: Event) => {
    setSelectedEvent(event)
    setEditMode(false)
    setEditData({
      title: event.title,
      court_name: event.court_name || '',
      lawyers: (event.lawyers || []) as string[],
      reviewer: event.reviewer || '',
      description: event.description || '',
      long_description: event.long_description || ''
    })
    await fetchLogs(event.case_ref)
  }

  const handleCreateEvent = async () => {
    if (!authStatus.isLoggedIn || !newEvent.title || !selectedDate) return
    setAddingEvent(true)
    try {
      const { data, error } = await supabase
        .from('events')
        .insert([
          {
            date: formatDateISO(selectedDate),
            title: newEvent.title,
            court_name: newEvent.court_name || null,
            lawyers: newEvent.lawyers.length ? newEvent.lawyers : null,
            reviewer: newEvent.reviewer || null,
            description: newEvent.description || null,
            long_description: newEvent.long_description || null,
            status: 'open'
          }
        ])
        .select()
      if (error) throw error
      setEvents(prev => [...prev, ...(data || [])])
      
      // Save to MRU lists for future suggestions
      if (newEvent.court_name.trim()) pushMRU('mru:courts', newEvent.court_name.trim())
      if (newEvent.reviewer.trim()) pushMRU('mru:reviewers', newEvent.reviewer.trim())
      newEvent.lawyers.forEach(lawyer => {
        if (lawyer.trim()) pushMRU('mru:lawyers', lawyer.trim())
      })
      
      setNewEvent({ title: '', court_name: '', lawyers: [], reviewer: '', description: '', long_description: '' })
      toast.success('تمت إضافة القضية بنجاح')
    } catch {
      toast.error('فشلت الإضافة')
    } finally {
      setAddingEvent(false)
    }
  }

  const handleUpdateEvent = async () => {
    if (!selectedEvent || !authStatus.isLoggedIn) return
    try {
      const { data, error } = await supabase
        .from('events')
        .update({
          title: editData.title,
          court_name: editData.court_name || null,
          lawyers: editData.lawyers.length ? editData.lawyers : null,
          reviewer: editData.reviewer || null,
          description: editData.description || null,
          long_description: editData.long_description || null
        })
        .eq('id', selectedEvent.id)
        .select()
      if (error) throw error
      const updated = data?.[0]
      if (updated) {
        setEvents(prev => prev.map(e => (e.id === selectedEvent.id ? updated : e)))
        setSelectedEvent(updated)
        
        // Save to MRU lists for future suggestions
        if (editData.court_name.trim()) pushMRU('mru:courts', editData.court_name.trim())
        if (editData.reviewer.trim()) pushMRU('mru:reviewers', editData.reviewer.trim())
        editData.lawyers.forEach(lawyer => {
          if (lawyer.trim()) pushMRU('mru:lawyers', lawyer.trim())
        })
      }
      setEditMode(false)
      toast.success('تم التحديث')
    } catch {
      toast.error('فشل التحديث')
    }
  }

  const handlePostpone = async () => {
    if (!postponingEvent || !postponeDate || !authStatus.isLoggedIn) return
    try {
      const { error: updateError } = await supabase.from('events').update({ status: 'postponed', postponed_to: postponeDate }).eq('id', postponingEvent.id)
      if (updateError) throw updateError
      const { error } = await supabase
        .from('events')
        .insert([
          {
            date: postponeDate,
            title: postponingEvent.title,
            court_name: postponingEvent.court_name,
            lawyers: postponingEvent.lawyers,
            reviewer: postponingEvent.reviewer,
            description: postponingEvent.description,
            long_description: postponingEvent.long_description,
            status: 'open',
            case_ref: postponingEvent.case_ref
          }
        ])
      if (error) throw error
      await fetchEvents()
      setPostponingEvent(null)
      setPostponeDate('')
      toast.success('تم التأجيل')
    } catch {
      toast.error('فشل التأجيل')
    }
  }

  const handleStatusChange = async (event: Event, newStatus: 'open' | 'closed') => {
    if (!authStatus.isLoggedIn) return
    try {
      const { data, error } = await supabase.from('events').update({ status: newStatus }).eq('id', event.id).select()
      if (error) throw error
      const updated = data?.[0]
      if (updated) {
        setEvents(prev => prev.map(e => (e.id === event.id ? updated : e)))
        if (selectedEvent?.id === event.id) setSelectedEvent(updated)
      }
      toast.success(newStatus === 'closed' ? 'تم إغلاق القضية' : 'تم إعادة فتح القضية')
    } catch {
      toast.error('فشل التحديث')
    }
  }

  const handleDelete = async (event: Event) => {
    if (!authStatus.isLoggedIn || !confirm('هل تريد حذف هذه القضية؟')) return
    try {
      const { error } = await supabase.from('events').update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('id', event.id)
      if (error) throw error
      setEvents(prev => prev.filter(e => e.id !== event.id))
      if (selectedEvent?.id === event.id) setSelectedEvent(null)
      toast.success('تم الحذف')
    } catch {
      toast.error('فشل الحذف')
    }
  }

  const handleAddNote = async () => {
    if (!selectedEvent || !noteText.trim() || !authStatus.isLoggedIn) return
    try {
      const { data, error } = await supabase
        .from('event_logs')
        .insert([{ case_ref: selectedEvent.case_ref, kind: 'note', message: noteText.trim(), actor: 'admin' }])
        .select()
      if (error) throw error
      const added = data?.[0]
      if (added) setLogs(prev => ({ ...prev, [selectedEvent.case_ref]: [...(prev[selectedEvent.case_ref] || []), added] }))
      setNoteText('')
      toast.success('تمت إضافة الملاحظة')
    } catch {
      toast.error('فشل إضافة الملاحظة')
    }
  }

  const getLawyerSuggestions: SuggestFetcher = async q => {
    // Get from database
    const { data } = await supabase.from('events').select('lawyers').not('lawyers', 'is', null).order('created_at', { ascending: false }).limit(1000)
    const vals: string[] = []
    ;(data || []).forEach(r => {
      const arr = (r as any).lawyers as string[] | null
      if (Array.isArray(arr)) arr.forEach(x => vals.push(x))
    })
    
    // Filter by query if provided
    const filtered = q ? vals.filter(v => v.toLowerCase().includes(q.toLowerCase())) : vals
    
    // Get frequency count
    const freq = new Map<string, number>()
    filtered.forEach(v => freq.set(v, (freq.get(v) || 0) + 1))
    
    // Sort by frequency (most used first)
    const dbResults = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    
    // Get MRU (Most Recently Used) from localStorage
    const mru = readMRU('mru:lawyers')
    
    // Merge and deduplicate: MRU first, then database results
    return mergeSuggestions(dbResults, mru)
  }

  const getCourtSuggestions: SuggestFetcher = async q => {
    // Get from database
    const ilike = q ? `%${q}%` : '%'
    const { data } = await supabase
      .from('events')
      .select('court_name')
      .not('court_name', 'is', null)
      .ilike('court_name', ilike)
      .order('created_at', { ascending: false })
      .limit(1000)
    const vals = (data || []).map(r => String((r as any).court_name))
    
    // Get frequency count
    const freq = new Map<string, number>()
    vals.forEach(v => freq.set(v, (freq.get(v) || 0) + 1))
    
    // Sort by frequency (most used first)
    const dbResults = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    
    // Get MRU from localStorage
    const mru = readMRU('mru:courts')
    
    // Merge: MRU first, then database results
    return mergeSuggestions(dbResults, mru)
  }

  const getReviewerSuggestions: SuggestFetcher = async q => {
    // Get from database
    const ilike = q ? `%${q}%` : '%'
    const { data } = await supabase
      .from('events')
      .select('reviewer')
      .not('reviewer', 'is', null)
      .ilike('reviewer', ilike)
      .order('created_at', { ascending: false })
      .limit(1000)
    const vals = (data || []).map(r => String((r as any).reviewer))
    
    // Get frequency count
    const freq = new Map<string, number>()
    vals.forEach(v => freq.set(v, (freq.get(v) || 0) + 1))
    
    // Sort by frequency (most used first)
    const dbResults = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    
    // Get MRU from localStorage
    const mru = readMRU('mru:reviewers')
    
    // Merge: MRU first, then database results
    return mergeSuggestions(dbResults, mru)
  }

  const handleLogout = () => {
    logout()
    setAuthStatus(getAuthStatus())
    toast.success('تم تسجيل الخروج')
  }

  return (
    <div className="mobile-app mobile-safe-top mobile-safe-bottom">
      <header className="mobile-header mobile-safe-left mobile-safe-right">
        <div className="mobile-header-title">شركة الشرع للمحاماة</div>
        <div className="header-actions">
          {authStatus.isLoggedIn ? (
            <>
              <span className="mobile-status-badge mobile-status-success">مدير النظام</span>
              <button onClick={handleLogout} className="mobile-btn mobile-btn-danger mobile-btn-sm">خروج</button>
            </>
          ) : (
            <button onClick={() => setShowLoginModal(true)} className="mobile-btn mobile-btn-primary mobile-btn-sm">مدخل البيانات</button>
          )}
        </div>
      </header>

      <main className="mobile-main mobile-safe-left mobile-safe-right mobile-scroll-smooth">
        <div className="mobile-calendar">
          <div className="mobile-calendar-nav">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="mobile-calendar-nav-btn">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <h2 className="mobile-calendar-title">{format(currentMonth, 'MMMM yyyy', { locale: ar })}</h2>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="mobile-calendar-nav-btn">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="mobile-loader" />
            </div>
          ) : (
            <div className="mobile-calendar-content">
              <div className="mobile-calendar-grid-container">
                <div className="mobile-calendar-grid">
                  <div className="mobile-calendar-header">
                    {['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'].map(day => (
                      <div key={day} className="mobile-calendar-day-header">{day}</div>
                    ))}
                  </div>
                  {calendarDays.map(day => {
                    const items = dayEvents(day)
                    const inMonth = isCurrentMonth(day)
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => openDay(day)}
                        className={`mobile-calendar-day ${!inMonth ? 'other-month' : ''} ${isToday(day) ? 'today' : ''} ${items.length > 0 ? 'has-events' : ''}`}
                      >
                        <div className="mobile-calendar-day-number">{format(day, 'd')}</div>
                        {items.length > 0 && (
                          <div className="mobile-calendar-day-events">
                            {items.length}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Day Modal */}
      {showDayModal && selectedDate && (
        <div className="mobile-modal-backdrop" onClick={() => { setShowDayModal(false); setSelectedDate(null) }}>
          <div className="mobile-modal" onClick={e => e.stopPropagation()}>
            <div className="mobile-modal-header">
              <h3 className="mobile-modal-title">قضايا يوم {formatDate(selectedDate)}</h3>
              <button onClick={() => { setShowDayModal(false); setSelectedDate(null) }} className="mobile-modal-close">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mobile-modal-body">
              <div className="space-y-6">
                {/* Cases List */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-200 mb-4">القضايا المسجلة ({dayEvents(selectedDate).length})</h4>
                  <div className="space-y-3">
                    {dayEvents(selectedDate).length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-lg">لا توجد قضايا في هذا اليوم</p>
                      </div>
                    )}
                    {dayEvents(selectedDate).map(ev => (
                      <div key={ev.id} className="p-4 bg-dark-700/60 rounded-xl border border-dark-600/50 backdrop-blur-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`mobile-status-badge ${ev.status === 'closed' ? 'mobile-status-neutral' : ev.status === 'postponed' ? 'mobile-status-warning' : 'mobile-status-success'}`}>
                                {ev.status === 'closed' ? 'مغلقة' : ev.status === 'postponed' ? 'مؤجلة' : 'مفتوحة'}
                              </span>
                            </div>
                            <h5 className="font-semibold text-blue-400 mb-2 text-lg">{ev.title}</h5>
                            {ev.court_name && <p className="text-sm text-gray-400 mb-1">المحكمة: {ev.court_name}</p>}
                            {ev.reviewer && <p className="text-sm text-gray-400 mb-1">المراجع: {ev.reviewer}</p>}
                            {ev.lawyers && ev.lawyers.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {ev.lawyers.map((l, i) => (
                                  <span key={i} className="px-2 py-1 bg-dark-800/60 rounded-full text-xs border border-dark-600/50">{l}</span>
                                ))}
                              </div>
                            )}
                            {ev.description && <p className="text-sm text-gray-300 mt-2">{ev.description}</p>}
                            {ev.status === 'postponed' && ev.postponed_to && <p className="text-sm text-yellow-400 mt-2">مؤجلة إلى {formatDate(ev.postponed_to)}</p>}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3 pt-3 border-t border-dark-600/30">
                          <button onClick={() => openEventDetails(ev)} className="mobile-btn mobile-btn-secondary mobile-btn-sm flex-1">تفاصيل</button>
                          {authStatus.isLoggedIn && ev.status !== 'closed' && (
                            <button onClick={() => setPostponingEvent(ev)} className="mobile-btn mobile-btn-secondary mobile-btn-sm">تأجيل</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add New Case */}
                {authStatus.isLoggedIn && (
                  <div className="border-t border-dark-600/50 pt-6">
                    <h4 className="text-lg font-semibold text-gray-200 mb-4">إضافة قضية جديدة</h4>
                    <div className="space-y-4">
                      <div className="mobile-field-group">
                        <label className="mobile-field-label">عنوان القضية *</label>
                        <input 
                          value={newEvent.title} 
                          onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} 
                          placeholder="أدخل عنوان القضية" 
                          className="mobile-field" 
                        />
                      </div>
                      <div className="mobile-field-group">
                        <label className="mobile-field-label">اسم المحكمة</label>
                        <MobileAutocompleteInput
                          value={newEvent.court_name}
                          onChange={v => setNewEvent({ ...newEvent, court_name: v })}
                          placeholder="اختر أو اكتب اسم المحكمة"
                          fetcher={getCourtSuggestions}
                          mruKey="mru:courts"
                          icon="🏛️"
                        />
                      </div>
                      <div className="mobile-field-group">
                        <label className="mobile-field-label">المحامون</label>
                        <MobileTokenInput
                          tokens={newEvent.lawyers}
                          onTokensChange={t => setNewEvent({ ...newEvent, lawyers: t })}
                          placeholder="اختر أو اكتب أسماء المحامين"
                          fetcher={getLawyerSuggestions}
                          mruKey="mru:lawyers"
                        />
                      </div>
                      <div className="mobile-field-group">
                        <label className="mobile-field-label">اسم المراجع</label>
                        <MobileAutocompleteInput
                          value={newEvent.reviewer}
                          onChange={v => setNewEvent({ ...newEvent, reviewer: v })}
                          placeholder="اختر أو اكتب اسم المراجع"
                          fetcher={getReviewerSuggestions}
                          mruKey="mru:reviewers"
                          icon="👨‍💼"
                        />
                      </div>
                      <div className="mobile-field-group">
                        <label className="mobile-field-label">وصف مختصر</label>
                        <textarea 
                          value={newEvent.description} 
                          onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} 
                          placeholder="وصف مختصر للقضية" 
                          rows={3} 
                          className="mobile-field" 
                        />
                      </div>
                      <div className="mobile-field-group">
                        <label className="mobile-field-label">تفاصيل إضافية</label>
                        <textarea 
                          value={newEvent.long_description} 
                          onChange={e => setNewEvent({ ...newEvent, long_description: e.target.value })} 
                          placeholder="تفاصيل إضافية أو ملاحظات" 
                          rows={4} 
                          className="mobile-field" 
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {authStatus.isLoggedIn && (
              <div className="mobile-modal-footer">
                <button 
                  onClick={handleCreateEvent} 
                  disabled={!newEvent.title || addingEvent} 
                  className="mobile-btn mobile-btn-primary mobile-btn-lg w-full disabled:opacity-50"
                >
                  {addingEvent ? 'جاري الإضافة...' : 'إضافة القضية'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="mobile-modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="mobile-modal" onClick={e => e.stopPropagation()}>
            <div className="mobile-modal-header">
              <h3 className="mobile-modal-title">تفاصيل القضية</h3>
              <button onClick={() => setSelectedEvent(null)} className="mobile-modal-close">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mobile-modal-body">
              <div className="space-y-6">
                {editMode && authStatus.isLoggedIn ? (
                  <>
                    <div className="mobile-field-group">
                      <label className="mobile-field-label">عنوان القضية</label>
                      <input 
                        value={editData.title} 
                        onChange={e => setEditData({ ...editData, title: e.target.value })} 
                        className="mobile-field" 
                      />
                    </div>
                    <div className="mobile-field-group">
                      <label className="mobile-field-label">المحكمة</label>
                      <MobileAutocompleteInput
                        value={editData.court_name}
                        onChange={v => setEditData({ ...editData, court_name: v })}
                        placeholder="اسم المحكمة"
                        fetcher={getCourtSuggestions}
                        mruKey="mru:courts"
                        icon="🏛️"
                      />
                    </div>
                    <div className="mobile-field-group">
                      <label className="mobile-field-label">المحامون</label>
                      <MobileTokenInput
                        tokens={editData.lawyers}
                        onTokensChange={t => setEditData({ ...editData, lawyers: t })}
                        placeholder="أسماء المحامين"
                        fetcher={getLawyerSuggestions}
                        mruKey="mru:lawyers"
                      />
                    </div>
                    <div className="mobile-field-group">
                      <label className="mobile-field-label">المراجع</label>
                      <MobileAutocompleteInput
                        value={editData.reviewer}
                        onChange={v => setEditData({ ...editData, reviewer: v })}
                        placeholder="اسم المراجع"
                        fetcher={getReviewerSuggestions}
                        mruKey="mru:reviewers"
                        icon="👨‍💼"
                      />
                    </div>
                    <div className="mobile-field-group">
                      <label className="mobile-field-label">الوصف</label>
                      <textarea 
                        value={editData.description} 
                        onChange={e => setEditData({ ...editData, description: e.target.value })} 
                        rows={2} 
                        className="mobile-field" 
                      />
                    </div>
                    <div className="mobile-field-group">
                      <label className="mobile-field-label">التفاصيل</label>
                      <textarea 
                        value={editData.long_description} 
                        onChange={e => setEditData({ ...editData, long_description: e.target.value })} 
                        rows={3} 
                        className="mobile-field" 
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-blue-400 mb-3">{selectedEvent.title}</h4>
                        <div className="inline-flex items-center gap-2 mb-4">
                          <span className={`mobile-status-badge ${selectedEvent.status === 'closed' ? 'mobile-status-neutral' : selectedEvent.status === 'postponed' ? 'mobile-status-warning' : 'mobile-status-success'}`}>
                            {selectedEvent.status === 'closed' ? 'مغلقة' : selectedEvent.status === 'postponed' ? 'مؤجلة' : 'مفتوحة'}
                          </span>
                          {selectedEvent.status === 'postponed' && selectedEvent.postponed_to && (
                            <span className="text-sm text-yellow-400">إلى {formatDate(selectedEvent.postponed_to)}</span>
                          )}
                        </div>
                      </div>
                      {authStatus.isLoggedIn && (
                        <button onClick={() => setEditMode(true)} className="mobile-btn-icon mobile-btn-secondary">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 min-w-[80px]">التاريخ:</span>
                        <span>{formatDate(selectedEvent.date)}</span>
                      </div>
                      {!!selectedEvent.court_name && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 min-w-[80px]">المحكمة:</span>
                          <span>{selectedEvent.court_name}</span>
                        </div>
                      )}
                      {!!selectedEvent.reviewer && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 min-w-[80px]">المراجع:</span>
                          <span>{selectedEvent.reviewer}</span>
                        </div>
                      )}
                      {selectedEvent.lawyers && selectedEvent.lawyers.length > 0 && (
                        <div>
                          <span className="text-gray-500">المحامون:</span>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {selectedEvent.lawyers.map((l, i) => (
                              <span key={i} className="px-2 py-1 bg-dark-700/60 rounded-full text-xs border border-dark-600/50">{l}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {!!selectedEvent.description && (
                        <div>
                          <span className="text-gray-500">الوصف:</span>
                          <p className="mt-1 text-gray-300">{selectedEvent.description}</p>
                        </div>
                      )}
                      {!!selectedEvent.long_description && (
                        <div>
                          <span className="text-gray-500">التفاصيل:</span>
                          <p className="mt-1 text-gray-300">{selectedEvent.long_description}</p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Timeline */}
                <div className="border-t border-dark-600/50 pt-6">
                  <h5 className="font-semibold text-gray-300 mb-4">السجل الزمني</h5>
                  <div className="space-y-3 max-h-48 overflow-y-auto mobile-scroll-smooth">
                    {(logs[selectedEvent.case_ref] || []).map(log => (
                      <div key={log.id} className="p-3 bg-dark-700/50 rounded-lg border border-dark-600/30">
                        <div className="flex items-center gap-2 text-xs mb-2">
                          <span className="text-gray-500">{formatDateTime(log.created_at)}</span>
                          <span className={`mobile-status-badge mobile-status-${log.kind === 'create' ? 'success' : log.kind === 'update' ? 'info' : log.kind === 'postpone' ? 'warning' : log.kind === 'close' ? 'neutral' : log.kind === 'reopen' ? 'success' : log.kind === 'delete' ? 'danger' : 'info'}`}>
                            {log.kind === 'create' ? 'إنشاء' : log.kind === 'update' ? 'تحديث' : log.kind === 'postpone' ? 'تأجيل' : log.kind === 'close' ? 'إغلاق' : log.kind === 'reopen' ? 'إعادة فتح' : log.kind === 'delete' ? 'حذف' : 'ملاحظة'}
                          </span>
                        </div>
                        {log.message && <p className="text-sm text-gray-300">{log.message}</p>}
                      </div>
                    ))}
                    {(!logs[selectedEvent.case_ref] || logs[selectedEvent.case_ref].length === 0) && (
                      <div className="text-center py-4 text-gray-500 text-sm">لا يوجد سجل زمني</div>
                    )}
                  </div>
                  {authStatus.isLoggedIn && (
                    <div className="flex gap-2 mt-4">
                      <input 
                        value={noteText} 
                        onChange={e => setNoteText(e.target.value)} 
                        placeholder="أضف ملاحظة..." 
                        className="mobile-field flex-1" 
                        onKeyDown={e => e.key === 'Enter' && handleAddNote()} 
                      />
                      <button 
                        onClick={handleAddNote} 
                        disabled={!noteText.trim()} 
                        className="mobile-btn mobile-btn-primary disabled:opacity-50"
                      >
                        إضافة
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mobile-modal-footer">
              {editMode && authStatus.isLoggedIn ? (
                <div className="flex gap-2">
                  <button onClick={handleUpdateEvent} className="mobile-btn mobile-btn-primary flex-1">حفظ التعديلات</button>
                  <button onClick={() => setEditMode(false)} className="mobile-btn mobile-btn-secondary">إلغاء</button>
                </div>
              ) : authStatus.isLoggedIn && (
                <div className="flex flex-wrap gap-2">
                  {selectedEvent.status !== 'closed' && (
                    <>
                      <button onClick={() => setPostponingEvent(selectedEvent)} className="mobile-btn mobile-btn-secondary flex-1">تأجيل</button>
                      <button onClick={() => handleStatusChange(selectedEvent, 'closed')} className="mobile-btn mobile-btn-secondary flex-1">إغلاق</button>
                    </>
                  )}
                  {selectedEvent.status === 'closed' && (
                    <button onClick={() => handleStatusChange(selectedEvent, 'open')} className="mobile-btn mobile-btn-secondary flex-1">إعادة فتح</button>
                  )}
                  <button onClick={() => handleDelete(selectedEvent)} className="mobile-btn mobile-btn-danger">حذف</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Postpone Modal */}
      {postponingEvent && (
        <div className="mobile-modal-backdrop" onClick={() => setPostponingEvent(null)}>
          <div className="mobile-modal" onClick={e => e.stopPropagation()}>
            <div className="mobile-modal-header">
              <h3 className="mobile-modal-title">تأجيل القضية</h3>
              <button onClick={() => setPostponingEvent(null)} className="mobile-modal-close">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mobile-modal-body">
              <div className="space-y-4">
                <p className="text-gray-300">تأجيل: <strong className="text-blue-400">{postponingEvent.title}</strong></p>
                <p className="text-sm text-gray-500">من تاريخ: {formatDate(postponingEvent.date)}</p>
                <div className="mobile-field-group">
                  <label className="mobile-field-label">التاريخ الجديد</label>
                  <input 
                    type="date" 
                    value={postponeDate} 
                    onChange={e => setPostponeDate(e.target.value)} 
                    min={format(new Date(), 'yyyy-MM-dd')} 
                    className="mobile-field" 
                  />
                </div>
              </div>
            </div>
            <div className="mobile-modal-footer">
              <div className="flex gap-3">
                <button 
                  onClick={handlePostpone} 
                  disabled={!postponeDate} 
                  className="mobile-btn mobile-btn-primary flex-1 disabled:opacity-50"
                >
                  تأكيد التأجيل
                </button>
                <button 
                  onClick={() => { setPostponingEvent(null); setPostponeDate('') }} 
                  className="mobile-btn mobile-btn-secondary"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
        onLogin={() => setAuthStatus(getAuthStatus())} 
      />
    </div>
  )
}