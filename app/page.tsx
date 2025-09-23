'use client'
import { useState, useEffect } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths } from "date-fns"
import { ar } from "date-fns/locale"
import { supabase, type Event, type EventLog } from "@/lib/supabaseClient"
import { getAuthStatus, logout } from "@/lib/auth"
import LoginModal from "@/components/LoginModal"
import toast from "react-hot-toast"

const f = (d: Date | string) => format(new Date(d), "dd/MM/yyyy")

export default function Calendar() {
  const [currentMonth,setCurrentMonth]=useState(new Date())
  const [events,setEvents]=useState<Event[]>([])
  const [logs,setLogs]=useState<Record<string,EventLog[]>>({})
  const [selectedDate,setSelectedDate]=useState<Date|null>(null)
  const [loading,setLoading]=useState(true)
  const [auth,setAuth]=useState({isLoggedIn:false,userType:"visitor"})
  const [showLogin,setShowLogin]=useState(false)

  const [title,setTitle]=useState("")
  const [desc,setDesc]=useState("")
  const [longDesc,setLongDesc]=useState("")
  const [court,setCourt]=useState("")
  const [lawyers,setLawyers]=useState("")
  const [submitting,setSubmitting]=useState(false)

  const [editing,setEditing]=useState<Event|null>(null)
  const [logMsg,setLogMsg]=useState("")
  const [postponeOpen,setPostponeOpen]=useState<Event|null>(null)
  const [postponeDate,setPostponeDate]=useState("")

  const monthDays=eachDayOfInterval({start:startOfMonth(currentMonth),end:endOfMonth(currentMonth)})
  const weekDays=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"]

  useEffect(()=>{ setAuth(getAuthStatus()) },[])
  useEffect(()=>{ fetchEvents() },[currentMonth])

  const fetchEvents=async()=>{
    setLoading(true)
    const s=format(startOfMonth(currentMonth),"yyyy-MM-dd")
    const e=format(endOfMonth(currentMonth),"yyyy-MM-dd")
    const {data,error}=await supabase.from("events").select("*").gte("date",s).lte("date",e).order("created_at",{ascending:false})
    if(error){ setEvents([]); toast.error("خطأ في تحميل الأحداث") } else { setEvents(data||[]) }
    setLoading(false)
  }

  const eventsFor=(d:Date)=> events.filter(ev=>isSameDay(new Date(ev.date),d))

  const openForDay=(d:Date)=>{ setSelectedDate(d); setTitle(""); setDesc(""); setLongDesc(""); setCourt(""); setLawyers(""); setEditing(null); setLogMsg(""); setPostponeOpen(null) }

  const loadLogs=async(case_ref:string)=>{
    if(logs[case_ref]) return
    const {data,error}=await supabase.from("event_logs").select("*").eq("case_ref",case_ref).order("created_at",{ascending:true})
    if(!error) setLogs(prev=>({...prev,[case_ref]:data||[]}))
  }

  const addEvent=async()=>{
    if(!selectedDate||!title.trim()||!auth.isLoggedIn) return
    setSubmitting(true)
    const lawyersArr=lawyers.split(",").map(s=>s.trim()).filter(Boolean)
    const {data,error}=await supabase.from("events").insert([{
      date:format(selectedDate,"yyyy-MM-dd"),
      title:title.trim(),
      description:desc.trim()||null,
      long_description:longDesc.trim()||null,
      court_name:court.trim()||null,
      lawyers:lawyersArr.length?lawyersArr:null
    }]).select()
    if(error){ toast.error("خطأ في الإضافة") } else { setEvents(prev=>[...(prev||[]),...(data||[])]); setTitle(""); setDesc(""); setLongDesc(""); setCourt(""); setLawyers(""); toast.success("تمت الإضافة") }
    setSubmitting(false)
  }

  const updateEvent=async()=>{
    if(!editing||!editing.title.trim()||!auth.isLoggedIn) return
    setSubmitting(true)
    const {data,error}=await supabase.from("events").update({
      title:editing.title.trim(),
      description:editing.description?.trim()||null,
      long_description:editing.long_description?.trim()||null,
      court_name:editing.court_name?.trim()||null,
      lawyers:(editing.lawyers||[]).map(s=>`${s}`.trim()).filter(Boolean)
    }).eq("id",editing.id).select()
    if(error){ toast.error("خطأ في التحديث") } else { setEvents(prev=>prev.map(ev=>ev.id===editing.id?(data?.[0]||ev):ev)); setEditing(null); toast.success("تم التحديث") }
    setSubmitting(false)
  }

  const deleteEvent=async(id:string)=>{
    if(!auth.isLoggedIn) return
    if(!window.confirm("حذف القضية؟")) return
    const {error}=await supabase.from("events").delete().eq("id",id)
    if(error){ toast.error("خطأ في الحذف") } else { setEvents(prev=>prev.filter(ev=>ev.id!==id)); toast.success("تم الحذف") }
  }

  const addLog=async(case_ref:string)=>{
    if(!auth.isLoggedIn||!logMsg.trim()) return
    const {data,error}=await supabase.from("event_logs").insert([{case_ref, message:logMsg.trim()}]).select()
    if(error){ toast.error("خطأ في السجل") } else {
      setLogs(prev=>({...prev,[case_ref]:[...(prev[case_ref]||[]),...(data||[])]}))
      setLogMsg("")
      toast.success("تمت إضافة بند للسجل")
    }
  }

  const openPostpone=(ev:Event)=>{ setPostponeOpen(ev); setPostponeDate("") }

  const confirmPostpone=async()=>{
    if(!postponeOpen||!postponeDate||!auth.isLoggedIn) return
    const old=postponeOpen
    const newDate=postponeDate
    const {error:upErr}=await supabase.from("events").update({status:"postponed", postponed_to:newDate}).eq("id",old.id)
    if(upErr){ toast.error("فشل تأجيل الأصلية"); return }
    const {data:newRow,error:newErr}=await supabase.from("events").insert([{
      date:newDate,
      title:old.title,
      description:old.description,
      long_description:old.long_description,
      court_name:old.court_name,
      lawyers:old.lawyers,
      status:"open",
      case_ref:old.case_ref
    }]).select()
    await supabase.from("event_logs").insert([
      {case_ref:old.case_ref, message:`تأجيل من ${f(old.date)} إلى ${f(newDate)}`}
    ])
    if(newErr){ toast.error("فشل إنشاء الحالة الجديدة") } else { setEvents(prev=>[...prev.map(e=>e.id===old.id?{...e,status:"postponed",postponed_to:newDate}:e), ...(newRow||[])]); toast.success("تم التأجيل") }
    setPostponeOpen(null)
  }

  const nextM=()=>setCurrentMonth(addMonths(currentMonth,1))
  const prevM=()=>setCurrentMonth(subMonths(currentMonth,1))

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
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

        <div className="bg-dark-800/50 backdrop-blur-sm rounded-2xl border border-dark-700 p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <button onClick={prevM} className="p-3 rounded-xl bg-dark-700 hover:bg-dark-600 transition-all">{"<"}</button>
            <h2 className="text-2xl font-bold">{format(currentMonth,"MMMM yyyy",{locale:ar})}</h2>
            <button onClick={nextM} className="p-3 rounded-xl bg-dark-700 hover:bg-dark-600 transition-all">{">"}</button>
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
                  <div key={day.toISOString()} onClick={()=>openForDay(day)} className={`calendar-day ${isToday(day)?"today":""} ${ds.length>0?"has-events":""}`}>
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
              <h3 className="text-xl font-bold">{f(selectedDate)}</h3>
              <button onClick={()=>setSelectedDate(null)} className="p-2 rounded-lg hover:bg-dark-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="p-6 max-h-64 overflow-y-auto space-y-3">
              {eventsFor(selectedDate).map(ev=>(
                <div key={ev.id} className="p-4 bg-dark-700/50 rounded-lg border border-dark-600">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-blue-400">{ev.title}</h4>
                        {ev.status==="postponed"&&ev.postponed_to&&(<span className="text-xs text-yellow-300">مؤجّلة إلى {f(ev.postponed_to)}</span>)}
                      </div>
                      {ev.court_name&&(<div className="text-sm text-dark-300 mt-1">المحكمة: {ev.court_name}</div>)}
                      {ev.lawyers&&ev.lawyers.length>0&&(
                        <div className="flex flex-wrap gap-1 mt-2">
                          {ev.lawyers.map((n,i)=>(<span key={i} className="px-2 py-0.5 rounded-full bg-dark-600 text-xs">{n}</span>))}
                        </div>
                      )}
                      {ev.description&&(<p className="text-dark-300 text-sm mt-2">{ev.description}</p>)}
                      {ev.long_description&&(<p className="text-dark-200 text-sm mt-2 whitespace-pre-wrap">{ev.long_description}</p>)}
                      <button onClick={()=>{setEditing(ev); setTitle(""); loadLogs(ev.case_ref)}} className="mt-3 text-xs text-blue-400 underline">فتح التفاصيل والسجل</button>
                    </div>
                    {auth.isLoggedIn&&(
                      <div className="flex gap-1">
                        <button onClick={()=>openPostpone(ev)} className="p-2 text-yellow-300 hover:bg-yellow-400/20 rounded-lg" title="تأجيل">↦</button>
                        <button onClick={()=>deleteEvent(ev.id)} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg" title="حذف">🗑</button>
                      </div>
                    )}
                  </div>

                  {editing?.id===ev.id&&(
                    <div className="mt-4 space-y-2">
                      <input value={editing.title} onChange={e=>setEditing(s=>s?{...s,title:e.target.value}:s)} placeholder="عنوان" className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
                      <input value={editing.court_name||""} onChange={e=>setEditing(s=>s?{...s,court_name:e.target.value}:s)} placeholder="اسم المحكمة" className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
                      <input value={(editing.lawyers||[]).join(", ")} onChange={e=>setEditing(s=>s?{...s,lawyers:e.target.value.split(",").map(v=>v.trim()).filter(Boolean)}:s)} placeholder="أسماء المحامين مفصولة بفاصلة" className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
                      <textarea value={editing.description||""} onChange={e=>setEditing(s=>s?{...s,description:e.target.value}:s)} placeholder="وصف مختصر" className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
                      <textarea value={editing.long_description||""} onChange={e=>setEditing(s=>s?{...s,long_description:e.target.value}:s)} placeholder="وصف طويل لتفاصيل القضية" className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
                      <div className="flex gap-2">
                        <button onClick={()=>updateEvent()} className="flex-1 p-3 bg-blue-600 hover:bg-blue-700 rounded-lg">حفظ</button>
                        <button onClick={()=>setEditing(null)} className="px-6 py-3 bg-dark-700 hover:bg-dark-600 rounded-lg">إلغاء</button>
                      </div>
                      <div className="mt-3 border-t border-dark-600 pt-3">
                        <div className="text-sm mb-2">سجل التحديثات</div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {(logs[ev.case_ref]||[]).map(l=>(
                            <div key={l.id} className="text-xs text-dark-300">{f(l.created_at)} — {l.message}</div>
                          ))}
                        </div>
                        {auth.isLoggedIn&&(
                          <div className="flex gap-2 mt-2">
                            <input value={logMsg} onChange={e=>setLogMsg(e.target.value)} placeholder="أضف بندًا للسجل" className="flex-1 p-2 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
                            <button onClick={()=>addLog(ev.case_ref)} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg">إضافة</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {eventsFor(selectedDate).length===0&&(<div className="text-center text-dark-400">لا توجد قضايا</div>)}
            </div>

            <div className="p-6 border-t border-dark-700 space-y-3">
              {auth.isLoggedIn?(
                <>
                  <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="عنوان القضية" className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
                  <input value={court} onChange={e=>setCourt(e.target.value)} placeholder="اسم المحكمة" className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
                  <input value={lawyers} onChange={e=>setLawyers(e.target.value)} placeholder="أسماء المحامين (افصلها بفاصلة)" className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
                  <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="وصف مختصر" className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
                  <textarea value={longDesc} onChange={e=>setLongDesc(e.target.value)} placeholder="وصف طويل لتفاصيل القضية" className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
                  <button onClick={addEvent} disabled={!title.trim()||submitting} className="w-full p-3 bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-60">{submitting?"جارٍ الحفظ":"حفظ"}</button>
                </>
              ):(
                <div className="text-center text-dark-400">تسجيل دخول المدير مطلوب للإضافة</div>
              )}
            </div>
          </div>
        </div>
      )}

      {postponeOpen&&(
        <div className="modal-backdrop" onClick={()=>setPostponeOpen(null)}>
          <div className="modal-content animate-slide-up" onClick={e=>e.stopPropagation()}>
            <div className="p-6 border-b border-dark-700 flex items-center justify-between">
              <h3 className="text-xl font-bold">تأجيل: {postponeOpen.title}</h3>
              <button onClick={()=>setPostponeOpen(null)} className="p-2 rounded-lg hover:bg-dark-700"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <div className="p-6 space-y-3">
              <input type="date" value={postponeDate} onChange={e=>setPostponeDate(e.target.value)} className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg outline-none"/>
              <button onClick={confirmPostpone} className="w-full p-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg">تأكيد التأجيل</button>
            </div>
          </div>
        </div>
      )}

      <LoginModal isOpen={showLogin} onClose={()=>setShowLogin(false)} onLogin={()=>setAuth(getAuthStatus())}/>
    </div>
  )
}
