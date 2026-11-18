'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, CheckCircle2, CircleAlert, Download, FileSpreadsheet, FileText, Info, Landmark, ReceiptText, TrendingUp } from 'lucide-react'
import { AvisoErrorCarga, Pagina } from '@/components/layout/Pagina'
import { EmptyState } from '@/components/ui/EmptyState'
import { BTN_SECONDARY, CARD_CLASS, INPUT_CLASS, LABEL_CLASS, TH_CLASS } from '@/components/ui/clases'
import { rutaEmpresa, useEmpresaActiva } from '@/lib/datos/empresa-context'
import { fechaLimite606607 } from '@/lib/dgii-fiscal'
import {
  FORMA_PAGO_606,
  comprasSinFormaPago,
  esNotaDeCredito,
  generar606,
  type ArchivoDGII,
} from '@/lib/dgii-formatos'
import { construirExcel606, construirExcelIngresos } from '@/lib/excel-reporte'
import { montoFacturadoDe, periodoDe, problemasDeRevision } from '@/lib/documentos'
import { BTN_PRIMARY, cn, formatDate, formatPeriodo, formatRD, hoyLocalISO, redondear2 } from '@/lib/utils'
import { periodo606EnCurso } from '@/lib/dashboard'
import { Estado } from '@/components/ui/premium'
// '606': compras, con archivo para la DGII. 'ingresos': ventas, reporte
// interno en Excel (el 607 ya no se envía, según indicó el usuario).
type Formato = '606' | 'ingresos'

function descargar(archivo: ArchivoDGII) {
  const url = URL.createObjectURL(new Blob([archivo.contenido], { type: 'text/plain' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = archivo.nombreArchivo
  enlace.click()
  URL.revokeObjectURL(url)
}

export default function ReportesPage() {
  // Los reportes son siempre de la empresa en la que se entró (ver empresa-context).
  const { errorCarga, empresa, documentos } = useEmpresaActiva()
  const [formato, setFormato] = useState<Formato>('606')
  // Por defecto, el período del próximo 606 que vence ("YYYY-MM").
  const [periodo, setPeriodo] = useState(() => periodo606EnCurso(hoyLocalISO()))
  const [errorExcel, setErrorExcel] = useState<string | null>(null)
  // Forma de pago para las compras que no la indican (el 606 la exige).
  const [formaPagoDefecto, setFormaPagoDefecto] = useState('')

  const cliente = empresa

  const analisis = useMemo(() => {
    if (!cliente || !periodo) return null
    const tipo = formato === '606' ? 'compra' : 'venta'
    const delPeriodo = documentos.filter(
      d => d.clienteId === cliente.id && d.tipo === tipo && d.estadoRevision !== 'descartado' && periodoDe(d) === periodo,
    )
    const pendientes = delPeriodo.filter(d => d.estadoRevision === 'pendiente_revision')
    const revisadas = delPeriodo.filter(d => d.estadoRevision === 'revisado')
    // Una factura revisada puede tener errores si se revisó con reglas
    // anteriores o si cambió el RNC del cliente: se vuelve a comprobar aquí.
    const conErrores = revisadas
      .map(d => ({ doc: d, errores: problemasDeRevision(d.tipo, d, cliente.rncCedula).filter(p => p.nivel === 'error') }))
      .filter(x => x.errores.length > 0)
    const validas = revisadas.filter(d => !conErrores.some(x => x.doc.id === d.id))

    const periodoDgii = periodo.replace('-', '')
    let archivo: ArchivoDGII | null = null
    let errorArchivo: string | null = null
    const sinFormaPago = formato === '606' ? comprasSinFormaPago(validas) : 0
    // Falta elegir la forma de pago por defecto: no es un error, es un paso pendiente.
    const faltaFormaPago = sinFormaPago > 0 && !formaPagoDefecto
    if (formato === '606' && validas.length > 0 && !faltaFormaPago) {
      try {
        archivo = generar606(cliente.rncCedula, periodoDgii, validas, { formaPagoPorDefecto: formaPagoDefecto || undefined })
      } catch (e) {
        errorArchivo = e instanceof Error ? e.message : 'No se pudo generar el archivo.'
      }
    }
    // Totales en pantalla (las notas de crédito restan), haya o no archivo.
    const signo = (d: (typeof validas)[number]) => (esNotaDeCredito(d) ? -1 : 1)
    const totales = {
      montoFacturado: redondear2(validas.reduce((s, d) => s + signo(d) * (montoFacturadoDe(d) ?? 0), 0)),
      itbisFacturado: redondear2(validas.reduce((s, d) => s + signo(d) * (d.itbisFacturado ?? 0), 0)),
    }
    const [anio, mes] = periodo.split('-').map(Number)
    return { pendientes, conErrores, validas, archivo, errorArchivo, anio, mes, sinFormaPago, totales }
  }, [cliente, periodo, formato, documentos, formaPagoDefecto])

  // El Excel es un papel de trabajo: se puede exportar aunque el reporte esté
  // incompleto, pero el propio archivo lo dice en su encabezado.
  async function exportarExcel() {
    if (!analisis || !cliente) return
    setErrorExcel(null)
    try {
      const entrada = {
        cliente,
        periodo: periodo.replace('-', ''),
        validas: analisis.validas,
        pendientes: analisis.pendientes.length,
        conErrores: analisis.conErrores.length,
        formaPagoPorDefecto: formaPagoDefecto || undefined,
      }
      const libro = formato === '606' ? construirExcel606(entrada) : construirExcelIngresos(entrada)
      // Se carga solo al exportar, para no pesar en la carga de la página.
      const { default: writeXlsxFile } = await import('write-excel-file/browser')
      await writeXlsxFile(libro.hojas).toFile(libro.nombreArchivo)
    } catch (e) {
      setErrorExcel(e instanceof Error ? e.message : 'No se pudo generar el Excel.')
    }
  }

  // El TXT solo se descarga si NADA del período quedó fuera: ni pendientes ni con errores.
  const completo = !!analisis && analisis.pendientes.length === 0 && analisis.conErrores.length === 0

  return (
    <Pagina title="Reportes" subtitle="Formato 606 para la DGII y reporte de ingresos">
      {errorCarga && <AvisoErrorCarga mensaje={errorCarga} />}

      {cliente && (
        <>
          {/* ── Qué reporte y de qué mes ───────────────────────────────── */}
          <section className="animate-content-in grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_260px]">
            <div id="reporte-formato" role="radiogroup" aria-label="Reporte" className="contents">
              <OpcionFormato
                activo={formato === '606'} onClick={() => setFormato('606')}
                icono={Landmark} titulo="Formato 606" etiqueta="Compras"
                texto="Archivo TXT para la DGII y papel de trabajo en Excel."
              />
              <OpcionFormato
                activo={formato === 'ingresos'} onClick={() => setFormato('ingresos')}
                icono={TrendingUp} titulo="Reporte de ingresos" etiqueta="Ventas"
                texto="Uso interno, en Excel. No se envía a la DGII."
              />
            </div>
            <div className={cn(CARD_CLASS, 'flex flex-col justify-center gap-1.5 p-4')}>
              <label htmlFor="reporte-periodo" className={LABEL_CLASS}>Mes a reportar</label>
              <input id="reporte-periodo" type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className={INPUT_CLASS} />
            </div>
          </section>

          {!analisis && (
            <EmptyState icon={FileText} title="Elige el mes" message="Selecciona el mes que vas a reportar para ver qué facturas entran." />
          )}

          {analisis && (
            <>
              <section className={cn(CARD_CLASS, 'animate-content-in overflow-hidden')}>
                <div className="relative flex flex-wrap items-start justify-between gap-4 border-b border-zinc-100 px-5 py-5 dark:border-[#1d2035] sm:px-6">
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#1B2980] via-[#2f3fa8] to-[#00E676]" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">{formato === '606' ? 'Compras de bienes y servicios' : 'Ventas · uso interno'}</p>
                    <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em] text-zinc-900 dark:text-zinc-100">
                      {formato === '606' ? 'Formato 606' : 'Reporte de ingresos'} · {formatPeriodo(analisis.anio, analisis.mes)}
                    </h2>
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {formato === '606' ? (
                        <>
                          <CalendarClock className="mt-px h-3.5 w-3.5 shrink-0" />
                          Vence el {formatDate(fechaLimite606607(analisis.anio, analisis.mes))} (día 15 del mes siguiente; no ajustado por fines de semana ni feriados).
                        </>
                      ) : 'Uso interno: no se envía a la DGII.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {completo
                      ? <Estado tono="bien" icono={CheckCircle2}>Completo</Estado>
                      : <Estado tono="aviso" icono={CircleAlert}>Incompleto</Estado>}
                    <button
                      onClick={() => void exportarExcel()}
                      disabled={analisis.validas.length === 0}
                      className={formato === '606' ? BTN_SECONDARY : BTN_PRIMARY}
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      Exportar a Excel
                    </button>
                    {formato === '606' && (
                      <button
                        onClick={() => analisis.archivo && descargar(analisis.archivo)}
                        disabled={!analisis.archivo || !completo}
                        className={BTN_PRIMARY}
                      >
                        <Download className="h-4 w-4" />
                        Descargar TXT
                      </button>
                    )}
                  </div>
                </div>

                <dl className="grid grid-cols-2 divide-zinc-100 dark:divide-[#1d2035] sm:grid-cols-4 sm:divide-x">
                  <Total etiqueta={formato === '606' ? 'En el archivo' : 'Facturas'} valor={String(analisis.validas.length)} icono={ReceiptText} />
                  <Total etiqueta="Monto facturado" valor={formatRD(analisis.totales.montoFacturado)} icono={Landmark} />
                  <Total etiqueta="ITBIS facturado" valor={formatRD(analisis.totales.itbisFacturado)} icono={TrendingUp} />
                  <Total etiqueta="Por revisar" valor={String(analisis.pendientes.length)} icono={CircleAlert} alerta={analisis.pendientes.length > 0} />
                </dl>

                {(analisis.archivo || errorExcel || analisis.errorArchivo) && (
                  <div className="space-y-1 border-t border-zinc-100 px-5 py-3 dark:border-[#1d2035] sm:px-6">
                    {analisis.archivo && <p className="text-xs text-zinc-500 dark:text-zinc-400">Archivo: <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-700 dark:bg-[#1a1d2e] dark:text-zinc-300">{analisis.archivo.nombreArchivo}</span> · las notas de crédito restan en los totales.</p>}
                    {errorExcel && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{errorExcel}</p>}
                    {analisis.errorArchivo && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{analisis.errorArchivo}</p>}
                  </div>
                )}
              </section>

              {analisis.sinFormaPago > 0 && (
                <div className={cn(CARD_CLASS, 'animate-content-in flex flex-wrap items-end gap-4 px-5 py-4 sm:px-6')}>
                  <div className="min-w-[240px] flex-1">
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {analisis.sinFormaPago} compra(s) no indican forma de pago
                    </h2>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      El formato de la DGII exige una forma de pago en cada línea. Elige cuál se usará para estas
                      facturas; las que ya tienen la suya no cambian.
                    </p>
                  </div>
                  <div className="flex min-w-[240px] flex-col gap-1.5">
                    <label htmlFor="reporte-forma-pago" className={LABEL_CLASS}>Forma de pago por defecto</label>
                    <select id="reporte-forma-pago" value={formaPagoDefecto} onChange={e => setFormaPagoDefecto(e.target.value)} className={INPUT_CLASS}>
                      <option value="">— Seleccionar —</option>
                      {FORMA_PAGO_606.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} · {o.nombre}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {analisis.pendientes.length > 0 && (
                <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-5 py-4 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Hay {analisis.pendientes.length} factura(s) de este mes sin revisar
                    {formato === '606' ? '. No se puede descargar un archivo incompleto: ' : ' y no entran al reporte: '}
                    <Link href={rutaEmpresa(cliente.id, 'facturas')} className="font-semibold underline">revísalas</Link> o elimínalas primero.
                  </p>
                </div>
              )}

              {analisis.conErrores.length > 0 && (
                <div className={cn(CARD_CLASS, 'overflow-hidden')}>
                  <div className="border-b border-zinc-100 dark:border-[#1d2035] px-5 py-4">
                    <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-400">
                      {analisis.conErrores.length} factura(s) revisada(s) con errores
                    </h2>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Corrígelas en Facturas para que entren al reporte.</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-[#1d2035]">
                        <th className={cn(TH_CLASS, 'text-left pl-5')}>NCF</th>
                        <th className={cn(TH_CLASS, 'text-left')}>Problema</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50 dark:divide-[#1d2035]">
                      {analisis.conErrores.map(({ doc, errores }) => (
                        <tr key={doc.id}>
                          <td className="px-4 py-3 pl-5 tabular-nums text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{doc.ncf ?? 'Sin NCF'}</td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{errores.map(e => e.mensaje).join(' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {formato === '606' && completo && analisis.validas.length === 0 && (
                <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-[#eef0fb] dark:bg-indigo-950/30 px-5 py-4 text-xs text-[#151f66] dark:text-indigo-200">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    No hay comprobantes que detallar en este mes, así que no se genera archivo. Si el cliente no tuvo
                    operaciones, el formato se presenta en cero en la Oficina Virtual, opción “Declaraciones en cero”.
                  </p>
                </div>
              )}

              {formato === '606' && (
                <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-[#eef0fb] dark:bg-indigo-950/30 px-5 py-4 text-xs text-[#151f66] dark:text-indigo-200">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Antes de enviarlo, pasa el archivo por la Herramienta de Pre-validación de la DGII. Este sistema
                    aplica las reglas de las herramientas de envío oficiales, pero la validación definitiva (NCF
                    autorizados, RNC activos) solo la hace la DGII.
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Pagina>
  )
}

function OpcionFormato({ activo, onClick, icono: Icono, titulo, etiqueta, texto }: {
  activo: boolean; onClick: () => void; icono: typeof Landmark; titulo: string; etiqueta: string; texto: string
}) {
  return (
    <button
      type="button" role="radio" aria-checked={activo} onClick={onClick}
      className={cn(
        'group relative flex items-start gap-3 rounded-2xl border p-4 text-left transition-all',
        activo
          ? 'border-[#1B2980]/40 bg-white shadow-[0_10px_30px_-18px_rgba(27,41,128,0.6)] ring-4 ring-[#1B2980]/[0.06] dark:border-indigo-500/50 dark:bg-[#141722] dark:ring-indigo-500/10'
          : 'border-zinc-200/80 bg-white/60 hover:border-zinc-300 hover:bg-white dark:border-[#252840] dark:bg-[#141722]/60 dark:hover:bg-[#141722]',
      )}
    >
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors', activo ? 'bg-gradient-to-br from-[#1B2980] to-[#2f3fa8] text-white' : 'bg-zinc-100 text-zinc-500 dark:bg-[#1a1d2e] dark:text-zinc-400')}>
        <Icono className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{titulo}</span>
          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:bg-[#1a1d2e] dark:text-zinc-400">{etiqueta}</span>
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{texto}</span>
      </span>
      <span aria-hidden="true" className={cn('absolute right-4 top-4 flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors', activo ? 'border-[#1B2980] dark:border-indigo-400' : 'border-zinc-300 dark:border-zinc-600')}>
        {activo && <span className="h-1.5 w-1.5 rounded-full bg-[#1B2980] dark:bg-indigo-400" />}
      </span>
    </button>
  )
}

function Total({ etiqueta, valor, icono: Icono, alerta }: { etiqueta: string; valor: string; icono: typeof Landmark; alerta?: boolean }) {
  return (
    <div className="px-5 py-4 sm:px-6">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        <Icono className="h-3.5 w-3.5" aria-hidden="true" />{etiqueta}
      </dt>
      <dd className={cn('mt-1 truncate text-lg font-semibold tabular-nums tracking-[-0.01em] sm:text-xl', alerta ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-50')}>{valor}</dd>
    </div>
  )
}
