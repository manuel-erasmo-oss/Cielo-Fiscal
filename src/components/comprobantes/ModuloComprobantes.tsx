'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCheck, Download, ReceiptText, Search, ShieldCheck, Sparkles, Trash2, TrendingUp, Users, X } from 'lucide-react'
import { FacturaModal } from '@/components/facturas/FacturaModal'
import { AvisoErrorCarga, Pagina } from '@/components/layout/Pagina'
import { AccionSugerida } from '@/components/ui/premium'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Toast } from '@/components/ui/Toast'
import { BTN_SECONDARY, CARD_CLASS, TH_CLASS } from '@/components/ui/clases'
import {
  AgregarFacturas, BarraDinero, Casilla, EstadoFactura, MenuFila, Paginacion, PildoraClasificacion, ThOrden,
} from '@/components/comprobantes/piezas'
import {
  ESTADOS_FILA, ETIQUETA_ESTADO_FILA, FILTROS_VACIOS, ORDEN_INICIAL, agruparPorContraparte,
  csvDeComprobantes, esAprobable, filtrarComprobantes, hayFiltros as hayFiltrosEn, ordenarComprobantes,
  fechaCorta, ordenarContrapartes, paginar, resumenPorEstado, signoDe, totalDe, totalesDe,
  type CampoOrden, type CampoOrdenContraparte, type EstadoFila, type FiltroClasificacion, type Filtros, type Orden,
} from '@/lib/comprobantes'
import { rutaEmpresa, useEmpresaActiva } from '@/lib/datos/empresa-context'
import { TIPO_INGRESO_607, esNotaDeCredito } from '@/lib/dgii-formatos'
import { montoFacturadoDe } from '@/lib/documentos'
import { MODULO_DE } from '@/lib/modulos'
import { BTN_PRIMARY, cn, formatCedula, formatDate, formatNum, formatRD, hoyLocalISO, soloDigitos } from '@/lib/utils'
import { VerificacionError, verificarEnDGII } from '@/lib/verificacion-cliente'
import { problemaVerificacion, requiereVerificacionHumana } from '@/lib/verificacion-dgii'
import type { DocumentoFiscal, TipoDocumento } from '@/types'

// Módulos "Ingresos" (ventas, reporte de ingresos) y "Costos y gastos"
// (compras, Formato 606). Pedido por el usuario el 2026-11-18: reemplazan al
// módulo "Facturas", con el aire de los módulos de ventas y gastos de un ERP
// contable: barra de dinero por estado, pestaña de proveedores o clientes,
// tabla con selección, acciones en grupo, orden y paginación. La lógica
// (filtros, orden, totales, CSV) está en src/lib/comprobantes.ts.

type Aviso = { mensaje: string; tipo: 'success' | 'error' }
type Pestana = 'facturas' | 'contrapartes'

const SUBTITULO: Record<TipoDocumento, string> = {
  compra: 'Compras de bienes y servicios para el Formato 606',
  venta: 'Ventas que forman el reporte de ingresos',
}

// Dirección con que arranca cada columna al tocarla por primera vez.
const DIR_INICIAL: Record<CampoOrden, 'asc' | 'desc'> = { fecha: 'desc', contraparte: 'asc', total: 'desc' }
const DIR_INICIAL_CONTRAPARTE: Record<CampoOrdenContraparte, 'asc' | 'desc'> = { nombre: 'asc', cantidad: 'desc', monto: 'desc', itbis: 'desc', ultimaFecha: 'desc', porRevisar: 'desc' }

const CONTROL = 'h-10 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow focus:border-[#1B2980]/50 focus:outline-none focus:ring-4 focus:ring-[#1B2980]/10 dark:border-[#252840] dark:bg-[#141722] dark:text-zinc-100 dark:shadow-none dark:[color-scheme:dark] dark:focus:border-indigo-500 dark:focus:ring-indigo-500/15'

// Montos con signo: las notas de crédito restan y se ven en negativo.
// En la tabla de computadora la moneda va en el encabezado ("RD$") y las
// celdas solo con el número, como en los libros contables.
function Monto({ valor, signo, fuerte = false, sinMoneda = false }: { valor: number | null; signo: 1 | -1; fuerte?: boolean; sinMoneda?: boolean }) {
  if (valor === null) return <span className="text-zinc-300 dark:text-zinc-600">—</span>
  return (
    <span className={cn('tabular-nums', signo < 0 ? 'text-rose-600 dark:text-rose-400' : fuerte ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-700 dark:text-zinc-300')}>
      {sinMoneda ? formatNum(signo * valor) : formatRD(signo * valor)}
    </span>
  )
}

const nombreTipoIngreso = (codigo: string | null) => TIPO_INGRESO_607.find(o => o.codigo === codigo)?.nombre ?? null

export function ModuloComprobantes({ tipo }: { tipo: TipoDocumento }) {
  // Solo la empresa en la que se entró: sus facturas y nada más (ver empresa-context).
  const { errorCarga, empresa, documentos, guardarDocumento, guardarDocumentos, eliminarDocumento, obtenerArchivo } = useEmpresaActiva()
  const clientes = useMemo(() => [empresa], [empresa])
  const modulo = MODULO_DE[tipo]
  const compra = tipo === 'compra'

  const [pestana, setPestana] = useState<Pestana>('facturas')
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL)
  const [pagina, setPagina] = useState(1)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [busquedaContraparte, setBusquedaContraparte] = useState('')
  const [ordenContraparte, setOrdenContraparte] = useState<Orden<CampoOrdenContraparte>>({ campo: 'monto', dir: 'desc' })
  // undefined = modal cerrado; null = factura nueva.
  const [enEdicion, setEnEdicion] = useState<DocumentoFiscal | null | undefined>(undefined)
  const [porEliminar, setPorEliminar] = useState<DocumentoFiscal[] | null>(null)
  const [porAprobar, setPorAprobar] = useState<DocumentoFiscal[] | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [progresoDGII, setProgresoDGII] = useState<{ hechas: number; total: number } | null>(null)

  // Al cambiar filtros u orden se vuelve a la primera página y se suelta la selección.
  useEffect(() => { setPagina(1); setSeleccion(new Set()) }, [filtros, orden])

  const delModulo = useMemo(() => documentos.filter(d => d.tipo === tipo), [documentos, tipo])
  const filtrados = useMemo(() => ordenarComprobantes(filtrarComprobantes(documentos, tipo, filtros), orden), [documentos, tipo, filtros, orden])
  // La barra de dinero cuenta todos los estados con los demás filtros puestos.
  const resumen = useMemo(() => resumenPorEstado(filtrarComprobantes(documentos, tipo, filtros, 'estado')), [documentos, tipo, filtros])
  const totales = useMemo(() => totalesDe(filtrados), [filtrados])
  const vista = useMemo(() => paginar(filtrados, pagina), [filtrados, pagina])
  const contrapartes = useMemo(() => agruparPorContraparte(delModulo), [delModulo])
  const contraparteFiltrada = filtros.contraparte ? contrapartes.find(c => c.clave === filtros.contraparte) : undefined
  const hayFiltros = hayFiltrosEn(filtros)

  const rnc = empresa.rncCedula
  const aprobables = useMemo(() => filtrados.filter(d => esAprobable(d, rnc)), [filtrados, rnc])
  // Facturas de la lista con código QR de e-CF: se pueden (re)verificar en la
  // DGII. El estado puede cambiar (por ejemplo, de "en proceso" a aceptado).
  const verificables = useMemo(() => filtrados.filter(d => d.qrUrl), [filtrados])
  const seleccionadas = useMemo(() => filtrados.filter(d => seleccion.has(d.id)), [filtrados, seleccion])
  const aprobablesSeleccionadas = useMemo(() => seleccionadas.filter(d => esAprobable(d, rnc)), [seleccionadas, rnc])

  const meses = useMemo(() => [...new Set(delModulo.map(d => d.fechaComprobante?.slice(0, 7)).filter((m): m is string => !!m))].sort().reverse(), [delModulo])

  const filasContrapartes = useMemo(() => {
    const q = busquedaContraparte.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const digitos = soloDigitos(busquedaContraparte)
    const lista = q
      ? contrapartes.filter(c =>
        (c.nombre ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q) ||
        (digitos.length >= 3 && /^[\d\s-]+$/.test(busquedaContraparte.trim()) && (c.rnc ?? '').includes(digitos)))
      : contrapartes
    return ordenarContrapartes(lista, ordenContraparte)
  }, [contrapartes, busquedaContraparte, ordenContraparte])

  const cambiar = (cambio: Partial<Filtros>) => setFiltros(f => ({ ...f, ...cambio }))

  function ordenarPor(campo: CampoOrden) {
    setOrden(o => (o.campo === campo ? { campo, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: DIR_INICIAL[campo] }))
  }
  function ordenarContrapartesPor(campo: CampoOrdenContraparte) {
    setOrdenContraparte(o => (o.campo === campo ? { campo, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: DIR_INICIAL_CONTRAPARTE[campo] }))
  }

  function alternar(id: string) {
    setSeleccion(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  const paginaMarcada = vista.items.length > 0 && vista.items.every(d => seleccion.has(d.id))
  const paginaMixta = vista.items.some(d => seleccion.has(d.id))
  function alternarPagina() {
    setSeleccion(s => {
      const n = new Set(s)
      for (const d of vista.items) {
        if (paginaMarcada) n.delete(d.id)
        else n.add(d.id)
      }
      return n
    })
  }

  async function verificarEnLaDGII() {
    const cola = [...verificables]
    const actualizadas: DocumentoFiscal[] = []
    let fallidas = 0
    let detener: string | null = null
    setProgresoDGII({ hechas: 0, total: cola.length })
    async function trabajador() {
      while (cola.length > 0 && !detener) {
        const d = cola.shift()!
        try {
          const r = await verificarEnDGII(d.qrUrl!)
          const ahora = new Date().toISOString()
          const verificacionDGII = { estado: r.estado, texto: r.texto, consultadoEn: ahora }
          // Aceptada: el NCF (que viene del QR) ya no necesita que una persona lo verifique.
          const camposIncompletos = !requiereVerificacionHumana({ ncf: d.ncf, verificacionDGII }) && problemaVerificacion({ ...d, verificacionDGII }) === null
            ? d.camposIncompletos.filter(c => c !== 'ncf')
            : d.camposIncompletos
          actualizadas.push({ ...d, verificacionDGII, camposIncompletos, actualizadoEn: ahora })
        } catch (e) {
          if (e instanceof VerificacionError && e.detenerTodo) detener = e.message
          else fallidas++
        }
        setProgresoDGII(p => (p ? { ...p, hechas: p.hechas + 1 } : p))
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, cola.length) }, trabajador))
    setProgresoDGII(null)
    try {
      if (actualizadas.length > 0) await guardarDocumentos(actualizadas)
    } catch (err) {
      setAviso({ mensaje: err instanceof Error ? err.message : 'No se pudo guardar la verificación.', tipo: 'error' })
      return
    }
    const malas = actualizadas.filter(d => d.verificacionDGII && ['rechazado', 'no_encontrado'].includes(d.verificacionDGII.estado)).length
    if (detener) setAviso({ mensaje: `No se pudo verificar: ${detener}`, tipo: 'error' })
    else setAviso({
      mensaje: `${actualizadas.length} verificada(s) en la DGII` +
        (malas > 0 ? ` · ${malas} rechazada(s) o inexistente(s)` : '') +
        (fallidas > 0 ? ` · ${fallidas} sin respuesta` : ''),
      tipo: malas > 0 || fallidas > 0 ? 'error' : 'success',
    })
  }

  async function aprobar(lista: DocumentoFiscal[]) {
    setPorAprobar(null)
    const ahora = new Date().toISOString()
    try {
      await guardarDocumentos(lista.map(d => ({ ...d, estadoRevision: 'revisado' as const, revisadoEn: ahora, actualizadoEn: ahora })))
      setSeleccion(new Set())
      setAviso({ mensaje: `${lista.length} factura(s) aprobadas`, tipo: 'success' })
    } catch (err) {
      setAviso({ mensaje: err instanceof Error ? err.message : 'No se pudieron aprobar.', tipo: 'error' })
    }
  }

  async function eliminar(lista: DocumentoFiscal[]) {
    setPorEliminar(null)
    let hechas = 0
    try {
      for (const d of lista) {
        await eliminarDocumento(d.id)
        hechas++
      }
      setSeleccion(new Set())
      setAviso({ mensaje: lista.length === 1 ? 'Factura eliminada' : `${hechas} facturas eliminadas`, tipo: 'success' })
    } catch (err) {
      setAviso({ mensaje: `${hechas > 0 ? `Se eliminaron ${hechas}. ` : ''}${err instanceof Error ? err.message : 'No se pudo eliminar.'}`, tipo: 'error' })
    }
  }

  function exportarCSV(lista: DocumentoFiscal[]) {
    const blob = new Blob([csvDeComprobantes(lista, tipo)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${compra ? 'Costos_y_gastos' : 'Ingresos'}_${empresa.rncCedula}_${hoyLocalISO()}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function handleGuardar(documento: DocumentoFiscal, archivo?: Blob) {
    await guardarDocumento(documento, archivo)
    setEnEdicion(undefined)
    const otro = MODULO_DE[documento.tipo]
    setAviso(documento.tipo !== tipo
      ? { mensaje: `Se guardó como ${documento.tipo}: está en ${otro.nombre}`, tipo: 'success' }
      : { mensaje: documento.estadoRevision === 'revisado' ? 'Factura guardada como revisada' : 'Factura guardada como pendiente', tipo: 'success' })
  }

  function verFacturasDe(clave: string) {
    setFiltros({ ...FILTROS_VACIOS, contraparte: clave })
    setPestana('facturas')
  }

  const etiquetaFila = (d: DocumentoFiscal) => `factura ${d.ncf ?? 'sin NCF'}`
  const nombreDe = (d: DocumentoFiscal) =>
    d.nombreContraparte ?? (!compra && !d.rncCedulaContraparte ? 'Consumidor final' : null)

  return (
    <Pagina
      title={modulo.nombre}
      subtitle={SUBTITULO[tipo]}
      actions={<AgregarFacturas hrefLote={rutaEmpresa(empresa.id, `${modulo.seccion}/lote`)} onUna={() => setEnEdicion(null)} />}
    >
      {errorCarga && <AvisoErrorCarga mensaje={errorCarga} />}

      {delModulo.length === 0 ? (
        <EmptyState
          icon={compra ? ReceiptText : TrendingUp}
          title={compra ? 'Todavía no hay costos ni gastos' : 'Todavía no hay ingresos'}
          message={compra
            ? 'Usa “Agregar facturas”, arriba: una factura de compra suelta o un lote completo. El sistema leerá sus datos para el 606.'
            : 'Usa “Agregar facturas”, arriba: una factura de venta suelta o un lote completo. El sistema leerá sus datos para el reporte de ingresos.'}
          // Sin botón propio: "Agregar facturas" ya está arriba (cada opción una sola vez).
        />
      ) : (
        <>
          <BarraDinero resumen={resumen} activo={filtros.estado} onElegir={estado => { cambiar({ estado }); setPestana('facturas') }} />

          {/* ── Pestañas ───────────────────────────────────────────────── */}
          <div role="tablist" aria-label={modulo.nombre} className="flex items-center gap-6 border-b border-zinc-200 dark:border-[#252840]">
            {([
              ['facturas', 'Facturas', ReceiptText, delModulo.length],
              ['contrapartes', modulo.contrapartes, Users, contrapartes.length],
            ] as const).map(([valor, texto, Icono, cuenta]) => (
              <button
                key={valor}
                role="tab"
                type="button"
                aria-selected={pestana === valor}
                onClick={() => setPestana(valor)}
                className={cn(
                  '-mb-px inline-flex items-center gap-2 border-b-2 px-0.5 pb-2.5 pt-1 text-sm font-semibold transition-colors',
                  pestana === valor
                    ? 'border-[#1B2980] text-[#1B2980] dark:border-indigo-400 dark:text-indigo-300'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200',
                )}
              >
                <Icono className="h-4 w-4" />
                {texto}
                <span className={cn('rounded-md px-1.5 text-[11px] tabular-nums', pestana === valor ? 'bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/60 dark:text-indigo-300' : 'bg-zinc-100 text-zinc-500 dark:bg-[#1a1d2e] dark:text-zinc-400')}>{cuenta}</span>
              </button>
            ))}
          </div>

          {pestana === 'facturas' ? (
            <>
              {/* ── Barra de herramientas ─────────────────────────────── */}
              <section className="animate-content-in flex flex-wrap items-center gap-2">
                <label className="relative w-full sm:w-72">
                  <span className="sr-only">Buscar</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="search"
                    value={filtros.busqueda}
                    onChange={e => cambiar({ busqueda: e.target.value })}
                    placeholder={`Buscar ${modulo.contraparte.toLowerCase()}, RNC o NCF`}
                    className={cn(CONTROL, 'w-full pl-9 pr-3 placeholder:text-zinc-400')}
                  />
                </label>
                <select aria-label="Estado" value={filtros.estado} onChange={e => cambiar({ estado: e.target.value as EstadoFila | '' })} className={cn(CONTROL, 'px-3')}>
                  <option value="">Todos los estados</option>
                  {ESTADOS_FILA.map(e => <option key={e} value={e}>{ETIQUETA_ESTADO_FILA[e]} ({resumen[e].cantidad})</option>)}
                </select>
                <select aria-label="Mes" value={filtros.periodo} onChange={e => cambiar({ periodo: e.target.value })} className={cn(CONTROL, 'px-3')}>
                  <option value="">Todos los meses</option>
                  {meses.map(m => (
                    <option key={m} value={m}>{new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })}</option>
                  ))}
                </select>
                {compra && (
                  <select aria-label="Clasificación" value={filtros.clasificacion} onChange={e => cambiar({ clasificacion: e.target.value as FiltroClasificacion })} className={cn(CONTROL, 'px-3')}>
                    <option value="">Toda clasificación</option>
                    <option value="Costo">Costo</option>
                    <option value="Gasto">Gasto</option>
                    <option value="Activo">Activo</option>
                    <option value="sin">Sin clasificar</option>
                  </select>
                )}
                {filtros.contraparte && (
                  <span className="inline-flex h-10 max-w-full items-center gap-1.5 rounded-xl bg-[#eef0fb] pl-3 pr-1.5 text-sm font-medium text-[#1B2980] dark:bg-indigo-950/50 dark:text-indigo-300">
                    <span className="truncate">{modulo.contraparte}: {contraparteFiltrada?.nombre ?? (contraparteFiltrada?.rnc ? formatCedula(contraparteFiltrada.rnc) : compra ? 'Sin identificar' : 'Consumidor final')}</span>
                    <button type="button" onClick={() => cambiar({ contraparte: '' })} aria-label={`Quitar filtro de ${modulo.contraparte.toLowerCase()}`} className="rounded-md p-1 hover:bg-white/70 dark:hover:bg-indigo-900/50">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
                {hayFiltros && (
                  <button onClick={() => setFiltros(FILTROS_VACIOS)} className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-[#1a1d2e] dark:hover:text-zinc-200">
                    <X className="h-3.5 w-3.5" /> Quitar filtros
                  </button>
                )}
              </section>

              {/* ── Acciones sugeridas ────────────────────────────────── */}
              {aprobables.length > 0 && (
                <AccionSugerida
                  icono={Sparkles}
                  tono="marca"
                  texto={<><strong className="font-semibold">{aprobables.length} {aprobables.length === 1 ? 'factura está lista' : 'facturas están listas'}</strong> para aprobar: el sistema leyó todos los datos, cuadran y no quedó ninguno en duda.</>}
                  accion={
                    <button onClick={() => setPorAprobar(aprobables)} className={BTN_PRIMARY}>
                      <CheckCheck className="h-4 w-4" />
                      Aprobar las {aprobables.length}
                    </button>
                  }
                />
              )}
              {verificables.length > 0 && (
                <AccionSugerida
                  icono={ShieldCheck}
                  tono="neutro"
                  texto={progresoDGII
                    ? <>Verificando en la DGII: <strong className="font-semibold tabular-nums">{progresoDGII.hechas} de {progresoDGII.total}</strong>…</>
                    : <><strong className="font-semibold">{verificables.length}</strong> {verificables.length === 1 ? 'factura electrónica tiene' : 'facturas electrónicas tienen'} código QR y se {verificables.length === 1 ? 'puede' : 'pueden'} consultar en la DGII.</>}
                  progreso={progresoDGII ? progresoDGII.hechas / Math.max(1, progresoDGII.total) : undefined}
                  accion={
                    <button onClick={() => void verificarEnLaDGII()} disabled={!!progresoDGII} className={BTN_SECONDARY}>
                      <ShieldCheck className="h-4 w-4" />
                      Verificar en la DGII
                    </button>
                  }
                />
              )}

              {/* ── Tabla ─────────────────────────────────────────────── */}
              {filtrados.length === 0 ? (
                <EmptyState
                  icon={ReceiptText}
                  title="Ninguna factura coincide con los filtros"
                  message="Cambia o quita los filtros para ver más facturas."
                />
              ) : (
                <div className={cn(CARD_CLASS, 'animate-content-in overflow-hidden')}>
                  {/* Acciones en grupo: aparecen al seleccionar. */}
                  {seleccionadas.length > 0 && (
                    <div role="region" aria-label="Acciones con las seleccionadas" className="flex flex-wrap items-center gap-2 border-b border-[#1B2980]/10 bg-[#eef0fb]/70 px-4 py-2.5 dark:border-indigo-500/20 dark:bg-indigo-950/30 sm:px-5">
                      <p className="mr-auto text-sm text-[#151f66] dark:text-indigo-200">
                        <strong className="font-semibold tabular-nums">{seleccionadas.length}</strong> {seleccionadas.length === 1 ? 'seleccionada' : 'seleccionadas'}
                        <button type="button" onClick={() => setSeleccion(new Set())} className="ml-2 text-xs font-medium underline-offset-2 hover:underline">Quitar selección</button>
                      </p>
                      <button type="button" onClick={() => setPorAprobar(aprobablesSeleccionadas)} disabled={aprobablesSeleccionadas.length === 0} title={aprobablesSeleccionadas.length === 0 ? 'Ninguna de las seleccionadas está lista: tienen observaciones, falta verificarlas o ya están revisadas.' : undefined} className={cn(BTN_SECONDARY, 'h-9 py-0')}>
                        <CheckCheck className="h-4 w-4" /> Aprobar ({aprobablesSeleccionadas.length} {aprobablesSeleccionadas.length === 1 ? 'aprobable' : 'aprobables'})
                      </button>
                      <button type="button" onClick={() => exportarCSV(seleccionadas)} className={cn(BTN_SECONDARY, 'h-9 py-0')}>
                        <Download className="h-4 w-4" /> Exportar CSV
                      </button>
                      <button type="button" onClick={() => setPorEliminar(seleccionadas)} className={cn(BTN_SECONDARY, 'h-9 py-0 text-rose-600 hover:border-rose-200 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30')}>
                        <Trash2 className="h-4 w-4" /> Eliminar
                      </button>
                    </div>
                  )}

                  {/* Computadora: tabla. */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-100 dark:border-[#1d2035]">
                          <th className={cn(TH_CLASS, 'w-10 pl-5 pr-1')}>
                            <Casilla marcada={paginaMarcada} mixta={paginaMixta} onCambio={alternarPagina} etiqueta="Seleccionar todas las de esta página" />
                          </th>
                          <ThOrden activo={orden.campo === 'fecha'} dir={orden.dir} onClick={() => ordenarPor('fecha')} className="px-2.5">Fecha</ThOrden>
                          <ThOrden activo={orden.campo === 'contraparte'} dir={orden.dir} onClick={() => ordenarPor('contraparte')} className="px-2.5">{modulo.contraparte}</ThOrden>
                          <th className={cn(TH_CLASS, 'px-2.5 text-left')}>NCF</th>
                          <th className={cn(TH_CLASS, 'px-2.5 text-left')}>{compra ? 'Clasificación' : 'Tipo de ingreso'}</th>
                          <th className={cn(TH_CLASS, 'px-2.5 text-right')}>Monto RD$</th>
                          <th className={cn(TH_CLASS, 'px-2.5 text-right')}>ITBIS RD$</th>
                          <ThOrden activo={orden.campo === 'total'} dir={orden.dir} onClick={() => ordenarPor('total')} alinear="right" className="px-2.5">Total RD$</ThOrden>
                          <th className={cn(TH_CLASS, 'px-2.5 text-left')}>Estado</th>
                          <th className={cn(TH_CLASS, 'w-8 pr-2')}><span className="sr-only">Acciones</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-[#1d2035]">
                        {vista.items.map(d => {
                          const s = signoDe(d)
                          const marcada = seleccion.has(d.id)
                          const nombre = nombreDe(d)
                          const tipoIngreso = nombreTipoIngreso(d.tipoIngreso)
                          return (
                            <tr key={d.id} onClick={() => setEnEdicion(d)} aria-selected={marcada} className={cn('group cursor-pointer transition-colors', marcada ? 'bg-[#f4f5fd] dark:bg-indigo-950/25' : 'hover:bg-[#f7f8fd] dark:hover:bg-[#171a2a]')}>
                              <td className="py-3 pl-5 pr-1" onClick={e => e.stopPropagation()}>
                                <Casilla marcada={marcada} onCambio={() => alternar(d.id)} etiqueta={`Seleccionar ${etiquetaFila(d)}`} />
                              </td>
                              <td className="whitespace-nowrap px-2.5 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                                {d.fechaComprobante ? fechaCorta(d.fechaComprobante) : <span className="text-amber-700 dark:text-amber-400">Sin fecha</span>}
                              </td>
                              <td className="max-w-[16rem] px-2.5 py-3">
                                <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                                  {nombre ?? <span className="font-normal text-zinc-400 dark:text-zinc-500">Sin nombre</span>}
                                </p>
                                <p className="truncate text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                                  {d.rncCedulaContraparte ? formatCedula(d.rncCedulaContraparte) : compra ? 'Sin RNC' : 'Sin RNC ni cédula'}
                                </p>
                              </td>
                              <td className="whitespace-nowrap px-2.5 py-3">
                                <p className="font-mono text-[13px] tabular-nums text-zinc-700 dark:text-zinc-300">
                                  {d.ncf ?? <span className="font-sans text-zinc-300 dark:text-zinc-600">Sin NCF</span>}
                                </p>
                                {esNotaDeCredito(d) && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">Nota de crédito</p>}
                              </td>
                              <td className="px-2.5 py-3">
                                {compra
                                  ? <PildoraClasificacion tipoBienes={d.tipoBienesServicios} />
                                  : tipoIngreso
                                    ? <span title={tipoIngreso} className="block max-w-[11rem] truncate text-xs text-zinc-600 dark:text-zinc-400">{tipoIngreso}</span>
                                    : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                              </td>
                              <td className="whitespace-nowrap px-2.5 py-3 text-right"><Monto valor={montoFacturadoDe(d)} signo={s} sinMoneda /></td>
                              <td className="whitespace-nowrap px-2.5 py-3 text-right"><Monto valor={d.itbisFacturado} signo={s} sinMoneda /></td>
                              <td className="whitespace-nowrap px-2.5 py-3 text-right font-semibold">
                                <span title={d.montoTotal === null && totalDe(d) !== null ? 'Calculado: no se leyó el total impreso' : undefined}>
                                  <Monto valor={totalDe(d)} signo={s} fuerte sinMoneda />
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-2.5 py-3"><EstadoFactura d={d} /></td>
                              <td className="py-3 pr-2 text-right" onClick={e => e.stopPropagation()}>
                                <MenuFila etiqueta={etiquetaFila(d)} onEditar={() => setEnEdicion(d)} onEliminar={() => setPorEliminar([d])} />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-zinc-200 bg-zinc-50/80 dark:border-[#252840] dark:bg-[#171a29]">
                          <td colSpan={5} className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
                            Total · {filtrados.length} {filtrados.length === 1 ? 'factura' : 'facturas'}{hayFiltros && ' con estos filtros'}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-3 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{formatNum(totales.monto)}</td>
                          <td className="whitespace-nowrap px-2.5 py-3 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{formatNum(totales.itbis)}</td>
                          <td className="whitespace-nowrap px-2.5 py-3 text-right font-bold tabular-nums text-[#1B2980] dark:text-indigo-300">{formatNum(totales.total)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Móvil: tarjetas (sin desplazamiento horizontal). */}
                  <div className="md:hidden">
                    <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-2.5 text-xs font-medium text-zinc-500 dark:border-[#1d2035] dark:text-zinc-400">
                      <Casilla marcada={paginaMarcada} mixta={paginaMixta} onCambio={alternarPagina} etiqueta="Seleccionar todas las de esta página" />
                      <span>Seleccionar página</span>
                      <select aria-label="Ordenar por" value={`${orden.campo}:${orden.dir}`} onChange={e => { const [campo, dir] = e.target.value.split(':'); setOrden({ campo: campo as CampoOrden, dir: dir as 'asc' | 'desc' }) }} className="ml-auto rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-[#252840] dark:bg-[#141722] dark:text-zinc-300 dark:[color-scheme:dark]">
                        <option value="fecha:desc">Más recientes</option>
                        <option value="fecha:asc">Más antiguas</option>
                        <option value="total:desc">Mayor total</option>
                        <option value="total:asc">Menor total</option>
                        <option value="contraparte:asc">{modulo.contraparte} A–Z</option>
                        <option value="contraparte:desc">{modulo.contraparte} Z–A</option>
                      </select>
                    </div>
                    <ul className="divide-y divide-zinc-100 dark:divide-[#1d2035]">
                      {vista.items.map(d => {
                        const s = signoDe(d)
                        const marcada = seleccion.has(d.id)
                        const nombre = nombreDe(d)
                        return (
                          <li key={d.id} onClick={() => setEnEdicion(d)} className={cn('flex cursor-pointer gap-3 px-4 py-3', marcada && 'bg-[#f4f5fd] dark:bg-indigo-950/25')}>
                            <div className="pt-0.5" onClick={e => e.stopPropagation()}>
                              <Casilla marcada={marcada} onCambio={() => alternar(d.id)} etiqueta={`Seleccionar ${etiquetaFila(d)}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{nombre ?? <span className="font-normal text-zinc-400">Sin nombre</span>}</p>
                                <p className="shrink-0 text-sm font-semibold"><Monto valor={totalDe(d)} signo={s} fuerte /></p>
                              </div>
                              <p className="mt-0.5 truncate text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                                {d.fechaComprobante ? formatDate(d.fechaComprobante) : 'Sin fecha'} · <span className="font-mono">{d.ncf ?? 'Sin NCF'}</span>
                                {esNotaDeCredito(d) && <span className="text-rose-600 dark:text-rose-400"> · Nota de crédito</span>}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <EstadoFactura d={d} />
                                {compra && <PildoraClasificacion tipoBienes={d.tipoBienesServicios} />}
                              </div>
                            </div>
                            <div onClick={e => e.stopPropagation()}>
                              <MenuFila etiqueta={etiquetaFila(d)} onEditar={() => setEnEdicion(d)} onEliminar={() => setPorEliminar([d])} />
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                    <div className="grid grid-cols-3 gap-2 border-t border-zinc-200 bg-zinc-50/80 px-4 py-3 text-xs dark:border-[#252840] dark:bg-[#171a29]">
                      <div><p className="text-zinc-500 dark:text-zinc-400">Monto</p><p className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(totales.monto, 0)}</p></div>
                      <div><p className="text-zinc-500 dark:text-zinc-400">ITBIS</p><p className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(totales.itbis, 0)}</p></div>
                      <div className="text-right"><p className="text-zinc-500 dark:text-zinc-400">Total</p><p className="font-bold tabular-nums text-[#1B2980] dark:text-indigo-300">{formatRD(totales.total, 0)}</p></div>
                    </div>
                  </div>

                  <Paginacion pagina={vista} onIr={setPagina} sustantivo={['factura', 'facturas']} />
                </div>
              )}
            </>
          ) : (
            /* ── Proveedores / Clientes ─────────────────────────────────── */
            <>
              <section className="animate-content-in flex flex-wrap items-center gap-2">
                <label className="relative w-full sm:w-72">
                  <span className="sr-only">Buscar {modulo.contraparte.toLowerCase()}</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="search"
                    value={busquedaContraparte}
                    onChange={e => setBusquedaContraparte(e.target.value)}
                    placeholder="Buscar por nombre o RNC"
                    className={cn(CONTROL, 'w-full pl-9 pr-3 placeholder:text-zinc-400')}
                  />
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Toca un {modulo.contraparte.toLowerCase()} para ver sus facturas.</p>
              </section>
              {filasContrapartes.length === 0 ? (
                <EmptyState icon={Users} title={`Ningún ${modulo.contraparte.toLowerCase()} coincide`} message="Prueba con otra parte del nombre o del RNC." />
              ) : (
                <div className={cn(CARD_CLASS, 'animate-content-in overflow-hidden')}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-100 dark:border-[#1d2035]">
                          <ThOrden activo={ordenContraparte.campo === 'nombre'} dir={ordenContraparte.dir} onClick={() => ordenarContrapartesPor('nombre')} className="pl-5 pr-3">{modulo.contraparte}</ThOrden>
                          <ThOrden activo={ordenContraparte.campo === 'cantidad'} dir={ordenContraparte.dir} onClick={() => ordenarContrapartesPor('cantidad')} alinear="right" className="hidden px-3 sm:table-cell">Facturas</ThOrden>
                          <ThOrden activo={ordenContraparte.campo === 'monto'} dir={ordenContraparte.dir} onClick={() => ordenarContrapartesPor('monto')} alinear="right" className="px-3">Monto sin impuestos</ThOrden>
                          <ThOrden activo={ordenContraparte.campo === 'itbis'} dir={ordenContraparte.dir} onClick={() => ordenarContrapartesPor('itbis')} alinear="right" className="hidden px-3 sm:table-cell">ITBIS</ThOrden>
                          <ThOrden activo={ordenContraparte.campo === 'ultimaFecha'} dir={ordenContraparte.dir} onClick={() => ordenarContrapartesPor('ultimaFecha')} className="hidden px-3 sm:table-cell">Última factura</ThOrden>
                          <ThOrden activo={ordenContraparte.campo === 'porRevisar'} dir={ordenContraparte.dir} onClick={() => ordenarContrapartesPor('porRevisar')} alinear="right" className="hidden pl-3 pr-5 md:table-cell">Por revisar</ThOrden>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-[#1d2035]">
                        {filasContrapartes.map(c => {
                          const nombre = c.nombre ?? (c.clave === 'sin-identificar' ? (compra ? 'Sin identificar' : 'Consumidor final') : null)
                          return (
                            <tr key={c.clave} onClick={() => verFacturasDe(c.clave)} className="group cursor-pointer transition-colors hover:bg-[#f7f8fd] dark:hover:bg-[#171a2a]">
                              <td className="max-w-[18rem] py-3 pl-5 pr-3">
                                <p className="truncate font-medium text-zinc-900 group-hover:text-[#1B2980] dark:text-zinc-100 dark:group-hover:text-indigo-300">{nombre ?? <span className="font-normal text-zinc-400">Sin nombre</span>}</p>
                                <p className="truncate text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                                  {c.rnc ? formatCedula(c.rnc) : 'Sin RNC'}
                                  <span className="sm:hidden"> · {c.cantidad} {c.cantidad === 1 ? 'factura' : 'facturas'}{c.porRevisar > 0 && ` · ${c.porRevisar} por revisar`}</span>
                                </p>
                              </td>
                              <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300 sm:table-cell">{c.cantidad}</td>
                              <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatRD(c.monto)}</td>
                              <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300 sm:table-cell">{formatRD(c.itbis)}</td>
                              <td className="hidden whitespace-nowrap px-3 py-3 tabular-nums text-zinc-700 dark:text-zinc-300 sm:table-cell">{c.ultimaFecha ? formatDate(c.ultimaFecha) : '—'}</td>
                              <td className="hidden whitespace-nowrap py-3 pl-3 pr-5 text-right md:table-cell">
                                {c.porRevisar > 0
                                  ? <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-800 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20">{c.porRevisar} por revisar</span>
                                  : <span className="text-xs text-emerald-700 dark:text-emerald-400">Al día</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500 dark:border-[#1d2035] dark:text-zinc-400">
                    <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{filasContrapartes.length}</span> {filasContrapartes.length === 1 ? modulo.contraparte.toLowerCase() : modulo.contrapartes.toLowerCase()} · las notas de crédito restan
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {enEdicion !== undefined && (
        <FacturaModal
          documento={enEdicion}
          clientes={clientes}
          documentos={documentos}
          clienteIdInicial={empresa.id}
          tipoInicial={tipo}
          onGuardar={handleGuardar}
          obtenerArchivo={obtenerArchivo}
          onClose={() => setEnEdicion(undefined)}
        />
      )}

      {porAprobar && (
        <ConfirmDialog
          tono="normal"
          mensaje={`¿Aprobar ${porAprobar.length} factura(s) sin revisarlas una por una?`}
          detalle={'Quedarán como revisadas y entrarán a los reportes. Puedes abrir cualquiera después y corregirla.' +
            (seleccionadas.length > porAprobar.length && porAprobar === aprobablesSeleccionadas
              ? ` Las otras ${seleccionadas.length - porAprobar.length} seleccionadas no se aprueban así: tienen observaciones, falta verificarlas o ya están revisadas.`
              : '')}
          textoConfirmar="Aprobar"
          onConfirm={() => void aprobar(porAprobar)}
          onCancel={() => setPorAprobar(null)}
        />
      )}

      {porEliminar && (
        <ConfirmDialog
          mensaje={porEliminar.length === 1 ? `¿Eliminar la factura ${porEliminar[0].ncf ?? 'sin NCF'}?` : `¿Eliminar ${porEliminar.length} facturas?`}
          detalle={porEliminar.length === 1 ? 'Se borra también su imagen. No se puede deshacer.' : 'Se borran también sus imágenes. No se puede deshacer.'}
          textoConfirmar={porEliminar.length === 1 ? 'Eliminar' : `Eliminar ${porEliminar.length}`}
          onConfirm={() => void eliminar(porEliminar)}
          onCancel={() => setPorEliminar(null)}
        />
      )}

      {aviso && <Toast message={aviso.mensaje} type={aviso.tipo} onClose={() => setAviso(null)} />}
    </Pagina>
  )
}
