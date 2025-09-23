'use client'

import { useState, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths } from 'date-fns'
import { ar } from 'date-fns/locale'
import { supabase, Event, EventLog } from '../lib/supabaseClient'
import { getAuthStatus, logout } from '../lib/auth'
import LoginModal from '../components/LoginModal'
import toast, { Toaster } from 'react-hot-toast'

export default function Calendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [events, setEvents] = useState<Event[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [newEvent, setNewEvent] = useState({ title: '', description: '', long_description: '', court_name: '', lawyers: '' })
  const [submitting, setSubmitting] = useState(false)
  const [authStatus, setAuthStatus] = useState({ isLoggedIn: false, userType: 'visitor' })
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [logs, setLogs] = useState<Record<string, EventLog[]>>({})
  const [logMsg, setLogMsg] = useState('')

  const monthDays = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  })
  const weekDays = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']

  useEffect(() => { setAuthStatus(getAuthStatus()) }, [])
  useEffect(() => { fetchEvents() }, [currentMonth])
  useEffect(() => { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js') }, [])

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const startDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
      const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
      const { data, error } = await supabase.from('events').select('*')
        .gte('date', startDate).lte('date', endDate).order('created_at',{ascending:false})
      if (error) throw error
      setEvents(data || [])
    } catch { toast.error('خطأ في تحميل الأحداث') }
    finally { setLoading(false) }
  }

  const loadLogs = async (case_ref: string) => {
    const { data, error } = await supabase.from('event_logs').select('*').eq('case_ref', case_ref).order('created_at',{ascending:true})
    if (!error) setLogs(prev => ({...prev, [case_ref]: data||[]}))
  }

  const openDetails = async (ev: Event) => {
    setEditingEvent(ev)
    await loadLogs(ev.case_ref)
  }

  const addLog = async (case_ref: string) => {
    if (!authStatus.isLoggedIn || !logMsg.trim()) return
    const { data, error } = await supabase.from('event_logs').insert([{ case_ref, kind:'note', message:logMsg.trim(), actor:'admin' }]).select()
    if (!error) {
      setLogs(prev => ({...prev, [case_ref]: [...(prev[case_ref]||[]), ...(data||[])]}))
      setLogMsg('')
    }
  }

  const deleteEvent = async (id: string) => {
    if (!authStatus.isLoggedIn) return
    if (!confirm('حذف القضية (حذف منطقي)؟')) return
    const { error } = await supabase.from('events').update({ status:'deleted', deleted_at:new Date().toISOString() }).eq('id',id)
    if (!error) setEvents(p=>p.filter(e=>e.id!==id))
  }

  const closeEvent = async (ev: Event) => {
    const { error } = await supabase.from('events').update({ status:'closed' }).eq('id', ev.id)
    if (!error) setEvents(p=>p.map(e=>e.id===ev.id?{...e,status:'closed'}:e))
  }
  const reopenEvent = async (ev: Event) => {
    const { error } = await supabase.from('events').update({ status:'open' }).eq('id', ev.id)
    if (!error) setEvents(p=>p.map(e=>e.id===ev.id?{...e,status:'open'}:e))
  }

  const getEventsForDate = (date: Date) => events.filter(event => isSameDay(new Date(event.date), date))
  const handleLogin = () => setAuthStatus(getAuthStatus())
  const handleLogout = () => { logout(); setAuthStatus(getAuthStatus()); toast.success('تم تسجيل الخروج') }
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>{authStatus.isLoggedIn ? <div className="admin-badge">مدير النظام</div> : <div className="visitor-badge">زائر</div>}</div>
            <div>
              {authStatus.isLoggedIn ? (
                <button onClick={handleLogout} className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg">تسجيل الخروج</button>
              ) : (
                <button onClick={()=>setShowLoginModal(true)} className="px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg">دخول المدير</button>
              )}
            </div>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">رزنامة المكتب القانوني</h1>
        </header>

        <div className="bg-dark-800/50 rounded-2xl border border-dark-700 p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <button onClick={prevMonth}>◀</button>
            <h2 className="text-2xl font-bold">{format(currentMonth,'MMMM yyyy',{locale:ar})}</h2>
            <button onClick={nextMonth}>▶</button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map(day=><div key={day} className="p-3 text-center text-dark-400">{day}</div>)}
          </div>

          {loading ? <div className="flex justify-center py-20"><div className="loader"></div></div> : (
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map(day=>{
                const dayEvents=getEventsForDate(day)
                return (
                  <div key={day.toString()} onClick={()=>setSelectedDate(day)} className={`calendar-day ${isToday(day)?'today':''} ${dayEvents.length>0?'has-events':''}`}>
                    <div className="p-3 h-full flex flex-col justify-between">
                      <span className="text-sm font-medium">{format(day,'d')}</span>
                      {dayEvents.length>0 && <span className="text-xs text-blue-400 font-medium">{dayEvents.length} قضايا</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {selectedDate && (
        <div className="modal-backdrop" onClick={()=>setSelectedDate(null)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div className="p-6 border-b border-dark-700 flex justify-between">
              <h3 className="text-xl font-bold">{format(selectedDate,'dd/MM/yyyy',{locale:ar})}</h3>
              <button onClick={()=>setSelectedDate(null)}>✖</button>
            </div>

            <div className="p-6 max-h-64 overflow-y-auto space-y-3">
              {getEventsForDate(selectedDate).map(ev=>(
                <div key={ev.id} className="p-4 bg-dark-700/50 rounded-lg border border-dark-600">
                  <div className="flex justify-between">
                    <div>
                      <h4 className="font-semibold text-blue-400 mb-1">{ev.title}</h4>
                      {ev.court_name && <p className="text-sm text-dark-300">المحكمة: {ev.court_name}</p>}
                      {ev.lawyers && ev.lawyers.length>0 && <p className="text-sm text-dark-300">المحامون: {ev.lawyers.join(', ')}</p>}
                    </div>
                    {authStatus.isLoggedIn && (
                      <div className="flex gap-1">
                        {ev.status!=='closed' && <button onClick={()=>closeEvent(ev)}>إغلاق</button>}
                        {ev.status==='closed' && <button onClick={()=>reopenEvent(ev)}>إعادة فتح</button>}
                        <button onClick={()=>openDetails(ev)}>تفاصيل</button>
                        <button onClick={()=>deleteEvent(ev.id)}>🗑</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {editingEvent && (
        <div className="modal-backdrop" onClick={()=>setEditingEvent(null)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div className="p-6 border-b border-dark-700 flex justify-between">
              <h3 className="text-xl font-bold">تفاصيل القضية</h3>
              <button onClick={()=>setEditingEvent(null)}>✖</button>
            </div>

            <div className="p-6 space-y-4">
              <p><strong>العنوان:</strong> {editingEvent.title}</p>
              <p><strong>الوصف:</strong> {editingEvent.description}</p>
              <p><strong>تفاصيل:</strong> {editingEvent.long_description}</p>
              <p><strong>المحكمة:</strong> {editingEvent.court_name}</p>
              <p><strong>المحامون:</strong> {(editingEvent.lawyers||[]).join(', ')}</p>

              <h4 className="font-semibold mt-4">سجل التحديثات</h4>
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {(logs[editingEvent.case_ref]||[]).map(l=>(
                  <div key={l.id} className="rounded-lg p-2 border border-dark-600 bg-dark-700/40">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-dark-400">{format(new Date(l.created_at),'dd/MM/yyyy HH:mm')}</span>
                      <span className="px-2 py-0.5 rounded-full bg-gray-600/30 text-gray-200">{l.kind}</span>
                      <span className="text-dark-200">{l.message}</span>
                    </div>
                    {l.changes && typeof l.changes==='object' && Object.keys(l.changes||{}).length>0 && (
                      <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
                        {Object.entries(l.changes||{}).map(([field,vals]:any)=>(
                          <div key={field} className="flex gap-2">
                            <span className="text-dark-400 min-w-28">{field}:</span>
                            <span className="line-through text-red-300/80">{String(vals?.old ?? '')}</span>
                            <span className="text-blue-300">→ {String(vals?.new ?? '')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {authStatus.isLoggedIn && (
                <div className="flex gap-2 mt-2">
                  <input value={logMsg} onChange={e=>setLogMsg(e.target.value)} placeholder="أضف ملاحظة" className="flex-1 p-2 bg-dark-700 rounded-lg"/>
                  <button onClick={()=>addLog(editingEvent.case_ref)} className="px-4 bg-blue-600 text-white rounded-lg">إضافة</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <LoginModal isOpen={showLoginModal} onClose={()=>setShowLoginModal(false)} onLogin={handleLogin}/>
      <Toaster position="top-center"/>
    </div>
  )
}
