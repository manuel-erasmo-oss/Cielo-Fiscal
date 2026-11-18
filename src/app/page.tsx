'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Building2, CircleAlert, HardDrive, MoreHorizontal, Pencil, Plus, ReceiptText, Search, ShieldAlert, Trash2 } from 'lucide-react'
import { ClienteModal } from '@/components/clientes/ClienteModal'
import { AvisoErrorCarga, Pagina } from '@/components/layout/Pagina'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Monograma } from '@/components/ui/Monograma'
import { Toast } from '@/components/ui/Toast'
import { useDatos } from '@/lib/datos/datos-context'
import { rutaEmpresa } from '@/lib/rutas'
import { cn, formatCedula, soloDigitos } from '@/lib/utils'
import { requiereVerificacionHumana } from '@/lib/verificacion-dgii'
import type { ClienteFiscal } from '@/types'

// Pantalla de entrada: "Tus empresas". El contador elige aquí la empresa con
// la que va a trabajar y solo entonces llega a los módulos (Facturas, Subir
// lote, Reportes), que quedan atados a esa empresa. Pedido por el usuario el
// 2026-11-18: separar los datos de cada empresa para no meter información de
// una en otra. Rediseño visual del mismo día ("estamos creando un producto
// premium y debe verse como tal"), con la paleta y la tipografía de la marca.

type Aviso = { mensaje: string; tipo: 'success' | 'error' }
type Filtro = 'todas' | 'por_revisar'
type Conteo = { total: number; pendientes: number; porVerificar: number }

function saludo(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

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
  // El saludo depende de la hora del navegador: se calcula al montar para
  // que el servidor y el navegador no dibujen textos distintos.
  const [hola, setHola] = useState('Hola')
  useEffect(() => { setHola(saludo()) }, [])

  const conteos = useMemo(() => {
    const mapa = new Map<string, Conteo>()
    for (const d of documentos) {
      const c = mapa.get(d.clienteId) ?? { total: 0, pendientes: 0, porVerificar: 0 }
      c.total += 1
      if (d.estadoRevision === 'pendiente_revision') {
        c.pendientes += 1
        if (requiereVerificacionHumana(d)) c.porVerificar += 1
      }
      mapa.set(d.clienteId, c)
    }
    return mapa
  }, [documentos])

  const totales = useMemo(() => {
    let pendientes = 0, porVerificar = 0
    for (const c of conteos.values()) { pendientes += c.pendientes; porVerificar += c.porVerificar }
    return { pendientes, porVerificar, conPendientes: clientes.filter(c => (conteos.get(c.id)?.pendientes ?? 0) > 0).length }
  }, [conteos, clientes])

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
    <Pagina title="Tus empresas">
      {errorCarga && <AvisoErrorCarga mensaje={errorCarga} />}

      {/* ── Encabezado de marca ───────────────────────────────────────── */}
      <section className="animate-content-in relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#151f66] via-[#1B2980] to-[#2f3fa8] px-5 py-6 text-white sm:py-7 shadow-[0_18px_40px_-18px_rgba(27,41,128,0.55)] sm:px-8">
        {/* Trazo del isotipo, como marca de agua */}
        <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="pointer-events-none absolute -right-10 -top-14 h-64 w-64 opacity-[0.09]">
          <circle cx="16" cy="16" r="9" strokeWidth="5.5" strokeDasharray="47.12 9.43" strokeLinecap="round" transform="rotate(30 16 16)" stroke="white" />
          <circle cx="16" cy="16" r="2.8" fill="white" />
        </svg>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-200/90">Espacio del contador</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] sm:text-[28px]">{hola}</h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-indigo-100/85">
              Elige la empresa con la que vas a trabajar.<span className="hidden sm:inline"> Cada una tiene sus facturas y sus reportes por separado.</span>
            </p>
          </div>
          <button
            onClick={() => setEnEdicion(null)}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#1B2980] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Plus className="h-4 w-4" /> Añadir empresa
          </button>
        </div>
        {clientes.length > 0 && (
          <dl className="relative mt-5 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-3">
            <Indicador icono={Building2} etiqueta="Empresas" valor={clientes.length} />
            <Indicador icono={CircleAlert} etiqueta="Facturas por revisar" valor={totales.pendientes} detalle={totales.conPendientes > 0 ? `en ${totales.conPendientes} empresa(s)` : undefined} />
            <Indicador icono={ShieldAlert} etiqueta="Por verificar en la DGII" valor={totales.porVerificar} />
          </dl>
        )}
      </section>

      {sinEmpresas ? (
        <section className="animate-content-in flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center dark:border-[#2e3355] dark:bg-[#141722]">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/50 dark:text-indigo-300">
            <Building2 className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <h2 className="mt-4 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Todavía no tienes empresas</h2>
          <p className="mt-1.5 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            Añade la primera empresa de tus clientes. Después entras en ella para subir sus facturas y generar sus reportes.
          </p>
          <button onClick={() => setEnEdicion(null)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#1B2980] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2f3fa8] dark:bg-indigo-600 dark:hover:bg-indigo-500">
            <Plus className="h-4 w-4" /> Añadir empresa
          </button>
        </section>
      ) : clientes.length > 0 && (
        <section className="animate-content-in space-y-3">
          {/* ── Barra de herramientas ─────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[240px] flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o RNC"
                aria-label="Buscar empresa"
                className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-3 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-[#1B2980] focus:outline-none focus:ring-4 focus:ring-[#1B2980]/10 dark:border-[#252840] dark:bg-[#141722] dark:text-zinc-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/15"
              />
            </div>
            <div role="radiogroup" aria-label="Filtrar empresas" className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 shadow-sm dark:border-[#252840] dark:bg-[#141722]">
              {([['todas', 'Todas', clientes.length], ['por_revisar', 'Por revisar', totales.conPendientes]] as const).map(([valor, texto, n]) => (
                <button
                  key={valor}
                  role="radio"
                  aria-checked={filtro === valor}
                  onClick={() => setFiltro(valor)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    filtro === valor
                      ? 'bg-[#1B2980] text-white shadow-sm dark:bg-indigo-600'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
                  )}
                >
                  {texto}
                  <span className={cn('rounded-md px-1.5 text-[11px] tabular-nums', filtro === valor ? 'bg-white/20' : 'bg-zinc-100 dark:bg-[#1a1d2e]')}>{n}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Lista de empresas ─────────────────────────────────────── */}
          <div className="overflow-visible rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-[#252840] dark:bg-[#141722] dark:shadow-none">
            <div className="hidden grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-6 border-b border-zinc-100 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:border-[#1d2035] dark:text-zinc-500 sm:grid">
              <span>Empresa</span>
              <span className="w-56">Estado</span>
              <span className="w-32 text-right">Acciones</span>
            </div>
            {visibles.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">Ninguna empresa coincide con la búsqueda.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-[#1d2035]">
                {visibles.map(c => (
                  <FilaEmpresa
                    key={c.id}
                    empresa={c}
                    conteo={conteos.get(c.id) ?? { total: 0, pendientes: 0, porVerificar: 0 }}
                    onEntrar={() => router.push(rutaEmpresa(c.id))}
                    menu={
                      <MenuAcciones
                        abierto={menuAbierto === c.id}
                        onAlternar={() => setMenuAbierto(m => (m === c.id ? null : c.id))}
                        onCerrar={() => setMenuAbierto(null)}
                        nombre={c.razonSocial}
                        onEditar={() => { setMenuAbierto(null); setEnEdicion(c) }}
                        onEliminar={() => { setMenuAbierto(null); setPorEliminar(c) }}
                      />
                    }
                  />
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-2.5 text-xs text-zinc-500 dark:border-[#1d2035] dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5" /> Datos guardados solo en este navegador
              </span>
              <span className="tabular-nums">{visibles.length} de {clientes.length}</span>
            </div>
          </div>
        </section>
      )}

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

function Indicador({ icono: Icono, etiqueta, valor, detalle }: { icono: typeof Building2; etiqueta: string; valor: number; detalle?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2.5 backdrop-blur-sm sm:px-4 sm:py-3">
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 sm:flex">
        <Icono className="h-4 w-4 text-indigo-100" />
      </span>
      <div className="min-w-0">
        <dt className="text-[10px] font-medium uppercase leading-tight tracking-[0.1em] text-indigo-200/80 sm:text-[11px] sm:tracking-[0.12em]">{etiqueta}</dt>
        <dd className="mt-0.5 flex items-baseline gap-2">
          <span className="text-lg font-semibold tabular-nums tracking-tight sm:text-xl">{valor}</span>
          {detalle && <span className="hidden truncate text-xs text-indigo-200/80 sm:inline">{detalle}</span>}
        </dd>
      </div>
    </div>
  )
}

function FilaEmpresa({ empresa: c, conteo, onEntrar, menu }: { empresa: ClienteFiscal; conteo: Conteo; onEntrar: () => void; menu: React.ReactNode }) {
  return (
    <li className="group relative grid grid-cols-1 gap-3 px-5 py-4 transition-colors hover:bg-[#f7f8fd] dark:hover:bg-[#171a2a] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6">
      <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-[#1B2980] opacity-0 transition-opacity group-hover:opacity-100 dark:bg-indigo-500" />
      <div className="flex min-w-0 items-center gap-3.5">
        <Monograma nombre={c.razonSocial} clave={c.id} />
        <div className="min-w-0">
          <Link href={rutaEmpresa(c.id)} className="block truncate text-[15px] font-semibold tracking-tight text-zinc-900 hover:text-[#1B2980] dark:text-zinc-100 dark:hover:text-indigo-300">
            {c.razonSocial}
          </Link>
          <p className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="tabular-nums">{formatCedula(c.rncCedula)}</span>
            <span className="text-zinc-300 dark:text-zinc-600">•</span>
            <span>{c.tipoPersona === 'juridica' ? 'Persona jurídica' : 'Persona física'}</span>
            {c.nombreComercial && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">•</span>
                <span className="truncate">{c.nombreComercial}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:w-56">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-[#1a1d2e] dark:text-zinc-300">
          <ReceiptText className="h-3 w-3" /> <span className="tabular-nums">{conteo.total}</span> {conteo.total === 1 ? 'factura' : 'facturas'}
        </span>
        {conteo.pendientes > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> <span className="tabular-nums">{conteo.pendientes}</span> por revisar
          </span>
        ) : conteo.total > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Al día
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-1 sm:w-32 sm:justify-end">
        <button
          onClick={onEntrar}
          aria-label={`Entrar a ${c.razonSocial}`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B2980] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#2f3fa8] hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B2980]/20 dark:bg-indigo-600 dark:hover:bg-indigo-500"
        >
          Entrar <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
        {menu}
      </div>
    </li>
  )
}

// Menú "…" de cada empresa: editar sus datos o eliminarla.
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
        className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-[#1a1d2e] dark:hover:text-zinc-200"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {abierto && (
        <div role="menu" className="animate-slide-in absolute right-0 top-full z-20 mt-1.5 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-xl shadow-zinc-900/10 dark:border-[#252840] dark:bg-[#141722] dark:shadow-black/40">
          <button role="menuitem" onClick={onEditar} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-[#1a1d2e]">
            <Pencil className="h-3.5 w-3.5 text-zinc-400" /> Editar datos
          </button>
          <button role="menuitem" onClick={onEliminar} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30">
            <Trash2 className="h-3.5 w-3.5" /> Eliminar empresa
          </button>
        </div>
      )}
    </div>
  )
}
