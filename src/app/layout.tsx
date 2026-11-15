import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/lib/theme'
import { DatosProvider } from '@/lib/datos/datos-context'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'

// Misma tipografía y variable CSS que Cielo Cloud Nómina.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Cielo Cloud Fiscal',
  description:
    'Gestión fiscal para contadores dominicanos: extracción de facturas, Reportes 606 y 607, ITBIS, IR-17 y proyección de ISR.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Aplica el tema antes del primer paint para evitar el flash claro→oscuro. */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('cielo-fiscal-theme');
            var p = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (t === 'dark' || (!t && p)) document.documentElement.classList.add('dark');
          } catch(e) {}
        `}} />
      </head>
      <body className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-[#0d0f1a] font-sans transition-colors duration-200">
        <ThemeProvider>
          <DatosProvider>
            <Sidebar />
            {/* pb-16 en móvil: deja libre el alto de la barra inferior fija. */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden pb-16 md:pb-0">
              {children}
            </div>
            <BottomNav />
          </DatosProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
