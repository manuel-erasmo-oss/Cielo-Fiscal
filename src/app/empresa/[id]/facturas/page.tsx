'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, CheckCheck, CheckCircle2, CircleAlert, Coins, Files, Pencil, Plus, ReceiptText, ShieldAlert, ShieldCheck, ShieldX, Sparkles, Trash2, Wallet, X } from 'lucide-react'
import { FacturaModal } from '@/components/facturas/FacturaModal'
import { AvisoErrorCarga, Pagina } from '@/components/layout/Pagina'
import { AccionSugerida, Cifra, Estado, Segmentos } from '@/components/ui/premium'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Toast } from '@/components/ui/Toast'
import { BTN_SECONDARY, CARD_CLASS, TH_CLASS } from '@/components/ui/clases'
import { rutaEmpresa, useEmpresaActiva } from '@/lib/datos/empresa-context'
import { montoFacturadoDe, periodoDe, puedeMarcarseRevisada } from '@/lib/documentos'
import { BTN_PRIMARY, cn, formatCedula, formatDate, formatRD, redondear2 } from '@/lib/utils'
import { VerificacionError, verificarEnDGII } from '@/lib/verificacion-cliente'
import { ETIQUETA_ESTADO_DGII, problemaVerificacion, requiereVerificacionHumana } from '@/lib/verificacion-dgii'
import type { DocumentoFiscal, EstadoRevision, TipoDocumento } from '@/types'

type Aviso = { mensaje: string; tipo: 'success' | 'error' }

function monto(valor: number | null) {
  return valor === null ? <span className="text-zinc-300 dark:text-zinc-600">—</span> : formatRD(valor)
}

export default function FacturasPage() {
  // Solo la empresa en la que se entró: sus facturas y nada más (ver empresa-context).
  const { errorCarga, empresa, documentos, guardarDocumento, guardarDocumentos, eliminarDocumento, obtenerArchivo } = useEmpresaActiva()
  const clientes = useMemo(() => [empresa], [empresa])

  const [tipo, setTipo] = useState<TipoDocumento | ''>('')
  const [periodo, setPeriodo] = useState('') // "YYYY-MM"
  const [estado, setEstado] = useState<EstadoRevision | ''>('')
  // undefined = modal cerrado; null = factura nueva.
  const [enEdicion, setEnEdicion] = useState<DocumentoFiscal | null | undefined>(undefined)
  const [porEliminar, setPorEliminar] = useState<DocumentoFiscal | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [confirmarAprobar, setConfirmarAprobar] = useState(false)
  const [progresoDGII, setProgresoDGII] = useState<{ hechas: number; total: number } | null>(null)

  const filtrados = useMemo(() => {
    return documentos
      .filter(d =>
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
  }, [documentos, tipo, estado, periodo])

  // Cuántas hay en cada estado con los demás filtros puestos (para el
  // selector de estado).
  const conteos = useMemo(() => {
    const base = documentos.filter(d => (!tipo || d.tipo === tipo) && (!periodo || periodoDe(d) === periodo))
    return {
      todas: base.length,
      pendientes: base.filter(d => d.estadoRevision === 'pendiente_revision').length,
      revisadas: base.filter(d => d.estadoRevision === 'revisado').length,
    }
  }, [documentos, tipo, periodo])

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
      !requiereVerificacionHumana(d) &&
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

  const hayFiltros = !!(tipo || estado || periodo)

  return (
    <Pagina
      title="Facturas"
      subtitle="Compras y ventas de esta empresa"
      actions={
        empresa && (
          <>
            <Link href={rutaEmpresa(empresa.id, 'lote')} className={BTN_SECONDARY}>
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

      {clientes.length > 0 && (
        <>
          {/* ── Indicadores de la lista ─────────────────────────────────── */}
          <section className="animate-content-in grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cifra etiqueta="Facturas" valor={String(conteos.todas)} detalle={hayFiltros ? 'con estos filtros' : 'registradas'} icono={ReceiptText} tinte="bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/50 dark:text-indigo-300" />
            <Cifra etiqueta="Por revisar" valor={String(conteos.pendientes)} detalle={conteos.pendientes > 0 ? 'no entran a reportes' : 'todo al día'} icono={CircleAlert} tinte="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" />
            <Cifra etiqueta="Monto sin impuestos" valor={formatRD(totales.monto, 0)} detalle={`ITBIS ${formatRD(totales.itbis, 0)}`} icono={Coins} tinte="bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300" />
            <Cifra etiqueta="Total facturado" valor={formatRD(totales.total, 0)} detalle="según lo impreso" icono={Wallet} tinte="bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" />
          </section>

          {/* ── Filtros (una sola fila) ─────────────────────────────────── */}
          <section className="animate-content-in flex flex-wrap items-center gap-2.5">
            <Segmentos
              etiqueta="Estado"
              valor={estado}
              onCambio={v => setEstado(v as EstadoRevision | '')}
              opciones={[
                { valor: '', texto: 'Todas', cuenta: conteos.todas },
                { valor: 'pendiente_revision', texto: 'Por revisar', cuenta: conteos.pendientes },
                { valor: 'revisado', texto: 'Revisadas', cuenta: conteos.revisadas },
              ]}
            />
            <Segmentos
              etiqueta="Tipo"
              valor={tipo}
              onCambio={v => setTipo(v as TipoDocumento | '')}
              opciones={[
                { valor: '', texto: 'Compras y ventas' },
                { valor: 'compra', texto: 'Compras' },
                { valor: 'venta', texto: 'Ventas' },
              ]}
            />
            <div className="flex items-center gap-2">
              <label htmlFor="filtro-periodo" className="flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white pl-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] focus-within:ring-4 focus-within:ring-[#1B2980]/10 dark:border-[#252840] dark:bg-[#141722] dark:shadow-none">
                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Mes</span>
                <input id="filtro-periodo" type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="h-full rounded-r-xl bg-transparent pr-3 text-sm text-zinc-900 focus:outline-none dark:text-zinc-100 dark:[color-scheme:dark]" />
              </label>
              {hayFiltros && (
                <button onClick={() => { setTipo(''); setEstado(''); setPeriodo('') }} className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-[#1a1d2e] dark:hover:text-zinc-200">
                  <X className="h-3.5 w-3.5" /> Quitar filtros
                </button>
              )}
            </div>
          </section>

          {/* ── Acciones sugeridas ──────────────────────────────────────── */}
          {aprobables.length > 0 && (
            <AccionSugerida
              icono={Sparkles}
              tono="marca"
              texto={<><strong className="font-semibold">{aprobables.length} {aprobables.length === 1 ? 'factura está lista' : 'facturas están listas'}</strong> para aprobar: el sistema leyó todos los datos, cuadran y no quedó ninguno en duda.</>}
              accion={
                <button onClick={() => setConfirmarAprobar(true)} className={BTN_PRIMARY}>
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
            <div className={cn(CARD_CLASS, 'animate-content-in overflow-hidden')}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-[#1d2035]">
                      <th className={cn(TH_CLASS, 'pl-5 text-left')}>Contraparte</th>
                      <th className={cn(TH_CLASS, 'px-3 text-left')}>NCF y fecha</th>
                      <th className={cn(TH_CLASS, 'px-3 text-right')}>Monto</th>
                      <th className={cn(TH_CLASS, 'px-3 text-right')}>ITBIS</th>
                      <th className={cn(TH_CLASS, 'px-3 text-right')}>Total</th>
                      <th className={cn(TH_CLASS, 'px-3 text-left')}>Estado</th>
                      <th className={cn(TH_CLASS, 'px-3')}><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-[#1d2035]">
                    {filtrados.map(d => (
                      <tr key={d.id} onClick={() => setEnEdicion(d)} className="group cursor-pointer transition-colors hover:bg-[#f7f8fd] dark:hover:bg-[#171a2a]">
                        <td className="py-3 pl-5 pr-3 min-w-[14rem]">
                          <div className="flex items-center gap-3">
                            <span
                              title={d.tipo === 'compra' ? 'Compra' : 'Venta'}
                              className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', d.tipo === 'compra' ? 'bg-[#eef0fb] text-[#3446c4] dark:bg-indigo-950/50 dark:text-indigo-300' : 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300')}
                            >
                              {d.tipo === 'compra' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                                {d.nombreContraparte ?? <span className="font-normal text-zinc-400 dark:text-zinc-500">Sin nombre</span>}
                              </p>
                              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                                {d.tipo === 'compra' ? 'Compra' : 'Venta'} · {d.rncCedulaContraparte ? formatCedula(d.rncCedulaContraparte) : 'Sin RNC'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <p className="font-mono text-[13px] tabular-nums text-zinc-700 dark:text-zinc-300">
                            {d.ncf ?? <span className="font-sans text-zinc-300 dark:text-zinc-600">Sin NCF</span>}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {d.fechaComprobante ? formatDate(d.fechaComprobante) : 'Sin fecha'}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{monto(montoFacturadoDe(d))}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{monto(d.itbisFacturado)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{monto(d.montoTotal)}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {/* Un solo estado por factura, el más importante (la tabla no se ensancha). */}
                          <div className="flex items-center gap-1.5">
                            {d.verificacionDGII && ['rechazado', 'no_encontrado'].includes(d.verificacionDGII.estado)
                              ? <Estado tono="critico" icono={ShieldX}>{ETIQUETA_ESTADO_DGII[d.verificacionDGII.estado]}</Estado>
                              : d.estadoRevision === 'revisado'
                                ? <Estado tono="bien" icono={CheckCircle2}>Revisada</Estado>
                                : requiereVerificacionHumana(d)
                                  ? <span title="No se pudo verificar en la DGII: verifícala a mano antes de aprobarla."><Estado tono="serio" icono={ShieldAlert}>Verificar en la DGII</Estado></span>
                                  : <Estado tono="aviso" icono={CircleAlert}>Por revisar</Estado>}
                            {d.verificacionDGII && ['aceptado', 'aceptado_condicional'].includes(d.verificacionDGII.estado) && (
                              <span title={`${ETIQUETA_ESTADO_DGII[d.verificacionDGII.estado]} · ${new Date(d.verificacionDGII.consultadoEn).toLocaleString('es-DO')}`}>
                                <ShieldCheck aria-label={ETIQUETA_ESTADO_DGII[d.verificacionDGII.estado]} className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          <div className="flex justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={e => { e.stopPropagation(); setEnEdicion(d) }}
                              title="Editar factura"
                              aria-label={`Editar factura ${d.ncf ?? 'sin NCF'}`}
                              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-[#eef0fb] hover:text-[#1B2980] dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setPorEliminar(d) }}
                              title="Eliminar factura"
                              aria-label={`Eliminar factura ${d.ncf ?? 'sin NCF'}`}
                              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-200 bg-zinc-50/80 dark:border-[#252840] dark:bg-[#171a29]">
                      <td colSpan={2} className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
                        Total · {filtrados.length} {filtrados.length === 1 ? 'factura' : 'facturas'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(totales.monto)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(totales.itbis)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-[#1B2980] dark:text-indigo-300">{formatRD(totales.total)}</td>
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
          clienteIdInicial={empresa?.id}
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
