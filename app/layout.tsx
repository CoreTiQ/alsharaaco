import type { Metadata, Viewport } from "next"
import "./globals.css"
import { Toaster } from "react-hot-toast"
import SwClient from "./sw-client"

export const metadata: Metadata = {
  title: "الشرع للمحاماة",
  description: "نظام متقدم لإدارة القضايا والمواعيد القانونية",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "الشرع للمحاماة" },
  formatDetection: { telephone: false }
}

export const viewport: Viewport = {
  themeColor: "#1f2937",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1f2937" />
        <link rel="icon" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="الشرع للمحاماة" />
      </head>
      <body>
        <SwClient />
        {children}
        <Toaster
          position="top-center"
          toastOptions={{ style: { background: "#1e293b", color: "#f1f5f9", border: "1px solid #334155" } }}
        />
      </body>
    </html>
  )
}
