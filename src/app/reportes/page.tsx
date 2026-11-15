'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Download, FileSpreadsheet, FileText, Info, Users } from 'lucide-react'
import { AvisoErrorCarga, Pagina } from '@/components/layout/Pagina'
import { EmptyState } from '@/components/ui/EmptyState'
import { BTN_SECONDARY, CARD_CLASS, INPUT_CLASS, LABEL_CLASS, TH_CLASS } from '@/components/ui/clases'
import { useDatos } from '@/lib/datos/datos-context'
import { fechaLimite606607 } from '@/lib/dgii-fiscal'
import { generar606, generar607, separarVentas607, type ArchivoDGII } from '@/lib/dgii-formatos'
import { construirExcel606, construirExcel607 } from '@/lib/excel-reporte'
import { periodoDe, problemasDeRevision } from '@/lib/documentos'
import { BTN_PRIMARY, cn, formatDate, formatPeriodo, formatRD } from '@/lib/utils'
import type { DocumentoFiscal } from '@/types'

type Formato = '606' | '607'

function descargar(archivo: ArchivoDGII) {
  const url = URL.createObjectURL(new Blob([archivo.contenido], { type: 'text/plain' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = archivo.nombreArchivo
  enlace.click()
  URL.revokeObjectURL(url)
}

export default function ReportesPage() {
  const { listo, errorCarga, clientes, documentos } = useDatos()
  const [clienteId, setClienteId] = useState('')
  const [formato, setFormato] = useState<Formato>('606')
  const [periodo, setPeriodo] = useState('') // "YYYY-MM"
  const [errorExcel, setErrorExcel] = useState<string | null>(null)

  const cliente = clientes.find(c => c.id === clienteId) ?? clientes[0]

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
    let detalladas: DocumentoFiscal[] = validas
    let resumenConsumo = null
    if (formato === '607') {
      const separadas = separarVentas607(validas)
      detalladas = separadas.detalladas
      resumenConsumo = separadas.resumenConsumo
    }
    if (detalladas.length > 0) {
      try {
        archivo = formato === '606'
          ? generar606(cliente.rncCedula, periodoDgii, detalladas)
          : generar607(cliente.rncCedula, periodoDgii, detalladas)
      } catch (e) {
        errorArchivo = e instanceof Error ? e.message : 'No se pudo generar el archivo.'
      }
    }
    const [anio, mes] = periodo.split('-').map(Number)
    return { pendientes, conErrores, validas, detalladas, resumenConsumo, archivo, errorArchivo, anio, mes }
  }, [cliente, periodo, formato, documentos])

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
      }
      const libro = formato === '606' ? construirExcel606(entrada) : construirExcel607(entrada)
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
    <Pagina title="Reportes" subtitle="Archivos de envío 606 y 607 para la DGII">
      {errorCarga && <AvisoErrorCarga mensaje={errorCarga} />}

      {listo && !errorCarga && clientes.length === 0 && (
        <div className="flex flex-col items-center gap-4">
          <EmptyState icon={Users} title="Primero crea un cliente" message="Los reportes se generan por cliente y por mes." className="w-full" />
          <Link href="/clientes" className={BTN_PRIMARY}>Ir a Clientes</Link>
        </div>
      )}

      {cliente && (
        <>
          <div className={cn(CARD_CLASS, 'grid gap-3 px-5 py-4 sm:grid-cols-3')}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reporte-cliente" className={LABEL_CLASS}>Cliente</label>
              <select id="reporte-cliente" value={cliente.id} onChange={e => setClienteId(e.target.value)} className={INPUT_CLASS}>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reporte-formato" className={LABEL_CLASS}>Formato</label>
              <select id="reporte-formato" value={formato} onChange={e => setFormato(e.target.value as Formato)} className={INPUT_CLASS}>
                <option value="606">606 · Compras de bienes y servicios</option>
                <option value="607">607 · Ventas de bienes y servicios</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reporte-periodo" className={LABEL_CLASS}>Mes</label>
              <input id="reporte-periodo" type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className={INPUT_CLASS} />
            </div>
          </div>

          {!analisis && (
            <EmptyState icon={FileText} title="Elige el mes" message="Selecciona el mes que vas a reportar para ver qué facturas entran." />
          )}

          {analisis && (
            <>
              <div className={cn(CARD_CLASS, 'px-5 py-4 space-y-3')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Formato {formato} · {formatPeriodo(analisis.anio, analisis.mes)} · {cliente.razonSocial}
                    </h2>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      Vence el {formatDate(fechaLimite606607(analisis.anio, analisis.mes))} (día 15 del mes siguiente; no ajustado por fines de semana ni feriados).
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void exportarExcel()}
                      disabled={analisis.validas.length === 0}
                      className={BTN_SECONDARY}
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      Exportar a Excel
                    </button>
                    <button
                      onClick={() => analisis.archivo && descargar(analisis.archivo)}
                      disabled={!analisis.archivo || !completo}
                      className={BTN_PRIMARY}
                    >
                      <Download className="h-4 w-4" />
                      Descargar TXT
                    </button>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><dt className={LABEL_CLASS}>En el archivo</dt><dd className="mt-1 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{analisis.detalladas.length}</dd></div>
                  <div><dt className={LABEL_CLASS}>Monto facturado</dt><dd className="mt-1 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(analisis.archivo?.totalMontoFacturado ?? 0)}</dd></div>
                  <div><dt className={LABEL_CLASS}>ITBIS facturado</dt><dd className="mt-1 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(analisis.archivo?.totalItbisFacturado ?? 0)}</dd></div>
                  <div><dt className={LABEL_CLASS}>Por revisar</dt><dd className={cn('mt-1 text-lg font-bold tabular-nums', analisis.pendientes.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-100')}>{analisis.pendientes.length}</dd></div>
                </dl>

                {analisis.archivo && <p className="text-xs text-zinc-500 dark:text-zinc-400">Archivo: <span className="font-mono">{analisis.archivo.nombreArchivo}</span>. Las notas de crédito restan en los totales.</p>}
                {errorExcel && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{errorExcel}</p>}
                {analisis.errorArchivo && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{analisis.errorArchivo}</p>}
              </div>

              {analisis.pendientes.length > 0 && (
                <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-5 py-4 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Hay {analisis.pendientes.length} factura(s) de este mes sin revisar. No se puede descargar un archivo incompleto:{' '}
                    <Link href={`/facturas?cliente=${cliente.id}`} className="font-semibold underline">revísalas</Link> o elimínalas primero.
                  </p>
                </div>
              )}

              {analisis.conErrores.length > 0 && (
                <div className={cn(CARD_CLASS, 'overflow-hidden')}>
                  <div className="border-b border-zinc-100 dark:border-[#1d2035] px-5 py-4">
                    <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-400">
                      {analisis.conErrores.length} factura(s) revisada(s) que la DGII rechazaría
                    </h2>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Corrígelas en Facturas para poder descargar el archivo.</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-[#1d2035] bg-zinc-50 dark:bg-[#1a1d2e]">
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

              {analisis.resumenConsumo && analisis.resumenConsumo.cantidad > 0 && (
                <div className={cn(CARD_CLASS, 'px-5 py-4')}>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Resumen de facturas de consumo</h2>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    Las facturas de consumo menores de RD$250,000 no van en el archivo. Digita estos totales en el
                    “Resumen General de Facturas de Consumo” al enviar el 607 por la Oficina Virtual.
                  </p>
                  <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                    <div><dt className={LABEL_CLASS}>Cantidad</dt><dd className="mt-1 font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{analisis.resumenConsumo.cantidad}</dd></div>
                    <div><dt className={LABEL_CLASS}>Monto facturado</dt><dd className="mt-1 font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(analisis.resumenConsumo.montoFacturado)}</dd></div>
                    <div><dt className={LABEL_CLASS}>ITBIS facturado</dt><dd className="mt-1 font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(analisis.resumenConsumo.itbisFacturado)}</dd></div>
                  </dl>
                </div>
              )}

              {completo && analisis.detalladas.length === 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-[#eef0fb] dark:bg-indigo-950/30 px-5 py-4 text-xs text-[#151f66] dark:text-indigo-200">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    No hay comprobantes que detallar en este mes, así que no se genera archivo. Si el cliente no tuvo
                    operaciones, el formato se presenta en cero en la Oficina Virtual, opción “Declaraciones en cero”.
                  </p>
                </div>
              )}

              <div className="flex items-start gap-3 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-[#eef0fb] dark:bg-indigo-950/30 px-5 py-4 text-xs text-[#151f66] dark:text-indigo-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Antes de enviarlo, pasa el archivo por la Herramienta de Pre-validación de la DGII. Este sistema
                  aplica las reglas de las herramientas de envío oficiales, pero la validación definitiva (NCF
                  autorizados, RNC activos) solo la hace la DGII.
                </p>
              </div>
            </>
          )}
        </>
      )}
    </Pagina>
  )
}
