'use client'

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  titulo: string
  subtitulo?: string
  onClose: () => void
  children: ReactNode
  // Clase de ancho máximo del panel (por defecto, formulario angosto).
  ancho?: string
}

export function Modal({ titulo, subtitulo, onClose, children, ancho = 'max-w-lg' }: ModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Portal a <body>: renderizado dentro del contenido de la página heredaría
  // el margen de `space-y-*` y el fondo quedaría corrido.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={cn(
          'flex max-h-full w-full flex-col rounded-xl border border-zinc-200 dark:border-[#252840] bg-white dark:bg-[#141722] shadow-2xl animate-modal-in',
          ancho,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 dark:border-[#1d2035] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{subtitulo}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 dark:hover:bg-[#1a1d2e] dark:hover:text-zinc-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
