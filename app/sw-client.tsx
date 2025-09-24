'use client'
import { useEffect, useRef } from 'react'

export default function SwClient() {
  const reloaded = useRef(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'RELOAD' && !reloaded.current) {
        reloaded.current = true
        location.reload()
      }
    })

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      if (!reg) return
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller && !reloaded.current) {
            reloaded.current = true
            location.reload()
          }
        })
      })
    })

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloaded.current) {
        reloaded.current = true
        location.reload()
      }
    })
  }, [])

  return null
}
