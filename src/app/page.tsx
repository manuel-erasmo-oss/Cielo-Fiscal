'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, HardDrive, LogIn, MoreVertical, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { ClienteModal } from '@/components/clientes/ClienteModal'
import { AvisoErrorCarga, Pagina } from '@/components/layout/Pagina'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Toast } from '@/components/ui/Toast'
import { CARD_CLASS, INPUT_CLASS, TH_CLASS } from '@/components/ui/clases'
import { useDatos } from '@/lib/datos/datos-context'
import { rutaEmpresa } from '@/lib/rutas'
import { BTN_PRIMARY, cn, formatCedula, soloDigitos } from '@/lib/utils'
import type { ClienteFiscal } from '@/types'

// Pantalla de entrada: "Tus empresas". El contador elige aquí la empresa con
// la que va a trabajar y solo entonces llega a los módulos (Facturas, Subir
// lote, Reportes), que quedan atados a esa empresa. Pedido por el usuario el
// 2026-11-18, con una pantalla de referencia de otro producto: separar los
// datos de cada empresa para no meter información de una en otra.

type Aviso = { mensaje: string; tipo: 'success' | 'error' }
type Filtro = 'todas' | 'por_revisar'

export default function TusEmpresasPage() {
  const router = useRouter()
  const { listo, errorCarga, clientes, documentos, guardarCliente, eliminarCliente } = useDatos()
  // undefined = modal cerrado; null = empresa nueva.
  const [enEdicion, setEnEdicion] = useState<ClienteFiscal | null | undefined>(undefined)
  const [porEliminar, setPorEliminar] = useState<ClienteFiscal | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null)

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

  // Búsqueda por nombre, nombre comercial o RNC (con o sin guiones).
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    const digitos = soloDigitos(busqueda)
    return [...clientes]
      .filter(c =>
        (!texto ||
          c.razonSocial.toLowerCase().includes(texto) ||
          (c.nombreComercial ?? '').toLowerCase().includes(texto) ||
          (digitos.length > 0 && c.rncCedula.includes(digitos))) &&
        (filtro === 'todas' || (conteos.get(c.id)?.pendientes ?? 0) > 0),
      )
      .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es'))
  }, [clientes, busqueda, filtro, conteos])

  async function handleGuardar(cliente: ClienteFiscal) {
    const esNueva = enEdicion === null
    await guardarCliente(cliente)
    setEnEdicion(undefined)
    setAviso({ mensaje: esNueva ? `Empresa añadida: ${cliente.razonSocial}` : 'Cambios guardados', tipo: 'success' })
  }

  async function handleEliminar() {
    if (!porEliminar) return
    const objetivo = porEliminar
    setPorEliminar(null)
    try {
      await eliminarCliente(objetivo.id)
      setAviso({ mensaje: 'Empresa eliminada', tipo: 'success' })
    } catch (err) {
      setAviso({ mensaje: err instanceof Error ? err.message : 'No se pudo eliminar.', tipo: 'error' })
    }
  }

  const facturasDelObjetivo = porEliminar ? conteos.get(porEliminar.id)?.total ?? 0 : 0
  const sinEmpresas = listo && !errorCarga && clientes.length === 0

  return (
    <Pagina title="Tus empresas" subtitle="Elige la empresa con la que vas a trabajar">
      {errorCarga && <AvisoErrorCarga mensaje={errorCarga} />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Espacio del contador</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Gestiona las empresas de tus clientes en un solo lugar. Cada una tiene sus facturas y reportes por separado.
          </p>
        </div>
        <button onClick={() => setEnEdicion(null)} className={BTN_PRIMARY}>
          <Plus className="h-4 w-4" /> Añadir empresa
        </button>
      </div>

      {sinEmpresas ? (
        <EmptyState
          icon={Building2}
          title="Todavía no tienes empresas"
          message="Añade la primera empresa de tus clientes. Después entras en ella para subir sus facturas y generar sus reportes."
          action={{ label: 'Añadir empresa', onClick: () => setEnEdicion(null) }}
        />
      ) : clientes.length > 0 && (
        <div className={cn(CARD_CLASS, 'overflow-visible')}>
          <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-4 py-3 dark:border-[#1d2035]">
            <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o RNC"
                aria-label="Buscar empresa"
                className={cn(INPUT_CLASS, 'pl-9')}
              />
            </div>
            <div className="w-full sm:w-60">
              <select value={filtro} onChange={e => setFiltro(e.target.value as Filtro)} aria-label="Filtrar empresas" className={INPUT_CLASS}>
                <option value="todas">Todas</option>
                <option value="por_revisar">Con facturas por revisar</option>
              </select>
            </div>
          </div>

          {visibles.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">Ninguna empresa coincide con la búsqueda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50 dark:border-[#1d2035] dark:bg-[#1a1d2e]">
                    <th className={cn(TH_CLASS, 'pl-5 text-left')}>Empresa / RNC o cédula</th>
                    <th className={cn(TH_CLASS, 'text-left')}>Facturas</th>
                    <th className={cn(TH_CLASS, 'pr-5 text-right')}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-[#1d2035]">
                  {visibles.map(c => {
                    const conteo = conteos.get(c.id) ?? { total: 0, pendientes: 0 }
                    return (
                      <tr key={c.id} className="transition-colors hover:bg-[#eef0fb]/30 dark:hover:bg-indigo-950/20">
                        <td className="py-3.5 pl-5 pr-4">
                          <Link href={rutaEmpresa(c.id)} className="font-semibold text-zinc-900 hover:text-[#1B2980] hover:underline dark:text-zinc-100 dark:hover:text-indigo-400">
                            {c.razonSocial}
                          </Link>
                          <p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                            {formatCedula(c.rncCedula)}
                            {c.nombreComercial && <span className="ml-2 not-italic">· {c.nombreComercial}</span>}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <span className="tabular-nums text-zinc-700 dark:text-zinc-300">{conteo.total}</span>
                          {conteo.pendientes > 0 && <Badge variant="warning" className="ml-2">{conteo.pendientes} por revisar</Badge>}
                        </td>
                        <td className="whitespace-nowrap py-3.5 pl-4 pr-5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => router.push(rutaEmpresa(c.id))}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B2980] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#2f3fa8] dark:bg-indigo-600 dark:hover:bg-indigo-500"
                              aria-label={`Entrar a ${c.razonSocial}`}
                            >
                              <LogIn className="h-3.5 w-3.5" /> Entrar
                            </button>
                            <MenuAcciones
                              abierto={menuAbierto === c.id}
                              onAlternar={() => setMenuAbierto(m => (m === c.id ? null : c.id))}
                              onCerrar={() => setMenuAbierto(null)}
                              nombre={c.razonSocial}
                              onEditar={() => { setMenuAbierto(null); setEnEdicion(c) }}
                              onEliminar={() => { setMenuAbierto(null); setPorEliminar(c) }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-zinc-100 px-5 py-2.5 text-right text-xs text-zinc-500 dark:border-[#1d2035] dark:text-zinc-400">
            {visibles.length} de {clientes.length} empresa(s)
          </p>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-[#eef0fb] px-5 py-4 dark:border-indigo-900/40 dark:bg-indigo-950/30">
        <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-[#1B2980] dark:text-indigo-300" />
        <p className="text-xs text-[#151f66] dark:text-indigo-200">
          <strong>Tus datos se guardan solo en este navegador.</strong> No se sincronizan con otros equipos y se pierden si
          borras los datos del sitio.
        </p>
      </div>

      {enEdicion !== undefined && (
        <ClienteModal cliente={enEdicion} existentes={clientes} onGuardar={handleGuardar} onClose={() => setEnEdicion(undefined)} />
      )}

      {porEliminar && (
        <ConfirmDialog
          mensaje={`¿Eliminar la empresa ${porEliminar.razonSocial}?`}
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

// Menú "⋮" de cada empresa: editar sus datos o eliminarla.
function MenuAcciones({ abierto, onAlternar, onCerrar, nombre, onEditar, onEliminar }: {
  abierto: boolean
  onAlternar: () => void
  onCerrar: () => void
  nombre: string
  onEditar: () => void
  onEliminar: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onCerrar() }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', escape) }
  }, [abierto, onCerrar])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onAlternar}
        aria-label={`Más acciones de ${nombre}`}
        aria-expanded={abierto}
        className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-[#1a1d2e] dark:hover:text-zinc-200"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-[#252840] dark:bg-[#141722]">
          <button role="menuitem" onClick={onEditar} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-[#1a1d2e]">
            <Pencil className="h-3.5 w-3.5" /> Editar datos
          </button>
          <button role="menuitem" onClick={onEliminar} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30">
            <Trash2 className="h-3.5 w-3.5" /> Eliminar empresa
          </button>
        </div>
      )}
    </div>
  )
}
