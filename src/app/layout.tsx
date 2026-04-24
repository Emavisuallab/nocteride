import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { ToastProvider } from '@/components/ui/Toast'
import PWARegister from '@/components/PWARegister'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'NocteRide',
  description: 'Transporte nocturno privado',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NocteRide',
  },
}

export const viewport: Viewport = {
  themeColor: '#0D0D14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`${plusJakarta.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans">
        <ToastProvider>
          {children}
        </ToastProvider>
        <PWARegister />
      </body>
    </html>
  )
}
