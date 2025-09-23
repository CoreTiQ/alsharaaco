import type { Metadata, Viewport } from "next"
import "./globals.css"
import { Toaster } from "react-hot-toast"

export const metadata: Metadata = {
  title: "رزنامة المكتب القانوني",
  description: "نظام متقدم لإدارة القضايا والمواعيد القانونية",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "رزنامة قانونية"
  },
  formatDetection: { telephone: false }
}

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
}

export default function RootLayout({children}:{children:React.ReactNode}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        {children}
        <Toaster position="top-center" toastOptions={{
          style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' }
        }}/>
      </body>
    </html>
  )
}
