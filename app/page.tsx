'use client'
import { useState, useEffect } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths } from "date-fns"
import { ar } from "date-fns/locale"
import { supabase, type Event } from "@/lib/supabaseClient"
import { getAuthStatus, logout } from "@/lib/auth"
import LoginModal from "@/components/LoginModal"
import toast from "react-hot-toast"

export default function Calendar() {
  const [currentMonth,setCurrentMonth]=useState(new Date())
  const [events,setEvents]=useState<Event[]>([])
  const [selectedDate,setSelectedDate]=useState<Date|null>(null)
  const [loading,setLoading]=useState(true)
  const [newEvent,setNewEvent]=useState({title:"",description:""})
  const [submitting,setSubmitting]=useState(false)
  const [auth,setAuth]=useState({isLoggedIn:false,userType:"visitor"})
  const [showLogin,setShowLogin]=useState(false)
  const [editing,setEditing]=useState<Event|null>(null)

  const monthDays=eachDayOfInterval({start:startOfMonth(currentMonth),end:endOfMonth(currentMonth)})
  const weekDays=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"]

  useEffect(()=>{ setAuth(getAuthStatus()) },[])
  useEffect(()=>{ fetchEvents() },[currentMonth])
  useEffect(()=>{ if("serviceWorker" in navigator){ navigator.serviceWorker.register("/sw.js") } },[])

  const fetchEvents=async()=>{
    setLoading(true)
    const s=format(startOfMonth(currentMonth),"yyyy-MM-dd")
    const e=format(endOfMonth(currentMonth),"yyyy-MM-dd")
    const {data,error}=await supabase.from("events").select("*").gte("date",s).lte("date",e).order("created_at",{ascending:false})
    if(error){ toast.error("خطأ في تحميل الأحداث"); setEvents([]) } else { setEvents(data||[]) }
    setLoading(false)
  }

  const addEvent=async()=>{
    if(!selectedDate||!newEvent.title.trim()||!auth.isLoggedIn) return
    setSubmitting(true)
    const {data,error}=await supabase.from("events").insert([{date:format(selectedDate,"yyyy-MM-dd"),title:newEvent.title.trim(),description:newEvent.description.trim()}]).select()
    if(error){ toast.error("خطأ في إضافة الحدث") } else { setEvents(prev=>[...(prev||[]),...(data||[])]); setNewEvent({title:"",description:""}); toast.success("تمت الإضافة") }
    setSubmitting(false)
  }

  const updateEvent=async()=>{
    if(!editing||!editing.title.trim()||!auth.isLoggedIn) return
    setSubmitting(true)
    const {data,error}=await supabase.from("events").update({title:editing.title.trim(),description:editing.description?.trim()||null}).eq("id",editing.id).select()
    if(error){ toast.error("خطأ في التحديث") } else { setEvents(prev=>prev.map(ev=>ev.id===editing.id?(data?.[0]||ev):ev)); setEditing(null); toast.success("تم التحديث") }
    setSubmitting(false)
  }

  const deleteEvent=async(id:string)=>{
    if(!auth.isLoggedIn) return
    const ok=window.confirm("حذف الحدث؟")
    if(!ok) return
    const {error}=await supabase.from("events").delete().eq("id",id)
    if(error){ toast.error("خطأ في الحذف") } else { setEvents(prev=>prev.filter(ev=>ev.id!==id)); toast.success("تم الحذف") }
  }

  const eventsFor=(d:Date)=> events.filter(ev=>isSameDay(new Date(ev.date),d))
  const nextMonth=()=>setCurrentMonth(addMonths(currentMonth,1))
  const prevMonth=()=>setCurrentMonth(subMonths(currentMonth,1))

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div>{auth.isLoggedIn?<span className="admin-badge">مدير النظام</span>:<span className="visitor-badge">زائر</span>}</div>
            <div className="flex items-center gap-2">
              {auth.isLoggedIn?(
                <button onClick={()=>{logout(); setAuth(getAuthStatus()); toast.success("تم تسجيل الخروج")}} className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 text-red-400 rounded-lg text-sm">تسجيل الخروج</button>
              ):(
                <button onClick={()=>setShowLogin(true)} className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/50 text-blue-400 rounded-lg text-sm">دخول المدير</button>
              )}
            </div>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-2">رزنامة المكتب القانوني</h1>
          <p className="text-dark-400">إدارة المواعيد والأحداث</p>
        </header>

        <div className="bg-dark-800/50 backdrop-blur-sm rounded-2xl border border-dark-700 p-6 shadow-2xl animate-slide-up">
          <div className="flex items-center justify-between mb-6">
            <button onClick={prevMonth} className="p-3 rounded-xl bg-dark-700 hover:bg-dark-600 transition-all">{"<"}</button>
            <h2 className="text-2xl font-bold">{format(currentMonth,"MMMM yyyy",{locale:ar})}</h2>
            <button onClick={nextMonth} className="p-3 rounded-xl bg-dark-700 hover:bg-dark-600 transition-all">{">"}</button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map(d=>(<div key={d} className="p-3 text-center text-dark-400 font-semibold">{d}</div>))}
          </div>

          {loading?(
            <div className="flex justify-center py-20"><div className="loader"/></div>
          ):(
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map(day=>{
                const ds=eventsFor(day)
                return(
                  <div key={day.toISOString()} onClick={()=>setSelectedDate(day)} className={`calendar-day ${isToday(day)?"today":""} ${ds.length>0?"has-events":""}`}>
                    <div className="p-3 h-full flex flex-col justify-between">
                      <span className="text-sm font-medium">{format(day,"d")}</span>
                      {ds.length>0&&(
                        <div className="flex flex-wrap gap-1 mt-1">
                          {ds.slice(0,2).map((_,i)=>(<div key={i} className="event-dot"/>))}
                          {ds.length>2&&(<span className="text-xs text-blue-400 font-medium">+{ds.length-2}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {selectedDate&&(
        <div className="modal-backdrop" onClick={()=>setSelectedDate(null)}>
          <div className="modal-content animate-slide-up" onClick={e=>e.stopPropagation()}>
            <div className="p-6 border-b border-dark-700 flex items-center justify-between">
              <h3 className="text-xl font-bold">{format(selectedDate,"dd MMMM yyyy",{locale:ar})}</h3>
              <button onClick={()=>setSelectedDate(null)} className="p-2 rounded-lg hover:bg-dark-700"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <div className="p-6 max-h-64 overflow-y-auto space-y-3">
              {eventsFor(selectedDate).map(ev=>(
                <div key={ev.id} className="p-4 bg-dark-700/50 rounded-lg border border-dark-600 group">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-blue-400 mb-1">{ev.title}</h4>
                      {ev.description&&(<p className="text-dark-300 text-sm">{ev.description}</p>)}
                    </div>
                    {auth.isLoggedIn&&(
                      <div className="flex gap-1">
                        <button onClick={()=>setEditing(ev)} className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg" title="تعديل">✎</button>
                        <button onClick={()=>deleteEvent(ev.id)} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg" title="حذف">🗑</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {eventsFor(selectedDate).length===0&&(<div className="text-center text-dark-400">لا توجد أحداث</div>)}
            </div>
            <div className="p-6 border-t border-dark-700 space-y-3">
              {auth.isLoggedIn?(
                <>
                  <input value={newEvent.title} onChange={e=>setNewEvent(s=>({...s,title:e.target.value}))} placeholder="عنوان الحدث" className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
                  <textarea value={newEvent.description} onChange={e=>setNewEvent(s=>({...s,description:e.target.value}))} placeholder="وصف الحدث" className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
                  <button onClick={addEvent} disabled={submitting||!newEvent.title.trim()} className="w-full p-3 bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-60">{submitting?"جارٍ الحفظ":"حفظ"}</button>
                </>
              ):(
                <div className="text-center text-dark-400">تسجيل دخول المدير مطلوب للإضافة</div>
              )}
            </div>
          </div>
        </div>
      )}

      {editing&&(
        <div className="modal-backdrop" onClick={()=>setEditing(null)}>
          <div className="modal-content animate-slide-up" onClick={e=>e.stopPropagation()}>
            <div className="p-6 border-b border-dark-700 flex items-center justify-between">
              <h3 className="text-xl font-bold">تعديل حدث</h3>
              <button onClick={()=>setEditing(null)} className="p-2 rounded-lg hover:bg-dark-700"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <div className="p-6 space-y-3">
              <input value={editing.title} onChange={e=>setEditing(s=>s?{...s,title:e.target.value}:s)} className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
              <textarea value={editing.description||""} onChange={e=>setEditing(s=>s?{...s,description:e.target.value}:s)} className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
              <div className="flex gap-2">
                <button onClick={updateEvent} disabled={submitting||!editing.title.trim()} className="flex-1 p-3 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60">{submitting?"جارٍ الحفظ":"حفظ"}</button>
                <button onClick={()=>setEditing(null)} className="px-6 py-3 bg-dark-700 hover:bg-dark-600 rounded-lg">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <LoginModal isOpen={showLogin} onClose={()=>setShowLogin(false)} onLogin={()=>setAuth(getAuthStatus())}/>
    </div>
  )
}
