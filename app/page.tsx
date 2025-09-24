'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns'
import { ar } from 'date-fns/locale'
import {
  supabase,
  Case,
  CaseSession,
  ActivityLog,
  fetchMonthSessions,
  createCaseAndSession,
  postponeSession,
  completeSession,
  updateCase as updateCaseApi,
  addNoteToLog
} from '@/lib/supabaseClient'
import { getAuthStatus, logout } from '@/lib/auth'
import LoginModal from '@/components/LoginModal'
import toast from 'react-hot-toast'

type SuggestFetcher = (q: string) => Promise<string[]>

type CalendarRow = {
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
    return () => { ignore = true }
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

export default function Page() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [rows, setRows] = useState<CalendarRow[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showDayModal, setShowDayModal] = useState(false)
  const [selectedRow, setSelectedRow] = useState<CalendarRow | null>(null)

  const [selectedCase, setSelectedCase] = useState<Case | null>(null)
  const [logs, setLogs] = useState<ActivityLog[]>([])

  const [loading, setLoading] = useState(false)
  const [authStatus, setAuthStatus] = useState(getAuthStatus())
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [postponeDate, setPostponeDate] = useState('')
  const [postponing, setPostponing] = useState<CalendarRow | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [adding, setAdding] = useState(false)

  const [newCase, setNewCase] = useState<{
    title: string
    court_name: string
    lawyers: string[]
    reviewer: string
    description: string
    long_description: string
  }>({
    title: '',
    court_name: '',
    lawyers: [],
    reviewer: '',
    description: '',
    long_description: ''
  })

  const [editCaseData, setEditCaseData] = useState<{
    title: string
    court_name: string
    lawyers: string[]
    reviewer: string
    description: string
    long_description: string
  }>({
    title: '',
    court_name: '',
    lawyers: [],
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
    loadMonth()
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')
  }, [currentMonth])

  const loadMonth = async () => {
    setLoading(true)
    try {
      const { data, error } = await fetchMonthSessions(
        format(monthStart, 'yyyy-MM-dd'),
        format(monthEnd, 'yyyy-MM-dd')
      )
      if (error) throw error
      setRows((data || []) as any)
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
  const dayRows = (d: Date) => rows.filter(r => isSameDay(new Date(r.session_date), d))

  const openDay = (d: Date) => {
    setSelectedDate(d)
    setShowDayModal(true)
    setNewCase({
      title: '',
      court_name: '',
      lawyers: [],
      reviewer: '',
      description: '',
      long_description: ''
    })
  }

  const openRowDetails = async (row: CalendarRow) => {
    setSelectedRow(row)
    setEditMode(false)
    const { data: c } = await supabase
      .from('cases')
      .select('*')
      .eq('id', row.case_id)
      .limit(1)
    const caseRow = (c && c[0]) as Case | undefined
    setSelectedCase(caseRow || null)
    setEditCaseData({
      title: caseRow?.title || row.title,
      court_name: caseRow?.court_name || row.court_name || '',
      lawyers: (caseRow?.lawyers || row.lawyers || []) as string[],
      reviewer: caseRow?.reviewer || row.reviewer || '',
      description: caseRow?.description || '',
      long_description: caseRow?.long_description || ''
    })
    const { data: lg } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('case_id', row.case_id)
      .order('created_at', { ascending: true })
    setLogs((lg || []) as ActivityLog[])
  }

  const handleCreate = async () => {
    if (!authStatus.isLoggedIn || !newCase.title || !selectedDate) return
    if (adding) return
    setAdding(true)
    try {
      const { caseRow } = await createCaseAndSession({
        title: newCase.title,
        court_name: newCase.court_name || null,
        lawyers: newCase.lawyers.length ? newCase.lawyers : null,
        reviewer: newCase.reviewer || null,
        description: newCase.description || null,
        long_description: newCase.long_description || null,
        session_date: formatDateISO(selectedDate)
      })
      if (caseRow?.court_name?.trim()) pushMRU('mru:courts', caseRow.court_name.trim())
      if (caseRow?.reviewer?.trim()) pushMRU('mru:reviewers', caseRow.reviewer.trim())
      ;(caseRow?.lawyers || []).forEach(l => l && pushMRU('mru:lawyers', l.trim()))
      setNewCase({ title: '', court_name: '', lawyers: [], reviewer: '', description: '', long_description: '' })
      await loadMonth()
      toast.success('تمت إضافة القضية والجلسة')
    } catch {
      toast.error('فشلت الإضافة')
    } finally {
      setAdding(false)
    }
  }

  const handleUpdateCase = async () => {
    if (!selectedRow || !authStatus.isLoggedIn) return
    try {
      const { data, error } = await updateCaseApi(selectedRow.case_id, {
        title: editCaseData.title,
        court_name: editCaseData.court_name || null,
        lawyers: editCaseData.lawyers.length ? editCaseData.lawyers : null,
        reviewer: editCaseData.reviewer || null,
        description: editCaseData.description || null,
        long_description: editCaseData.long_description || null
      } as Partial<Case>)
      if (error) throw error
      if (data) {
        setSelectedCase(data)
        setSelectedRow({
          ...selectedRow,
          title: data.title,
          court_name: data.court_name,
          lawyers: data.lawyers,
          reviewer: data.reviewer
        } as CalendarRow)
        await loadMonth()
        if (data.court_name?.trim()) pushMRU('mru:courts', data.court_name.trim())
        if (data.reviewer?.trim()) pushMRU('mru:reviewers', data.reviewer.trim())
        ;(data.lawyers || []).forEach(l => l && pushMRU('mru:lawyers', l.trim()))
      }
      setEditMode(false)
      toast.success('تم تحديث بيانات القضية')
    } catch {
      toast.error('فشل التحديث')
    }
  }

  const handlePostpone = async () => {
    if (!postponing || !postponeDate || !authStatus.isLoggedIn) return
    try {
      const { error } = await postponeSession(
        {
          id: postponing.session_id,
          case_id: postponing.case_id,
          session_date: postponing.session_date,
          status: postponing.session_status,
          postponed_to: postponing.postponed_to,
          postpone_reason: null,
          notes: null,
          created_at: '' as any
        } as CaseSession,
        postponeDate
      )
      if (error) throw error
      await loadMonth()
      setPostponing(null)
      setPostponeDate('')
      toast.success('تم التأجيل')
    } catch {
      toast.error('فشل التأجيل')
    }
  }

  const handleComplete = async (row: CalendarRow) => {
    if (!authStatus.isLoggedIn) return
    try {
      const { error } = await completeSession(row.session_id)
      if (error) throw error
      await loadMonth()
      toast.success('تم إنهاء الجلسة')
    } catch {
      toast.error('فشل التحديث')
    }
  }

  const handleAddNote = async () => {
    if (!selectedRow || !noteText.trim() || !authStatus.isLoggedIn) return
    try {
      const { data, error } = await addNoteToLog(selectedRow.case_id, selectedRow.session_id, noteText.trim())
      if (error) throw error
      if (data) setLogs(prev => [...prev, data])
      setNoteText('')
      toast.success('تمت إضافة الملاحظة')
    } catch {
      toast.error('فشل إضافة الملاحظة')
    }
  }

  const getLawyerSuggestions: SuggestFetcher = async q => {
    const { data } = await supabase
      .from('cases')
      .select('lawyers, created_at')
      .order('created_at', { ascending: false })
      .limit(1000)
    const vals: string[] = []
    ;(data || []).forEach(r => {
      const arr = (r as any).lawyers as string[] | null
      if (Array.isArray(arr)) arr.forEach(x => vals.push(x))
    })
    const filtered = q ? vals.filter(v => v.toLowerCase().includes(q.toLowerCase())) : vals
    const freq = new Map<string, number>()
    filtered.forEach(v => freq.set(v, (freq.get(v) || 0) + 1))
    const dbResults = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    const mru = readMRU('mru:lawyers')
    return mergeSuggestions(dbResults, mru)
  }

  const getCourtSuggestions: SuggestFetcher = async q => {
    const ilike = q ? `%${q}%` : '%'
    const { data } = await supabase
      .from('cases')
      .select('court_name, created_at')
      .not('court_name', 'is', null)
      .ilike('court_name', ilike)
      .order('created_at', { ascending: false })
      .limit(1000)
    const vals = (data || []).map(r => String((r as any).court_name))
    const freq = new Map<string, number>()
    vals.forEach(v => freq.set(v, (freq.get(v) || 0) + 1))
    const dbResults = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    const mru = readMRU('mru:courts')
    return mergeSuggestions(dbResults, mru)
  }

  const getReviewerSuggestions: SuggestFetcher = async q => {
    const ilike = q ? `%${q}%` : '%'
    const { data } = await supabase
      .from('cases')
      .select('reviewer, created_at')
      .not('reviewer', 'is', null)
      .ilike('reviewer', ilike)
      .order('created_at', { ascending: false })
      .limit(1000)
    const vals = (data || []).map(r => String((r as any).reviewer))
    const freq = new Map<string, number>()
    vals.forEach(v => freq.set(v, (freq.get(v) || 0) + 1))
    const dbResults = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    const mru = readMRU('mru:reviewers')
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
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
            </button>
            <h2 className="mobile-calendar-title">{format(currentMonth, 'MMMM yyyy', { locale: ar })}</h2>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="mobile-calendar-nav-btn">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20"><div className="mobile-loader" /></div>
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
                    const items = dayRows(day)
                    const inMonth = isCurrentMonth(day)
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => openDay(day)}
                        className={`mobile-calendar-day ${!inMonth ? 'other-month' : ''} ${isToday(day) ? 'today' : ''} ${items.length > 0 ? 'has-events' : ''}`}
                      >
                        <div className="mobile-calendar-day-number">{format(day, 'd')}</div>
                        {items.length > 0 && (
                          <div className="mobile-calendar-day-events">{items.length}</div>
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

      {showDayModal && selectedDate && (
        <div className="mobile-modal-backdrop" onClick={() => { setShowDayModal(false); setSelectedDate(null) }}>
          <div className="mobile-modal" onClick={e => e.stopPropagation()}>
            <div className="mobile-modal-header">
              <h3 className="mobile-modal-title">جلسات يوم {formatDate(selectedDate)}</h3>
              <button onClick={() => { setShowDayModal(false); setSelectedDate(null) }} className="mobile-modal-close">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mobile-modal-body">
              <div className="space-y-6">
                <div>
                  <h4 className="text-lg font-semibold text-gray-200 mb-4">الجلسات المسجلة ({dayRows(selectedDate).length})</h4>
                  <div className="space-y-3">
                    {dayRows(selectedDate).length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <p className="text-lg">لا توجد جلسات في هذا اليوم</p>
                      </div>
                    )}
                    {dayRows(selectedDate).map(r => (
                      <div key={r.session_id} className="p-4 bg-dark-700/60 rounded-xl border border-dark-600/50 backdrop-blur-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`mobile-status-badge ${
                                r.session_status === 'completed' ? 'mobile-status-neutral' :
                                r.session_status === 'postponed' ? 'mobile-status-warning' :
                                r.session_status === 'cancelled' ? 'mobile-status-danger' : 'mobile-status-success'
                              }`}>
                                {r.session_status === 'completed' ? 'مكتملة' : r.session_status === 'postponed' ? 'مؤجلة' : r.session_status === 'cancelled' ? 'ملغاة' : 'مجدولة'}
                              </span>
                            </div>
                            <h5 className="font-semibold text-blue-400 mb-2 text-lg">{r.title}</h5>
                            {r.court_name && <p className="text-sm text-gray-400 mb-1">المحكمة: {r.court_name}</p>}
                            {r.reviewer && <p className="text-sm text-gray-400 mb-1">المراجع: {r.reviewer}</p>}
                            {r.lawyers && r.lawyers.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {r.lawyers.map((l, i) => (
                                  <span key={i} className="px-2 py-1 bg-dark-800/60 rounded-full text-xs border border-dark-600/50">{l}</span>
                                ))}
                              </div>
                            )}
                            {r.session_status === 'postponed' && r.postponed_to && (
                              <p className="text-sm text-yellow-400 mt-2">مؤجلة إلى {formatDate(r.postponed_to)}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3 pt-3 border-t border-dark-600/30">
                          <button onClick={() => openRowDetails(r)} className="mobile-btn mobile-btn-secondary mobile-btn-sm flex-1">تفاصيل</button>
                          {authStatus.isLoggedIn && r.session_status !== 'completed' && r.session_status !== 'cancelled' && (
                            <>
                              <button onClick={() => setPostponing(r)} className="mobile-btn mobile-btn-secondary mobile-btn-sm">تأجيل</button>
                              <button onClick={() => handleComplete(r)} className="mobile-btn mobile-btn-secondary mobile-btn-sm">إنهاء</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {authStatus.isLoggedIn && (
                  <div className="border-t border-dark-600/50 pt-6">
                    <h4 className="text-lg font-semibold text-gray-200 mb-4">إضافة قضية + جلسة</h4>
                    <div className="space-y-4">
                      <div className="mobile-field-group">
                        <label className="mobile-field-label">عنوان القضية *</label>
                        <input
                          value={newCase.title}
                          onChange={e => setNewCase({ ...newCase, title: e.target.value })}
                          placeholder="أدخل عنوان القضية"
                          className="mobile-field"
                        />
                      </div>
                      <div className="mobile-field-group">
                        <label className="mobile-field-label">اسم المحكمة</label>
                        <MobileAutocompleteInput
                          value={newCase.court_name}
                          onChange={v => setNewCase({ ...newCase, court_name: v })}
                          placeholder="اختر أو اكتب اسم المحكمة"
                          fetcher={getCourtSuggestions}
                          mruKey="mru:courts"
                          icon="🏛️"
                        />
                      </div>
                      <div className="mobile-field-group">
                        <label className="mobile-field-label">المحامون</label>
                        <MobileTokenInput
                          tokens={newCase.lawyers}
                          onTokensChange={t => setNewCase({ ...newCase, lawyers: t })}
                          placeholder="اختر أو اكتب أسماء المحامين"
                          fetcher={getLawyerSuggestions}
                          mruKey="mru:lawyers"
                        />
                      </div>
                      <div className="mobile-field-group">
                        <label className="mobile-field-label">اسم المراجع</label>
                        <MobileAutocompleteInput
                          value={newCase.reviewer}
                          onChange={v => setNewCase({ ...newCase, reviewer: v })}
                          placeholder="اختر أو اكتب اسم المراجع"
                          fetcher={getReviewerSuggestions}
                          mruKey="mru:reviewers"
                          icon="👨‍💼"
                        />
                      </div>
                      <div className="mobile-field-group">
                        <label className="mobile-field-label">وصف مختصر</label>
                        <textarea
                          value={newCase.description}
                          onChange={e => setNewCase({ ...newCase, description: e.target.value })}
                          placeholder="وصف مختصر للقضية"
                          rows={3}
                          className="mobile-field"
                        />
                      </div>
                      <div className="mobile-field-group">
                        <label className="mobile-field-label">تفاصيل إضافية</label>
                        <textarea
                          value={newCase.long_description}
                          onChange={e => setNewCase({ ...newCase, long_description: e.target.value })}
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
                  onClick={handleCreate}
                  disabled={!newCase.title || adding}
                  className="mobile-btn mobile-btn-primary mobile-btn-lg w-full disabled:opacity-50"
                >
                  {adding ? 'جاري الإضافة...' : 'إضافة القضية + الجلسة'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedRow && (
        <div className="mobile-modal-backdrop" onClick={() => { setSelectedRow(null); setSelectedCase(null) }}>
          <div className="mobile-modal" onClick={e => e.stopPropagation()}>
            <div className="mobile-modal-header">
              <h3 className="mobile-modal-title">تفاصيل القضية</h3>
              <button onClick={() => { setSelectedRow(null); setSelectedCase(null) }} className="mobile-modal-close">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mobile-modal-body">
              <div className="space-y-6">
                {editMode && authStatus.isLoggedIn ? (
                  <>
                    <div className="mobile-field-group">
                      <label className="mobile-field-label">عنوان القضية</label>
                      <input
                        value={editCaseData.title}
                        onChange={e => setEditCaseData({ ...editCaseData, title: e.target.value })}
                        className="mobile-field"
                      />
                    </div>
                    <div className="mobile-field-group">
                      <label className="mobile-field-label">المحكمة</label>
                      <MobileAutocompleteInput
                        value={editCaseData.court_name}
                        onChange={v => setEditCaseData({ ...editCaseData, court_name: v })}
                        placeholder="اسم المحكمة"
                        fetcher={getCourtSuggestions}
                        mruKey="mru:courts"
                        icon="🏛️"
                      />
                    </div>
                    <div className="mobile-field-group">
                      <label className="mobile-field-label">المحامون</label>
                      <MobileTokenInput
                        tokens={editCaseData.lawyers}
                        onTokensChange={t => setEditCaseData({ ...editCaseData, lawyers: t })}
                        placeholder="أسماء المحامين"
                        fetcher={getLawyerSuggestions}
                        mruKey="mru:lawyers"
                      />
                    </div>
                    <div className="mobile-field-group">
                      <label className="mobile-field-label">المراجع</label>
                      <MobileAutocompleteInput
                        value={editCaseData.reviewer}
                        onChange={v => setEditCaseData({ ...editCaseData, reviewer: v })}
                        placeholder="اسم المراجع"
                        fetcher={getReviewerSuggestions}
                        mruKey="mru:reviewers"
                        icon="👨‍💼"
                      />
                    </div>
                    <div className="mobile-field-group">
                      <label className="mobile-field-label">الوصف المختصر</label>
                      <textarea
                        value={editCaseData.description}
                        onChange={e => setEditCaseData({ ...editCaseData, description: e.target.value })}
                        rows={2}
                        className="mobile-field"
                      />
                    </div>
                    <div className="mobile-field-group">
                      <label className="mobile-field-label">التفاصيل</label>
                      <textarea
                        value={editCaseData.long_description}
                        onChange={e => setEditCaseData({ ...editCaseData, long_description: e.target.value })}
                        rows={3}
                        className="mobile-field"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-blue-400 mb-3">{selectedCase?.title ?? selectedRow.title}</h4>
                        <div className="inline-flex items-center gap-2 mb-4">
                          <span className={`mobile-status-badge ${
                            selectedRow.session_status === 'completed' ? 'mobile-status-neutral' :
                            selectedRow.session_status === 'postponed' ? 'mobile-status-warning' :
                            selectedRow.session_status === 'cancelled' ? 'mobile-status-danger' : 'mobile-status-success'
                          }`}>
                            {selectedRow.session_status === 'completed' ? 'مكتملة' : selectedRow.session_status === 'postponed' ? 'مؤجلة' : selectedRow.session_status === 'cancelled' ? 'ملغاة' : 'مجدولة'}
                          </span>
                          {selectedRow.session_status === 'postponed' && selectedRow.postponed_to && (
                            <span className="text-sm text-yellow-400">إلى {formatDate(selectedRow.postponed_to)}</span>
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
                        <span>{formatDate(selectedRow.session_date)}</span>
                      </div>
                      {!!(selectedCase?.court_name ?? selectedRow.court_name) && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 min-w-[80px]">المحكمة:</span>
                          <span>{selectedCase?.court_name ?? selectedRow.court_name}</span>
                        </div>
                      )}
                      {!!(selectedCase?.reviewer ?? selectedRow.reviewer) && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 min-w-[80px]">المراجع:</span>
                          <span>{selectedCase?.reviewer ?? selectedRow.reviewer}</span>
                        </div>
                      )}
                      {(selectedCase?.lawyers ?? selectedRow.lawyers)?.length ? (
                        <div>
                          <span className="text-gray-500">المحامون:</span>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(selectedCase?.lawyers ?? selectedRow.lawyers)?.map((l, i) => (
                              <span key={i} className="px-2 py-1 bg-dark-700/60 rounded-full text-xs border border-dark-600/50">{l}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {!!selectedCase?.description && (
                        <div>
                          <span className="text-gray-500">الوصف:</span>
                          <p className="mt-1 text-gray-300">{selectedCase.description}</p>
                        </div>
                      )}
                      {!!selectedCase?.long_description && (
                        <div>
                          <span className="text-gray-500">التفاصيل:</span>
                          <p className="mt-1 text-gray-300 whitespace-pre-line">{selectedCase.long_description}</p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="border-t border-dark-600/50 pt-6">
                  <h5 className="font-semibold text-gray-300 mb-4">السجل الزمني</h5>
                  <div className="space-y-3 max-h-48 overflow-y-auto mobile-scroll-smooth">
                    {logs.map(log => (
                      <div key={log.id} className="p-3 bg-dark-700/50 rounded-lg border border-dark-600/30">
                        <div className="flex items-center gap-2 text-xs mb-2">
                          <span className="text-gray-500">{formatDateTime(log.created_at)}</span>
                          <span className="mobile-status-badge mobile-status-info">
                            {log.action_type}
                          </span>
                        </div>
                        {log.description && <p className="text-sm text-gray-300">{log.description}</p>}
                      </div>
                    ))}
                    {logs.length === 0 && (
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
                  <button onClick={handleUpdateCase} className="mobile-btn mobile-btn-primary flex-1">حفظ التعديلات</button>
                  <button onClick={() => setEditMode(false)} className="mobile-btn mobile-btn-secondary">إلغاء</button>
                </div>
              ) : authStatus.isLoggedIn && (
                <div className="flex flex-wrap gap-2">
                  {selectedRow.session_status !== 'completed' && selectedRow.session_status !== 'cancelled' && (
                    <>
                      <button onClick={() => setPostponing(selectedRow)} className="mobile-btn mobile-btn-secondary flex-1">تأجيل</button>
                      <button onClick={() => handleComplete(selectedRow)} className="mobile-btn mobile-btn-secondary flex-1">إنهاء</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {postponing && (
        <div className="mobile-modal-backdrop" onClick={() => setPostponing(null)}>
          <div className="mobile-modal" onClick={e => e.stopPropagation()}>
            <div className="mobile-modal-header">
              <h3 className="mobile-modal-title">تأجيل الجلسة</h3>
              <button onClick={() => setPostponing(null)} className="mobile-modal-close">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="mobile-modal-body">
              <div className="space-y-4">
                <p className="text-gray-300">تأجيل جلسة: <strong className="text-blue-400">{selectedRow?.title}</strong></p>
                <p className="text-sm text-gray-500">من تاريخ: {postponing && formatDate(postponing.session_date)}</p>
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
                  onClick={() => { setPostponing(null); setPostponeDate('') }}
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
