'use client'
import { useState } from "react"
import { login } from "@/lib/auth"
import toast from "react-hot-toast"

export default function LoginModal({ isOpen, onClose, onLogin }:{isOpen:boolean; onClose:()=>void; onLogin:()=>void}) {
  const [password,setPassword]=useState("")
  const [loading,setLoading]=useState(false)
  if(!isOpen) return null
  const submit=async(e:React.FormEvent)=>{e.preventDefault(); if(!password.trim())return; setLoading(true); if(login(password)){toast.success("تم تسجيل الدخول"); onLogin(); onClose(); setPassword("")} else {toast.error("كلمة المرور غير صحيحة")} setLoading(false)}
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content animate-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="p-6 border-b border-dark-700 flex items-center justify-between">
          <h3 className="text-xl font-bold">تسجيل دخول المدير</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-700"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="كلمة مرور المدير" className="w-full p-3 bg-dark-700 border border-dark-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"/>
          <div className="flex gap-3">
            <button type="submit" disabled={loading||!password.trim()} className="flex-1 p-3 bg-blue-600 hover:bg-blue-700 rounded-lg">{loading?"جاري التحقق...":"تسجيل الدخول"}</button>
            <button type="button" onClick={onClose} className="px-6 py-3 bg-dark-700 hover:bg-dark-600 rounded-lg">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  )
}
