'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCheck, Files, Pencil, Plus, ReceiptText, ShieldCheck, Trash2, Users } from 'lucide-react'
import { FacturaModal } from '@/components/facturas/FacturaModal'
import { AvisoErrorCarga, Pagina } from '@/components/layout/Pagina'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Toast } from '@/components/ui/Toast'
import { BTN_SECONDARY, CARD_CLASS, INPUT_CLASS, LABEL_CLASS, TH_CLASS } from '@/components/ui/clases'
import { useDatos } from '@/lib/datos/datos-context'
import { montoFacturadoDe, periodoDe, puedeMarcarseRevisada } from '@/lib/documentos'
import { BTN_PRIMARY, cn, formatCedula, formatDate, formatRD, redondear2 } from '@/lib/utils'
import { VerificacionError, verificarEnDGII } from '@/lib/verificacion-cliente'
import { ETIQUETA_ESTADO_DGII } from '@/lib/verificacion-dgii'
import type { DocumentoFiscal, EstadoRevision, TipoDocumento } from '@/types'

type Aviso = { mensaje: string; tipo: 'success' | 'error' }

function monto(valor: number | null) {
  return valor === null ? <span className="text-zinc-300 dark:text-zinc-600">—</span> : formatRD(valor)
}

function FacturasContenido() {
  const params = useSearchParams()
  const { listo, errorCarga, clientes, documentos, guardarDocumento, guardarDocumentos, eliminarDocumento, obtenerArchivo } = useDatos()

  const [clienteId, setClienteId] = useState(params.get('cliente') ?? '')
  const [tipo, setTipo] = useState<TipoDocumento | ''>('')
  const [periodo, setPeriodo] = useState('') // "YYYY-MM"
  const [estado, setEstado] = useState<EstadoRevision | ''>('')
  // undefined = modal cerrado; null = factura nueva.
  const [enEdicion, setEnEdicion] = useState<DocumentoFiscal | null | undefined>(undefined)
  const [porEliminar, setPorEliminar] = useState<DocumentoFiscal | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [confirmarAprobar, setConfirmarAprobar] = useState(false)
  const [progresoDGII, setProgresoDGII] = useState<{ hechas: number; total: number } | null>(null)

  const nombreCliente = useMemo(() => new Map(clientes.map(c => [c.id, c.razonSocial])), [clientes])
  // Un id de cliente en la URL que ya no existe equivale a "todos".
  const clienteFiltro = nombreCliente.has(clienteId) ? clienteId : ''

  const filtrados = useMemo(() => {
    return documentos
      .filter(d =>
        (!clienteFiltro || d.clienteId === clienteFiltro) &&
        (!tipo || d.tipo === tipo) &&
        (!estado || d.estadoRevision === estado) &&
        (!periodo || periodoDe(d) === periodo),
      )
      // Más recientes primero; sin fecha al principio (son las que hay que completar).
      .sort((a, b) => {
        if (a.fechaComprobante === b.fechaComprobante) return b.creadoEn.localeCompare(a.creadoEn)
        if (a.fechaComprobante === null) return -1
        if (b.fechaComprobante === null) return 1
        return b.fechaComprobante.localeCompare(a.fechaComprobante)
      })
  }, [documentos, clienteFiltro, tipo, estado, periodo])

  const totales = useMemo(() => ({
    monto: redondear2(filtrados.reduce((s, d) => s + (montoFacturadoDe(d) ?? 0), 0)),
    itbis: redondear2(filtrados.reduce((s, d) => s + (d.itbisFacturado ?? 0), 0)),
    total: redondear2(filtrados.reduce((s, d) => s + (d.montoTotal ?? 0), 0)),
  }), [filtrados])

  // Pendientes de la lista actual a las que no les falta nada ni tienen
  // ningún dato en duda: se pueden aprobar de una vez.
  const rncDe = useMemo(() => new Map(clientes.map(c => [c.id, c.rncCedula])), [clientes])
  const aprobables = useMemo(
    () => filtrados.filter(d =>
      d.estadoRevision === 'pendiente_revision' &&
      d.camposIncompletos.length === 0 &&
      puedeMarcarseRevisada(d.tipo, d, rncDe.get(d.clienteId) ?? ''),
    ),
    [filtrados, rncDe],
  )

  // Facturas de la lista con código QR de e-CF: se pueden (re)verificar en la
  // DGII. El estado puede cambiar (por ejemplo, de "en proceso" a aceptado).
  const verificables = useMemo(() => filtrados.filter(d => d.qrUrl), [filtrados])

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
          actualizadas.push({ ...d, verificacionDGII: { estado: r.estado, texto: r.texto, consultadoEn: ahora }, actualizadoEn: ahora })
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

  async function aprobarSinObservaciones() {
    setConfirmarAprobar(false)
    const ahora = new Date().toISOString()
    try {
      await guardarDocumentos(aprobables.map(d => ({ ...d, estadoRevision: 'revisado' as const, revisadoEn: ahora, actualizadoEn: ahora })))
      setAviso({ mensaje: `${aprobables.length} factura(s) aprobadas`, tipo: 'success' })
    } catch (err) {
      setAviso({ mensaje: err instanceof Error ? err.message : 'No se pudieron aprobar.', tipo: 'error' })
    }
  }

  async function handleGuardar(documento: DocumentoFiscal, archivo?: Blob) {
    await guardarDocumento(documento, archivo)
    setEnEdicion(undefined)
    setAviso({
      mensaje: documento.estadoRevision === 'revisado' ? 'Factura guardada como revisada' : 'Factura guardada como pendiente',
      tipo: 'success',
    })
  }

  async function handleEliminar() {
    if (!porEliminar) return
    const objetivo = porEliminar
    setPorEliminar(null)
    try {
      await eliminarDocumento(objetivo.id)
      setAviso({ mensaje: 'Factura eliminada', tipo: 'success' })
    } catch (err) {
      setAviso({ mensaje: err instanceof Error ? err.message : 'No se pudo eliminar.', tipo: 'error' })
    }
  }

  const sinClientes = listo && !errorCarga && clientes.length === 0
  const hayFiltros = !!(clienteFiltro || tipo || estado || periodo)

  return (
    <Pagina
      title="Facturas"
      subtitle="Compras y ventas de tus clientes"
      actions={
        clientes.length > 0 && (
          <>
            <Link href={clienteFiltro ? `/lote?cliente=${clienteFiltro}` : '/lote'} className={BTN_SECONDARY}>
              <Files className="h-4 w-4" />
              <span className="hidden sm:inline">Subir lote</span>
            </Link>
            <button onClick={() => setEnEdicion(null)} className={BTN_PRIMARY}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva factura</span>
            </button>
          </>
        )
      }
    >
      {errorCarga && <AvisoErrorCarga mensaje={errorCarga} />}

      {sinClientes && (
        <div className="flex flex-col items-center gap-4">
          <EmptyState
            icon={Users}
            title="Primero crea un cliente"
            message="Cada factura pertenece a un cliente. Crea uno y vuelve aquí para registrar sus facturas."
            className="w-full"
          />
          <Link href="/clientes" className={BTN_PRIMARY}>Ir a Clientes</Link>
        </div>
      )}

      {clientes.length > 0 && (
        <>
          {/* ── Filtros ────────────────────────────────────────────────── */}
          <div className={cn(CARD_CLASS, 'grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4')}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="filtro-cliente" className={LABEL_CLASS}>Cliente</label>
              <select id="filtro-cliente" value={clienteFiltro} onChange={e => setClienteId(e.target.value)} className={INPUT_CLASS}>
                <option value="">Todos los clientes</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="filtro-tipo" className={LABEL_CLASS}>Tipo</label>
              <select id="filtro-tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoDocumento | '')} className={INPUT_CLASS}>
                <option value="">Compras y ventas</option>
                <option value="compra">Compras</option>
                <option value="venta">Ventas</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="filtro-periodo" className={LABEL_CLASS}>Mes</label>
              <input id="filtro-periodo" type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="filtro-estado" className={LABEL_CLASS}>Estado</label>
              <select id="filtro-estado" value={estado} onChange={e => setEstado(e.target.value as EstadoRevision | '')} className={INPUT_CLASS}>
                <option value="">Todos</option>
                <option value="pendiente_revision">Por revisar</option>
                <option value="revisado">Revisadas</option>
              </select>
            </div>
          </div>

          {verificables.length > 0 && (
            <div className={cn(CARD_CLASS, 'flex flex-wrap items-center gap-3 px-5 py-3')}>
              <p className="min-w-[240px] flex-1 text-sm text-zinc-700 dark:text-zinc-300">
                {progresoDGII
                  ? <>Verificando en la DGII: {progresoDGII.hechas} de {progresoDGII.total}…</>
                  : <><strong>{verificables.length}</strong> factura(s) electrónica(s) de esta lista tienen código QR y se pueden consultar en la DGII.</>}
              </p>
              <button onClick={() => void verificarEnLaDGII()} disabled={!!progresoDGII} className={BTN_SECONDARY}>
                <ShieldCheck className="h-4 w-4" />
                Verificar en la DGII
              </button>
            </div>
          )}

          {aprobables.length > 0 && (
            <div className={cn(CARD_CLASS, 'flex flex-wrap items-center gap-3 px-5 py-3')}>
              <p className="min-w-[240px] flex-1 text-sm text-zinc-700 dark:text-zinc-300">
                <strong>{aprobables.length}</strong> factura(s) de esta lista no tienen observaciones: el sistema leyó
                todos los datos, cuadran y no quedó ninguno en duda.
              </p>
              <button onClick={() => setConfirmarAprobar(true)} className={BTN_PRIMARY}>
                <CheckCheck className="h-4 w-4" />
                Aprobar las {aprobables.length}
              </button>
            </div>
          )}

          {/* ── Tabla ──────────────────────────────────────────────────── */}
          {filtrados.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title={hayFiltros ? 'Ninguna factura coincide con los filtros' : 'Todavía no hay facturas'}
              message={hayFiltros
                ? 'Cambia o quita los filtros para ver más facturas.'
                : 'Sube la primera factura y el sistema leerá sus datos para que los revises.'}
              action={hayFiltros ? undefined : { label: 'Nueva factura', onClick: () => setEnEdicion(null) }}
            />
          ) : (
            <div className={cn(CARD_CLASS, 'overflow-hidden')}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-[#1d2035] bg-zinc-50 dark:bg-[#1a1d2e]">
                      <th className={cn(TH_CLASS, 'text-left pl-5')}>Fecha</th>
                      <th className={cn(TH_CLASS, 'px-3 text-left')}>Contraparte</th>
                      <th className={cn(TH_CLASS, 'px-3 text-left')}>NCF</th>
                      <th className={cn(TH_CLASS, 'px-3 text-left')}>Tipo</th>
                      <th className={cn(TH_CLASS, 'px-3 text-right')}>Monto</th>
                      <th className={cn(TH_CLASS, 'px-3 text-right')}>ITBIS</th>
                      <th className={cn(TH_CLASS, 'px-3 text-right')}>Total</th>
                      <th className={cn(TH_CLASS, 'px-3 text-left')}>Estado</th>
                      <th className={cn(TH_CLASS, 'px-3')}><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-[#1d2035]">
                    {filtrados.map(d => (
                      <tr key={d.id} className="hover:bg-[#eef0fb]/30 dark:hover:bg-indigo-950/20 transition-colors">
                        <td className="px-3 py-3.5 pl-5 text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {d.fechaComprobante ? formatDate(d.fechaComprobante) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                        </td>
                        <td className="px-3 py-3.5 min-w-[11rem]">
                          <p className="font-medium text-zinc-800 dark:text-zinc-200">
                            {d.nombreContraparte ?? <span className="font-normal text-zinc-400 dark:text-zinc-500">Sin nombre</span>}
                          </p>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            {d.rncCedulaContraparte ? formatCedula(d.rncCedulaContraparte) : 'Sin RNC'}
                            {!clienteFiltro && ` · ${nombreCliente.get(d.clienteId) ?? 'Cliente eliminado'}`}
                          </p>
                        </td>
                        <td className="px-3 py-3.5 tabular-nums text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {d.ncf ?? <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                        </td>
                        <td className="px-3 py-3.5 text-zinc-600 dark:text-zinc-400">{d.tipo === 'compra' ? 'Compra' : 'Venta'}</td>
                        <td className="px-3 py-3.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{monto(montoFacturadoDe(d))}</td>
                        <td className="px-3 py-3.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{monto(d.itbisFacturado)}</td>
                        <td className="px-3 py-3.5 text-right tabular-nums font-semibold text-[#1B2980] dark:text-indigo-300 whitespace-nowrap">{monto(d.montoTotal)}</td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          {d.estadoRevision === 'revisado'
                            ? <Badge variant="success">Revisada</Badge>
                            : <Badge variant="warning">Por revisar</Badge>}
                          {d.verificacionDGII && ['rechazado', 'no_encontrado'].includes(d.verificacionDGII.estado) && (
                            <span className="ml-1.5"><Badge variant="danger">{ETIQUETA_ESTADO_DGII[d.verificacionDGII.estado]}</Badge></span>
                          )}
                          {d.verificacionDGII && ['aceptado', 'aceptado_condicional'].includes(d.verificacionDGII.estado) && (
                            <span title={`${ETIQUETA_ESTADO_DGII[d.verificacionDGII.estado]} · ${new Date(d.verificacionDGII.consultadoEn).toLocaleString('es-DO')}`}>
                              <ShieldCheck aria-label={ETIQUETA_ESTADO_DGII[d.verificacionDGII.estado]} className="ml-1.5 inline h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => setEnEdicion(d)}
                            title="Editar factura"
                            aria-label={`Editar factura ${d.ncf ?? 'sin NCF'}`}
                            className="rounded-lg p-1.5 text-zinc-400 hover:text-[#1B2980] hover:bg-[#eef0fb] dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setPorEliminar(d)}
                            title="Eliminar factura"
                            aria-label={`Eliminar factura ${d.ncf ?? 'sin NCF'}`}
                            className="rounded-lg p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#c7cef0] dark:border-[#252840] bg-[#eef0fb] dark:bg-[#1a1d2e]">
                      <td colSpan={4} className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-[#1B2980] dark:text-indigo-400">
                        Total — {filtrados.length} factura(s)
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-[#1B2980] dark:text-indigo-300 whitespace-nowrap">{formatRD(totales.monto)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-[#1B2980] dark:text-indigo-300 whitespace-nowrap">{formatRD(totales.itbis)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-[#1B2980] dark:text-indigo-300 whitespace-nowrap">{formatRD(totales.total)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {enEdicion !== undefined && (
        <FacturaModal
          documento={enEdicion}
          clientes={clientes}
          documentos={documentos}
          clienteIdInicial={clienteFiltro || undefined}
          onGuardar={handleGuardar}
          obtenerArchivo={obtenerArchivo}
          onClose={() => setEnEdicion(undefined)}
        />
      )}

      {confirmarAprobar && (
        <ConfirmDialog
          tono="normal"
          mensaje={`¿Aprobar ${aprobables.length} factura(s) sin revisarlas una por una?`}
          detalle="Quedarán como revisadas y entrarán a los reportes. Puedes abrir cualquiera después y corregirla."
          textoConfirmar="Aprobar"
          onConfirm={() => void aprobarSinObservaciones()}
          onCancel={() => setConfirmarAprobar(false)}
        />
      )}

      {porEliminar && (
        <ConfirmDialog
          mensaje={`¿Eliminar la factura ${porEliminar.ncf ?? 'sin NCF'}?`}
          detalle="No se puede deshacer."
          textoConfirmar="Eliminar"
          onConfirm={handleEliminar}
          onCancel={() => setPorEliminar(null)}
        />
      )}

      {aviso && <Toast message={aviso.mensaje} type={aviso.tipo} onClose={() => setAviso(null)} />}
    </Pagina>
  )
}

export default function FacturasPage() {
  // useSearchParams exige un límite de Suspense para el prerender estático.
  return (
    <Suspense fallback={null}>
      <FacturasContenido />
    </Suspense>
  )
}
