'use client'

import { useEffect, useState } from 'react'
import { HardDrive, ScanText } from 'lucide-react'
import { Pagina } from '@/components/layout/Pagina'
import { Toast } from '@/components/ui/Toast'
import { CARD_CLASS, INPUT_CLASS, LABEL_CLASS } from '@/components/ui/clases'
import { guardarCodigoOCR, leerCodigoOCR } from '@/lib/config-local'
import { useDatos } from '@/lib/datos/datos-context'
import { BTN_PRIMARY, cn } from '@/lib/utils'

export default function ConfiguracionPage() {
  const { clientes, documentos } = useDatos()
  const [codigo, setCodigo] = useState('')
  const [guardado, setGuardado] = useState('')
  const [aviso, setAviso] = useState<{ mensaje: string; tipo: 'success' | 'error' } | null>(null)

  useEffect(() => {
    const actual = leerCodigoOCR()
    setCodigo(actual)
    setGuardado(actual)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      guardarCodigoOCR(codigo)
      setGuardado(codigo.trim())
      setCodigo(codigo.trim())
      setAviso({ mensaje: codigo.trim() ? 'Código guardado' : 'Código eliminado', tipo: 'success' })
    } catch {
      setAviso({ mensaje: 'No se pudo guardar: el almacenamiento del navegador está bloqueado.', tipo: 'error' })
    }
  }

  return (
    <Pagina title="Configuración">
      <div className={cn(CARD_CLASS, 'max-w-2xl')}>
        <div className="flex items-start gap-3 border-b border-zinc-100 dark:border-[#1d2035] px-5 py-4">
          <ScanText className="mt-0.5 h-4 w-4 shrink-0 text-[#1B2980] dark:text-indigo-400" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Lectura automática de facturas</h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Para leer facturas con IA necesitas el código de acceso que te entregó quien administra el sistema.
              Sin código puedes seguir capturando facturas a mano.
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <label htmlFor="codigo-ocr" className={LABEL_CLASS}>Código de acceso</label>
            <input
              id="codigo-ocr"
              type="password"
              autoComplete="off"
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <button type="submit" disabled={codigo.trim() === guardado} className={BTN_PRIMARY}>Guardar</button>
        </form>
        <p className="px-5 pb-4 text-xs text-zinc-500 dark:text-zinc-400">
          {guardado
            ? 'Hay un código guardado en este navegador. Se comprueba al leer la próxima factura.'
            : 'No hay código guardado en este navegador.'}
        </p>
      </div>

      <div className={cn(CARD_CLASS, 'max-w-2xl')}>
        <div className="flex items-start gap-3 px-5 py-4">
          <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-[#1B2980] dark:text-indigo-400" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Dónde viven tus datos</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Tus {clientes.length} cliente(s) y {documentos.length} factura(s) están guardados solo en este navegador.
              No se sincronizan con otros equipos ni navegadores, y se pierden si borras los datos del sitio.
              Los archivos de las facturas se envían al servidor únicamente para leerlos y no se conservan.
            </p>
          </div>
        </div>
      </div>

      {aviso && <Toast message={aviso.mensaje} type={aviso.tipo} onClose={() => setAviso(null)} />}
    </Pagina>
  )
}
