'use client'

import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { BTN_SECONDARY } from './clases'

interface ConfirmDialogProps {
  mensaje: string
  detalle?: string
  textoConfirmar: string
  onConfirm: () => void
  onCancel: () => void
}

// Confirmación para acciones que borran datos.
export function ConfirmDialog({ mensaje, detalle, textoConfirmar, onConfirm, onCancel }: ConfirmDialogProps) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in">
      <div role="alertdialog" aria-modal="true" className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 dark:border-[#252840] bg-white dark:bg-[#141722] p-6 shadow-2xl animate-modal-in">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{mensaje}</p>
            {detalle && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{detalle}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onCancel} className={BTN_SECONDARY}>Cancelar</button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 transition-colors"
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
