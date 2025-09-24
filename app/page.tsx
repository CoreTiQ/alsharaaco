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

function AutocompleteInput(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  fetcher: SuggestFetcher
  mruKey: string
  onSelect?: (v: string) => void
}) {
  const { value, onChange, placeholder, fetcher, mruKey, onSelect } = props
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
      const merged = mergeSuggestions(base, mru).slice(0, 12)
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
    <div ref={boxRef} className="relative">
      <input
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full p-3 rounded-lg border bg-dark-800 border-dark-600 text-gray-100 placeholder-gray-500"
      />
      {open && items.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-dark-600 bg-dark-800 shadow-xl">
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
              className="w-full text-right px-3 py-2 hover:bg-dark-700 text-sm truncate"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TokenInput(props: {
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
      const merged = mergeSuggestions(base, mru).filter(s => !tokens.includes(s)).slice(0, 12)
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
    const next = uniq([...tokens, t])
    onTokensChange(next)
    pushMRU(mruKey, t)
    setInput('')
    setOpen(false)
  }

  const tryCommit = () => {
    const t = input.trim()
    if (!t) return
    addToken(t)
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex flex-wrap gap-2 p-2 rounded-lg border bg-dark-800 border-dark-600">
        {tokens.map((t, i) => (
          <span key={`${t}-${i}`} className="px-2 py-1 rounded-full text-xs bg-dark-700">
            {t}
            <button
              type="button"
              onClick={() => onTokensChange(tokens.filter(x => x !== t))}
              className="ml-1 text-gray-400 hover:text-gray-200"
            >
              ×
            </button>
          </span>
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
          placeholder={placeholder}
          className="flex-1 min-w-[120px] bg-transparent outline-none placeholder-gray-500"
        />
      </div>
      {open && items.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-dark-600 bg-dark-800 shadow-xl">
          {items.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => addToken(s)}
              className="w-full text-right px-3 py-2 hover:bg-dark-700 text-sm truncate"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Calendar() {
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
      if (newEvent.court_name) pushMRU('mru:courts', newEvent.court_name)
      if (newEvent.reviewer) pushMRU('mru:reviewers', newEvent.reviewer)
      newEvent.lawyers.forEach(l => pushMRU('mru:lawyers', l))
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
        if (editData.court_name) pushMRU('mru:courts', editData.court_name)
        if (editData.reviewer) pushMRU('mru:reviewers', editData.reviewer)
        editData.lawyers.forEach(l => pushMRU('mru:lawyers', l))
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

  const getCourtSuggestions: SuggestFetcher = async q => {
    const ilike = q ? `%${q}%` : '%'
    const { data } = await supabase
      .from('events')
      .select('court_name')
      .not('court_name', 'is', null)
      .ilike('court_name', ilike)
      .order('created_at', { ascending: false })
      .limit(1000)
    const vals = (data || []).map(r => String((r as any).court_name))
    const freq = new Map<string, number>()
    vals.forEach(v => freq.set(v, (freq.get(v) || 0) + 1))
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  }

  const getReviewerSuggestions: SuggestFetcher = async q => {
    const ilike = q ? `%${q}%` : '%'
    const { data } = await supabase
      .from('events')
      .select('reviewer')
      .not('reviewer', 'is', null)
      .ilike('reviewer', ilike)
      .order('created_at', { ascending: false })
      .limit(1000)
    const vals = (data || []).map(r => String((r as any).reviewer))
    const freq = new Map<string, number>()
    vals.forEach(v => freq.set(v, (freq.get(v) || 0) + 1))
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  }

  const getLawyerSuggestions: SuggestFetcher = async q => {
    const { data } = await supabase.from('events').select('lawyers').not('lawyers', 'is', null).order('created_at', { ascending: false }).limit(1000)
    const vals: string[] = []
    ;(data || []).forEach(r => {
      const arr = (r as any).lawyers as string[] | null
      if (Array.isArray(arr)) arr.forEach(x => vals.push(x))
    })
    const filtered = q ? vals.filter(v => v.toLowerCase().includes(q.toLowerCase())) : vals
    const freq = new Map<string, number>()
    filtered.forEach(v => freq.set(v, (freq.get(v) || 0) + 1))
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  }

  const handleLogout = () => {
    logout()
    setAuthStatus(getAuthStatus())
    toast.success('تم تسجيل الخروج')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-950 to-dark-900">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <header className="mb-4 sm:mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">رزنامة المكتب القانوني</h1>
            <div className="flex items-center gap-2 sm:gap-3">
              {authStatus.isLoggedIn ? (
                <>
                  <span className="status-badge bg-green-900/30 text-green-400 border border-green-600">مدير النظام</span>
                  <button onClick={handleLogout} className="btn-danger">خروج</button>
                </>
              ) : (
                <button onClick={() => setShowLoginModal(true)} className="btn-primary">دخول المدير</button>
              )}
            </div>
          </div>
        </header>

        <div className="bg-dark-800/50 backdrop-blur rounded-2xl shadow-xl border border-dark-700 overflow-hidden">
          <div className="bg-dark-900/50 px-3 sm:px-6 py-3 sm:py-4 border-b border-dark-700 flex items-center justify-between">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-dark-700 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
            <h2 className="text-lg sm:text-xl font-bold">{format(currentMonth, 'MMMM yyyy', { locale: ar })}</h2>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-dark-700 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20"><div className="loader" /></div>
          ) : (
            <div className="p-2 sm:p-4">
              <div className="grid grid-cols-7 gap-px bg-dark-700 rounded-lg overflow-hidden">
                {['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].map(day => (
                  <div key={day} className="bg-dark-800 px-1 sm:px-2 py-2 sm:py-3 text-center text-xs sm:text-sm font-medium text-gray-400">{day}</div>
                ))}
                {calendarDays.map(day => {
                  const items = dayEvents(day)
                  const inMonth = isCurrentMonth(day)
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => openDay(day)}
                      className={`bg-dark-800 p-2 sm:p-3 min-h-[88px] text-left transition-all hover:bg-dark-700 relative ${!inMonth ? 'opacity-40' : ''} ${isToday(day) ? 'ring-2 ring-blue-500 bg-blue-950/30' : ''}`}
                    >
                      <div className="text-sm font-medium mb-1">{format(day, 'd')}</div>
                      {items.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[11px] sm:text-xs px-1 py-0.5 rounded bg-blue-900/30 text-blue-300 inline-flex items-center gap-1">
                            {items.length} قضية
                          </div>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {showDayModal && selectedDate && (
        <div className="modal-backdrop" onClick={() => { setShowDayModal(false); setSelectedDate(null) }}>
          <div className="modal-content max-w-5xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 sm:p-6 border-b border-dark-700 flex items-center justify-between">
              <h3 className="text-lg sm:text-xl font-bold">قضايا يوم {formatDate(selectedDate)}</h3>
              <button onClick={() => { setShowDayModal(false); setSelectedDate(null) }} className="p-2 hover:bg-dark-700 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-dark-700">
              <div className="flex-1 p-4 sm:p-6 max-h-[65vh] overflow-y-auto">
                <h4 className="font-semibold mb-4 text-gray-300">القضايا المسجلة ({dayEvents(selectedDate).length})</h4>
                <div className="space-y-3">
                  {dayEvents(selectedDate).length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p>لا توجد قضايا في هذا اليوم</p>
                    </div>
                  )}
                  {dayEvents(selectedDate).map(ev => (
                    <div key={ev.id} className="p-3 sm:p-4 bg-dark-700/40 rounded-lg border border-dark-600 hover:bg-dark-700/60 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`status-badge ${ev.status === 'closed' ? 'bg-gray-900/30 text-gray-400 border-gray-600' : ev.status === 'postponed' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-600' : 'bg-green-900/30 text-green-400 border-green-600'}`}>
                              {ev.status === 'closed' ? 'مغلقة' : ev.status === 'postponed' ? 'مؤجلة' : 'مفتوحة'}
                            </span>
                            <h5 className="font-semibold text-blue-400 truncate">{ev.title}</h5>
                          </div>
                          {ev.court_name && <p className="text-sm text-gray-400 mb-1">المحكمة: {ev.court_name}</p>}
                          {ev.reviewer && <p className="text-sm text-gray-400 mb-1">المراجع: {ev.reviewer}</p>}
                          {ev.lawyers && ev.lawyers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {ev.lawyers.map((l, i) => (<span key={i} className="px-2 py-0.5 bg-dark-800 rounded-full text-xs">{l}</span>))}
                            </div>
                          )}
                          {ev.description && <p className="text-sm text-gray-300 line-clamp-2">{ev.description}</p>}
                          {ev.status === 'postponed' && ev.postponed_to && <p className="text-sm text-yellow-400 mt-2">مؤجلة إلى {formatDate(ev.postponed_to)}</p>}
                        </div>
                        <div className="flex flex-col gap-2">
                          <button onClick={() => openEventDetails(ev)} className="btn-secondary text-sm px-3 py-1">تفاصيل</button>
                          {authStatus.isLoggedIn && ev.status !== 'closed' && <button onClick={() => setPostponingEvent(ev)} className="btn-secondary text-sm px-3 py-1">تأجيل</button>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {authStatus.isLoggedIn && (
                <div className="flex-1 p-4 sm:p-6">
                  <h4 className="font-semibold mb-4 text-gray-300">إضافة قضية جديدة</h4>
                  <div className="space-y-3">
                    <input value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="عنوان القضية *" className="w-full p-3 rounded-lg border bg-dark-800 border-dark-600" />
                    <AutocompleteInput
                      value={newEvent.court_name}
                      onChange={v => setNewEvent({ ...newEvent, court_name: v })}
                      placeholder="اسم المحكمة"
                      fetcher={getCourtSuggestions}
                      mruKey="mru:courts"
                    />
                    <TokenInput
                      tokens={newEvent.lawyers}
                      onTokensChange={t => setNewEvent({ ...newEvent, lawyers: t })}
                      placeholder="أسماء المحامين"
                      fetcher={getLawyerSuggestions}
                      mruKey="mru:lawyers"
                    />
                    <AutocompleteInput
                      value={newEvent.reviewer}
                      onChange={v => setNewEvent({ ...newEvent, reviewer: v })}
                      placeholder="اسم المراجع"
                      fetcher={getReviewerSuggestions}
                      mruKey="mru:reviewers"
                    />
                    <textarea value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} placeholder="وصف مختصر للقضية" rows={3} className="w-full p-3 rounded-lg border bg-dark-800 border-dark-600" />
                    <textarea value={newEvent.long_description} onChange={e => setNewEvent({ ...newEvent, long_description: e.target.value })} placeholder="تفاصيل إضافية" rows={4} className="w-full p-3 rounded-lg border bg-dark-800 border-dark-600" />
                    <button onClick={handleCreateEvent} disabled={!newEvent.title || addingEvent} className="btn-primary w-full disabled:opacity-50">{addingEvent ? 'جاري الإضافة...' : 'إضافة القضية'}</button>
                    <p className="text-xs text-gray-500 text-center">يبقى النموذج مفتوحًا لإضافة قضايا أخرى في نفس اليوم</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-dark-700 flex items-center justify-between">
              <h3 className="text-xl font-bold">تفاصيل القضية</h3>
              <button onClick={() => setSelectedEvent(null)} className="p-2 hover:bg-dark-700 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto max-h-[72vh]">
              <div className="p-6 space-y-4 border-b border-dark-700">
                {editMode && authStatus.isLoggedIn ? (
                  <>
                    <input value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })} className="w-full p-3 rounded-lg border bg-dark-800 border-dark-600" />
                    <AutocompleteInput
                      value={editData.court_name}
                      onChange={v => setEditData({ ...editData, court_name: v })}
                      placeholder="المحكمة"
                      fetcher={getCourtSuggestions}
                      mruKey="mru:courts"
                    />
                    <TokenInput
                      tokens={editData.lawyers}
                      onTokensChange={t => setEditData({ ...editData, lawyers: t })}
                      placeholder="المحامون"
                      fetcher={getLawyerSuggestions}
                      mruKey="mru:lawyers"
                    />
                    <AutocompleteInput
                      value={editData.reviewer}
                      onChange={v => setEditData({ ...editData, reviewer: v })}
                      placeholder="المراجع"
                      fetcher={getReviewerSuggestions}
                      mruKey="mru:reviewers"
                    />
                    <textarea value={editData.description} onChange={e => setEditData({ ...editData, description: e.target.value })} rows={2} className="w-full p-3 rounded-lg border bg-dark-800 border-dark-600" />
                    <textarea value={editData.long_description} onChange={e => setEditData({ ...editData, long_description: e.target.value })} rows={3} className="w-full p-3 rounded-lg border bg-dark-800 border-dark-600" />
                    <div className="flex gap-2">
                      <button onClick={handleUpdateEvent} className="btn-primary">حفظ التعديلات</button>
                      <button onClick={() => setEditMode(false)} className="btn-secondary">إلغاء</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold text-blue-400 mb-2">{selectedEvent.title}</h4>
                        <div className="inline-flex items-center gap-2 mb-3">
                          <span className={`status-badge ${selectedEvent.status === 'closed' ? 'bg-gray-900/30 text-gray-400 border-gray-600' : selectedEvent.status === 'postponed' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-600' : 'bg-green-900/30 text-green-400 border-green-600'}`}>
                            {selectedEvent.status === 'closed' ? 'مغلقة' : selectedEvent.status === 'postponed' ? 'مؤجلة' : 'مفتوحة'}
                          </span>
                          {selectedEvent.status === 'postponed' && selectedEvent.postponed_to && <span className="text-sm text-yellow-400">إلى {formatDate(selectedEvent.postponed_to)}</span>}
                        </div>
                      </div>
                      {authStatus.isLoggedIn && <button onClick={() => setEditMode(true)} className="p-2 hover:bg-dark-700 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>}
                    </div>
                    <div className="space-y-2 text-sm">
                      <div><span className="text-gray-500">التاريخ:</span> {formatDate(selectedEvent.date)}</div>
                      {!!selectedEvent.court_name && <div><span className="text-gray-500">المحكمة:</span> {selectedEvent.court_name}</div>}
                      {!!selectedEvent.reviewer && <div><span className="text-gray-500">المراجع:</span> {selectedEvent.reviewer}</div>}
                      {selectedEvent.lawyers && selectedEvent.lawyers.length > 0 && (
                        <div>
                          <span className="text-gray-500">المحامون:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedEvent.lawyers.map((l, i) => (<span key={i} className="px-2 py-1 bg-dark-700 rounded-full text-xs">{l}</span>))}
                          </div>
                        </div>
                      )}
                      {!!selectedEvent.description && <div><span className="text-gray-500">الوصف:</span> {selectedEvent.description}</div>}
                      {!!selectedEvent.long_description && <div><span className="text-gray-500">التفاصيل:</span> {selectedEvent.long_description}</div>}
                    </div>
                    {authStatus.isLoggedIn && (
                      <div className="flex flex-wrap gap-2 pt-4">
                        {selectedEvent.status !== 'closed' && (
                          <>
                            <button onClick={() => setPostponingEvent(selectedEvent)} className="btn-secondary">تأجيل</button>
                            <button onClick={() => handleStatusChange(selectedEvent, 'closed')} className="btn-secondary">إغلاق</button>
                          </>
                        )}
                        {selectedEvent.status === 'closed' && <button onClick={() => handleStatusChange(selectedEvent, 'open')} className="btn-secondary">إعادة فتح</button>}
                        <button onClick={() => handleDelete(selectedEvent)} className="btn-danger">حذف</button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="p-6 space-y-4">
                <h5 className="font-semibold text-gray-300">السجل الزمني</h5>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {(logs[selectedEvent.case_ref] || []).map(log => (
                    <div key={log.id} className="p-3 bg-dark-700/50 rounded-lg border border-dark-600">
                      <div className="flex items-center gap-2 text-xs mb-1">
                        <span className="text-gray-500">{formatDateTime(log.created_at)}</span>
                        <span className={`px-2 py-0.5 rounded-full ${log.kind === 'create' ? 'bg-green-900/30 text-green-400' : log.kind === 'update' ? 'bg-blue-900/30 text-blue-400' : log.kind === 'postpone' ? 'bg-yellow-900/30 text-yellow-400' : log.kind === 'close' ? 'bg-gray-900/30 text-gray-400' : log.kind === 'reopen' ? 'bg-green-900/30 text-green-400' : log.kind === 'delete' ? 'bg-red-900/30 text-red-400' : 'bg-purple-900/30 text-purple-400'}`}>
                          {log.kind === 'create' ? 'إنشاء' : log.kind === 'update' ? 'تحديث' : log.kind === 'postpone' ? 'تأجيل' : log.kind === 'close' ? 'إغلاق' : log.kind === 'reopen' ? 'إعادة فتح' : log.kind === 'delete' ? 'حذف' : 'ملاحظة'}
                        </span>
                        {log.actor && <span className="text-gray-500">بواسطة: {log.actor}</span>}
                      </div>
                      {log.message && <p className="text-sm text-gray-300">{log.message}</p>}
                      {log.kind === 'postpone' && log.from_date && log.to_date && <p className="text-sm text-yellow-400 mt-1">من {formatDate(log.from_date)} إلى {formatDate(log.to_date)}</p>}
                      {log.changes && typeof log.changes === 'object' && Object.keys(log.changes || {}).length > 0 && (
                        <div className="mt-2 space-y-1">
                          {Object.entries(log.changes || {}).map(([field, values]: any) => (
                            <div key={field} className="text-xs flex items-center gap-2">
                              <span className="text-gray-500 min-w-[90px]">
                                {field === 'title' ? 'العنوان' : field === 'court_name' ? 'المحكمة' : field === 'reviewer' ? 'المراجع' : field === 'lawyers' ? 'المحامون' : field === 'description' ? 'الوصف' : field === 'long_description' ? 'التفاصيل' : field === 'status' ? 'الحالة' : field === 'date' ? 'التاريخ' : field === 'postponed_to' ? 'مؤجلة إلى' : field}:
                              </span>
                              {values?.old && <span className="line-through text-red-400/70">{String(values.old)}</span>}
                              {values?.old && values?.new && <span className="text-gray-500">←</span>}
                              {values?.new && <span className="text-green-400">{String(values.new)}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {(!logs[selectedEvent.case_ref] || logs[selectedEvent.case_ref].length === 0) && <div className="text-center py-4 text-gray-500 text-sm">لا يوجد سجل زمني</div>}
                </div>
                {authStatus.isLoggedIn && (
                  <div className="flex gap-2">
                    <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="أضف ملاحظة..." className="flex-1 p-2 rounded-lg border bg-dark-800 border-dark-600" onKeyDown={e => e.key === 'Enter' && handleAddNote()} />
                    <button onClick={handleAddNote} disabled={!noteText.trim()} className="btn-primary">إضافة</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {postponingEvent && (
        <div className="modal-backdrop" onClick={() => setPostponingEvent(null)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-dark-700">
              <h3 className="text-xl font-bold">تأجيل القضية</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-300">تأجيل: <strong className="text-blue-400">{postponingEvent.title}</strong></p>
              <p className="text-sm text-gray-500">من تاريخ: {formatDate(postponingEvent.date)}</p>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">التاريخ الجديد</label>
                <input type="date" value={postponeDate} onChange={e => setPostponeDate(e.target.value)} min={format(new Date(), 'yyyy-MM-dd')} className="w-full p-3 rounded-lg border bg-dark-800 border-dark-600" />
              </div>
            </div>
            <div className="p-6 border-t border-dark-700 flex gap-3">
              <button onClick={handlePostpone} disabled={!postponeDate} className="btn-primary flex-1">تأكيد التأجيل</button>
              <button onClick={() => { setPostponingEvent(null); setPostponeDate('') }} className="btn-secondary">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} onLogin={() => setAuthStatus(getAuthStatus())} />
    </div>
  )
}
