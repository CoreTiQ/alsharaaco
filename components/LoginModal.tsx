'use client'
import { useState } from 'react'
import { login } from '@/lib/auth'
import toast from 'react-hot-toast'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  onLogin: () => void
}

export default function LoginModal({ isOpen, onClose, onLogin }: LoginModalProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    setLoading(true)
    if (login(password)) {
      toast.success('تم تسجيل الدخول بنجاح')
      onLogin()
      onClose()
      setPassword('')
    } else {
      toast.error('كلمة المرور غير صحيحة')
    }
    setLoading(false)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-dark-700">
          <h3 className="text-xl font-bold">تسجيل دخول المدير</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">كلمة المرور</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="أدخل كلمة مرور المدير" className="w-full p-3 rounded-lg border" autoFocus/>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading || !password.trim()} className="btn-primary flex-1 disabled:opacity-50">{loading ? 'جاري التحقق...' : 'دخول'}</button>
            <button type="button" onClick={onClose} className="btn-secondary">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  )
}
