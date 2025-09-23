import type { Metadata, Viewport } from "next"
import "./globals.css"
import { Toaster } from "react-hot-toast"

export const metadata: Metadata = {
  title: "رزنامة المكتب القانوني",
  description: "تطبيق رزنامة متطور لإدارة المواعيد والأحداث",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "رزنامة" },
  formatDetection: { telephone: false }
}

export const viewport: Viewport = {
  themeColor: "#1e293b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
}

export default function RootLayout({ children }:{children:React.ReactNode}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  )
}
