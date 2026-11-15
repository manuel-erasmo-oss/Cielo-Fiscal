'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { ClienteModal } from '@/components/clientes/ClienteModal'
import { AvisoErrorCarga, Pagina } from '@/components/layout/Pagina'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Toast } from '@/components/ui/Toast'
import { CARD_CLASS, TH_CLASS } from '@/components/ui/clases'
import { useDatos } from '@/lib/datos/datos-context'
import { BTN_PRIMARY, cn, formatCedula } from '@/lib/utils'
import type { ClienteFiscal } from '@/types'

type Aviso = { mensaje: string; tipo: 'success' | 'error' }

export default function ClientesPage() {
  const { listo, errorCarga, clientes, documentos, guardarCliente, eliminarCliente } = useDatos()
  // undefined = modal cerrado; null = cliente nuevo.
  const [enEdicion, setEnEdicion] = useState<ClienteFiscal | null | undefined>(undefined)
  const [porEliminar, setPorEliminar] = useState<ClienteFiscal | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)

  const conteos = useMemo(() => {
    const mapa = new Map<string, { total: number; pendientes: number }>()
    for (const d of documentos) {
      const c = mapa.get(d.clienteId) ?? { total: 0, pendientes: 0 }
      c.total += 1
      if (d.estadoRevision === 'pendiente_revision') c.pendientes += 1
      mapa.set(d.clienteId, c)
    }
    return mapa
  }, [documentos])

  const ordenados = useMemo(
    () => [...clientes].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es')),
    [clientes],
  )

  async function handleGuardar(cliente: ClienteFiscal) {
    const esNuevo = enEdicion === null
    await guardarCliente(cliente)
    setEnEdicion(undefined)
    setAviso({ mensaje: esNuevo ? 'Cliente creado' : 'Cambios guardados', tipo: 'success' })
  }

  async function handleEliminar() {
    if (!porEliminar) return
    const objetivo = porEliminar
    setPorEliminar(null)
    try {
      await eliminarCliente(objetivo.id)
      setAviso({ mensaje: 'Cliente eliminado', tipo: 'success' })
    } catch (err) {
      setAviso({ mensaje: err instanceof Error ? err.message : 'No se pudo eliminar.', tipo: 'error' })
    }
  }

  const facturasDelObjetivo = porEliminar ? conteos.get(porEliminar.id)?.total ?? 0 : 0

  return (
    <Pagina
      title="Clientes"
      subtitle="Empresas y personas cuya contabilidad gestionas"
      actions={
        <button onClick={() => setEnEdicion(null)} className={BTN_PRIMARY}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nuevo cliente</span>
        </button>
      }
    >
      {errorCarga && <AvisoErrorCarga mensaje={errorCarga} />}

      {listo && !errorCarga && clientes.length === 0 && (
        <EmptyState
          icon={Users}
          title="Todavía no tienes clientes"
          message="Crea el primero para empezar a registrar sus facturas de compras y ventas."
          action={{ label: 'Nuevo cliente', onClick: () => setEnEdicion(null) }}
        />
      )}

      {ordenados.length > 0 && (
        <div className={cn(CARD_CLASS, 'overflow-hidden')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-[#1d2035] bg-zinc-50 dark:bg-[#1a1d2e]">
                  <th className={cn(TH_CLASS, 'text-left pl-5')}>Cliente</th>
                  <th className={cn(TH_CLASS, 'text-left')}>RNC / Cédula</th>
                  <th className={cn(TH_CLASS, 'text-left')}>Tipo</th>
                  <th className={cn(TH_CLASS, 'text-right')}>Facturas</th>
                  <th className={TH_CLASS}><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50 dark:divide-[#1d2035]">
                {ordenados.map(c => {
                  const conteo = conteos.get(c.id) ?? { total: 0, pendientes: 0 }
                  return (
                    <tr key={c.id} className="hover:bg-[#eef0fb]/30 dark:hover:bg-indigo-950/20 transition-colors">
                      <td className="px-4 py-3.5 pl-5">
                        <Link href={`/facturas?cliente=${c.id}`} className="font-medium text-[#1B2980] dark:text-indigo-400 hover:underline">
                          {c.razonSocial}
                        </Link>
                        {c.nombreComercial && (
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">{c.nombreComercial}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {formatCedula(c.rncCedula)}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {c.tipoPersona === 'juridica' ? 'Jurídica' : 'Física'}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <span className="tabular-nums text-zinc-700 dark:text-zinc-300">{conteo.total}</span>
                        {conteo.pendientes > 0 && (
                          <Badge variant="warning" className="ml-2">{conteo.pendientes} por revisar</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEnEdicion(c)}
                          title="Editar cliente"
                          aria-label={`Editar ${c.razonSocial}`}
                          className="rounded-lg p-1.5 text-zinc-400 hover:text-[#1B2980] hover:bg-[#eef0fb] dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setPorEliminar(c)}
                          title="Eliminar cliente"
                          aria-label={`Eliminar ${c.razonSocial}`}
                          className="rounded-lg p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {enEdicion !== undefined && (
        <ClienteModal
          cliente={enEdicion}
          existentes={clientes}
          onGuardar={handleGuardar}
          onClose={() => setEnEdicion(undefined)}
        />
      )}

      {porEliminar && (
        <ConfirmDialog
          mensaje={`¿Eliminar a ${porEliminar.razonSocial}?`}
          detalle={
            facturasDelObjetivo > 0
              ? `También se eliminarán sus ${facturasDelObjetivo} factura(s). No se puede deshacer.`
              : 'No se puede deshacer.'
          }
          textoConfirmar="Eliminar"
          onConfirm={handleEliminar}
          onCancel={() => setPorEliminar(null)}
        />
      )}

      {aviso && <Toast message={aviso.mensaje} type={aviso.tipo} onClose={() => setAviso(null)} />}
    </Pagina>
  )
}
