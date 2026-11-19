'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CircleStop, FileUp, FlaskConical, LoaderCircle, QrCode } from 'lucide-react'
import { Pagina } from '@/components/layout/Pagina'
import { BTN_SECONDARY, CARD_CLASS, INPUT_CLASS, LABEL_CLASS, SUBTITULO_TARJETA, TITULO_TARJETA } from '@/components/ui/clases'
import { leerCodigoOCR } from '@/lib/config-local'
import { useDatos } from '@/lib/datos/datos-context'
import { ETIQUETA_CAMPO } from '@/lib/documentos'
import { LoteError, leerPaginas } from '@/lib/lote/leer-paginas'
import { OCRError, extraerFactura } from '@/lib/ocr-cliente'
import {
  MODELOS_OCR,
  MODELO_OCR_POR_DEFECTO,
  aciertosContraQr,
  compararLecturas,
  costoUSD,
  modeloOCR,
  type AciertoQr,
  type CampoComparado,
} from '@/lib/ocr-modelos'
import type { ResultadoOCR } from '@/lib/ocr-tipos'
import { leerQrEcf, type DatosQrEcf } from '@/lib/qr-ecf'
import { BTN_PRIMARY, cn } from '@/lib/utils'

// Herramienta para elegir el modelo de IA con datos: lee las mismas páginas
// con dos modelos y muestra en qué campos difieren, cuántos datos del QR
// acertó cada uno (el QR lo firmó el emisor: es la referencia exacta) y lo
// que costó cada uno. No guarda nada.

// Tope de páginas: cada una se paga dos veces.
const MAXIMO_PAGINAS = 20
// Páginas que se leen a la vez (cada una con los dos modelos).
const SIMULTANEAS = 2

interface Lectura {
  resultado?: ResultadoOCR
  error?: string
  ms: number
}

interface PaginaComparada {
  numero: number
  imagen: string
  qr: DatosQrEcf | null
  a?: Lectura
  b?: Lectura
}

const ETIQUETA: Record<CampoComparado, string> = {
  ...ETIQUETA_CAMPO,
  tipo: 'Compra o venta',
  esComprobante: 'Es una factura',
}

function usd(valor: number): string {
  return `US$${valor.toFixed(valor < 0.01 ? 4 : 3)}`
}

export default function CompararModelosPage() {
  const { clientes } = useDatos()
  const [clienteId, setClienteId] = useState('')
  const [modeloA, setModeloA] = useState(MODELO_OCR_POR_DEFECTO)
  const [modeloB, setModeloB] = useState('claude-haiku-5-5')
  const [archivos, setArchivos] = useState<File[]>([])
  const [paginas, setPaginas] = useState<PaginaComparada[]>([])
  const [estado, setEstado] = useState<'inicio' | 'leyendo' | 'listo'>('inicio')
  const [error, setError] = useState('')
  const detener = useRef(false)

  useEffect(() => {
    if (!clienteId && clientes.length) setClienteId(clientes[0].id)
  }, [clientes, clienteId])

  // Libera las imágenes al salir.
  useEffect(() => () => paginas.forEach(p => URL.revokeObjectURL(p.imagen)), [paginas])

  const cliente = clientes.find(c => c.id === clienteId)
  const nombreA = modeloOCR(modeloA)?.nombre ?? modeloA
  const nombreB = modeloOCR(modeloB)?.nombre ?? modeloB

  async function comparar() {
    setError('')
    if (!leerCodigoOCR()) return setError('Falta el código de acceso. Escríbelo en Configuración.')
    if (!cliente) return setError('Elige la empresa a la que pertenecen las facturas.')
    if (modeloA === modeloB) return setError('Elige dos modelos distintos.')
    if (!archivos.length) return setError('Sube un PDF o unas fotos.')

    detener.current = false
    setEstado('leyendo')
    paginas.forEach(p => URL.revokeObjectURL(p.imagen))
    setPaginas([])

    // 1. Separar las páginas y leer el QR (en el navegador, gratis).
    const leidas: { numero: number; imagen: Blob }[] = []
    try {
      await leerPaginas(archivos, (pagina, total) => {
        if (total > MAXIMO_PAGINAS) throw new LoteError(`La comparación admite hasta ${MAXIMO_PAGINAS} páginas (cada una se lee dos veces). Este archivo trae ${total}.`)
        leidas.push({ numero: pagina.numero, imagen: pagina.imagen })
        const qr = pagina.textoQr ? leerQrEcf(pagina.textoQr) : null
        setPaginas(prev => [...prev, { numero: pagina.numero, imagen: URL.createObjectURL(pagina.imagen), qr }])
      }, () => detener.current)
    } catch (e) {
      setError(e instanceof LoteError ? e.message : 'No se pudieron leer las páginas del archivo.')
      setEstado('inicio')
      return
    }

    // 2. Leer cada página con los dos modelos a la vez.
    const contexto = { rncCliente: cliente.rncCedula, actividad: cliente.actividad }
    async function leer(imagen: Blob, numero: number, modelo: string): Promise<Lectura> {
      const inicio = performance.now()
      try {
        const archivo = new File([imagen], `pagina-${numero}.jpg`, { type: imagen.type || 'image/jpeg' })
        const resultado = await extraerFactura(archivo, 'compra', { ...contexto, modelo })
        return { resultado, ms: performance.now() - inicio }
      } catch (e) {
        if (e instanceof OCRError && (e.esDeCodigo || e.sinServicio)) detener.current = true
        return { error: e instanceof Error ? e.message : 'Error desconocido', ms: performance.now() - inicio }
      }
    }

    let siguiente = 0
    async function trabajador() {
      while (!detener.current && siguiente < leidas.length) {
        const { numero, imagen } = leidas[siguiente++]
        const [a, b] = await Promise.all([leer(imagen, numero, modeloA), leer(imagen, numero, modeloB)])
        setPaginas(prev => prev.map(p => (p.numero === numero ? { ...p, a, b } : p)))
      }
    }
    await Promise.all(Array.from({ length: SIMULTANEAS }, trabajador))
    setEstado('listo')
  }

  const resumen = useMemo(() => {
    const porModelo = (lado: 'a' | 'b') => {
      let costo = 0, ms = 0, leidas = 0, errores = 0, aciertos = 0, totalQr = 0
      for (const p of paginas) {
        const l = p[lado]
        if (!l) continue
        if (l.error || !l.resultado) { errores++; continue }
        leidas++
        ms += l.ms
        if (l.resultado.uso) costo += costoUSD(l.resultado.uso) ?? 0
        if (p.qr && cliente) {
          const r = aciertosContraQr(l.resultado, p.qr, cliente.rncCedula)
          aciertos += r.aciertos
          totalQr += r.total
        }
      }
      return { costo, leidas, errores, aciertos, totalQr, msPromedio: leidas ? ms / leidas : 0 }
    }
    let iguales = 0, comparados = 0
    for (const p of paginas) {
      if (!p.a?.resultado || !p.b?.resultado) continue
      const c = compararLecturas(p.a.resultado, p.b.resultado)
      comparados += c.comparados
      iguales += c.comparados - c.diferencias.length
    }
    return { a: porModelo('a'), b: porModelo('b'), iguales, comparados }
  }, [paginas, cliente])

  const terminadas = paginas.filter(p => p.a && p.b).length

  return (
    <Pagina title="Comparar modelos de IA" subtitle="Lee las mismas facturas con dos modelos para elegir con datos. No guarda nada.">
      <Link href="/configuracion" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        <ArrowLeft className="h-4 w-4" /> Configuración
      </Link>

      <div className={cn(CARD_CLASS, 'p-5')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="empresa" className={LABEL_CLASS}>Empresa de las facturas</label>
            <select id="empresa" value={clienteId} onChange={e => setClienteId(e.target.value)} className={INPUT_CLASS} disabled={estado === 'leyendo'}>
              {clientes.length === 0 && <option value="">No hay empresas</option>}
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombreComercial || c.razonSocial}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="modelo-a" className={LABEL_CLASS}>Modelo A</label>
            <select id="modelo-a" value={modeloA} onChange={e => setModeloA(e.target.value)} className={INPUT_CLASS} disabled={estado === 'leyendo'}>
              {MODELOS_OCR.map(m => <option key={m.id} value={m.id}>{m.nombre}{m.id === MODELO_OCR_POR_DEFECTO ? ' (el actual)' : ''}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="modelo-b" className={LABEL_CLASS}>Modelo B</label>
            <select id="modelo-b" value={modeloB} onChange={e => setModeloB(e.target.value)} className={INPUT_CLASS} disabled={estado === 'leyendo'}>
              {MODELOS_OCR.map(m => <option key={m.id} value={m.id}>{m.nombre}{m.id === MODELO_OCR_POR_DEFECTO ? ' (el actual)' : ''}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className={cn(BTN_SECONDARY, 'cursor-pointer', estado === 'leyendo' && 'pointer-events-none opacity-50')}>
            <FileUp className="h-4 w-4" />
            {archivos.length ? `${archivos.length} archivo(s) elegido(s)` : 'Elegir PDF o fotos'}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={e => setArchivos(Array.from(e.target.files ?? []))}
            />
          </label>
          {estado === 'leyendo' ? (
            <button type="button" onClick={() => { detener.current = true }} className={BTN_SECONDARY}>
              <CircleStop className="h-4 w-4" /> Detener
            </button>
          ) : (
            <button type="button" onClick={comparar} className={BTN_PRIMARY}>
              <FlaskConical className="h-4 w-4" /> Comparar
            </button>
          )}
          {estado === 'leyendo' && (
            <span className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <LoaderCircle className="h-4 w-4 animate-spin" /> {terminadas} de {paginas.length} página(s)
            </span>
          )}
        </div>
        <p className={cn(SUBTITULO_TARJETA, 'mt-3')}>
          Hasta {MAXIMO_PAGINAS} páginas. Cada página se lee con los dos modelos, así que se paga dos veces. Los costos son estimados con los
          precios de lista; el exacto está en la consola de Anthropic.
        </p>
        {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      {paginas.some(p => p.a || p.b) && (
        <div className="grid gap-4 md:grid-cols-3">
          {([['a', nombreA], ['b', nombreB]] as const).map(([lado, nombre]) => {
            const r = resumen[lado]
            return (
              <div key={lado} className={cn(CARD_CLASS, 'p-5')}>
                <p className={SUBTITULO_TARJETA}>Modelo {lado.toUpperCase()}</p>
                <p className={cn(TITULO_TARJETA, 'mt-0.5')}>{nombre}</p>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-zinc-500 dark:text-zinc-400">Costo total</dt>
                  <dd className="text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{usd(r.costo)}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">Por página</dt>
                  <dd className="text-right tabular-nums text-zinc-900 dark:text-zinc-100">{r.leidas ? usd(r.costo / r.leidas) : '—'}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">Tiempo promedio</dt>
                  <dd className="text-right tabular-nums text-zinc-900 dark:text-zinc-100">{r.leidas ? `${(r.msPromedio / 1000).toFixed(1)} s` : '—'}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">Datos del QR acertados</dt>
                  <dd className="text-right tabular-nums text-zinc-900 dark:text-zinc-100">{r.totalQr ? `${r.aciertos} de ${r.totalQr}` : '—'}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">Páginas con error</dt>
                  <dd className="text-right tabular-nums text-zinc-900 dark:text-zinc-100">{r.errores}</dd>
                </dl>
              </div>
            )
          })}
          <div className={cn(CARD_CLASS, 'p-5')}>
            <p className={SUBTITULO_TARJETA}>Coincidencia entre los dos</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50">
              {resumen.comparados ? `${Math.round((resumen.iguales / resumen.comparados) * 100)}%` : '—'}
            </p>
            <p className={cn(SUBTITULO_TARJETA, 'mt-1')}>
              {resumen.iguales} de {resumen.comparados} campos leídos iguales. Donde difieren, abajo se ve cuál acertó el QR (cuando la factura lo tiene).
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {paginas.map(p => (
          <FilaPagina key={p.numero} pagina={p} nombreA={nombreA} nombreB={nombreB} rncCliente={cliente?.rncCedula ?? ''} />
        ))}
      </div>
    </Pagina>
  )
}

function FilaPagina({ pagina, nombreA, nombreB, rncCliente }: { pagina: PaginaComparada; nombreA: string; nombreB: string; rncCliente: string }) {
  const { a, b, qr } = pagina
  const comparacion = a?.resultado && b?.resultado ? compararLecturas(a.resultado, b.resultado) : null
  const qrA = qr && a?.resultado ? aciertosContraQr(a.resultado, qr, rncCliente) : null
  const qrB = qr && b?.resultado ? aciertosContraQr(b.resultado, qr, rncCliente) : null

  return (
    <div className={cn(CARD_CLASS, 'flex flex-col gap-4 p-4 sm:flex-row')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pagina.imagen} alt={`Página ${pagina.numero}`} className="h-28 w-20 shrink-0 rounded-lg border border-zinc-200 object-cover object-top dark:border-[#252840]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Página {pagina.numero}</span>
          {qr && <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"><QrCode className="h-3 w-3" /> QR</span>}
          {!a || !b ? (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500"><LoaderCircle className="h-3 w-3 animate-spin" /> Leyendo…</span>
          ) : comparacion ? (
            <span className={cn('text-xs', comparacion.diferencias.length ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300')}>
              {comparacion.diferencias.length ? `${comparacion.diferencias.length} diferencia(s)` : 'Leyeron lo mismo'}
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <ResumenLado nombre={nombreA} lectura={a} qr={qrA} />
          <ResumenLado nombre={nombreB} lectura={b} qr={qrB} />
        </div>

        {comparacion && comparacion.diferencias.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                  <th className="py-1 pr-3 font-medium">Campo</th>
                  <th className="py-1 pr-3 font-medium">{nombreA}</th>
                  <th className="py-1 font-medium">{nombreB}</th>
                </tr>
              </thead>
              <tbody>
                {comparacion.diferencias.map(d => {
                  const fallaA = d.campo !== 'tipo' && d.campo !== 'esComprobante' && qrA?.fallos.includes(d.campo)
                  const fallaB = d.campo !== 'tipo' && d.campo !== 'esComprobante' && qrB?.fallos.includes(d.campo)
                  return (
                    <tr key={d.campo} className="border-t border-zinc-100 dark:border-[#1d2035]">
                      <td className="py-1.5 pr-3 text-zinc-600 dark:text-zinc-400">{ETIQUETA[d.campo]}</td>
                      <td className={cn('py-1.5 pr-3 tabular-nums', fallaA ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100')}>
                        {d.a}{fallaA && ' ✗'}
                      </td>
                      <td className={cn('py-1.5 tabular-nums', fallaB ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100')}>
                        {d.b}{fallaB && ' ✗'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {(qrA || qrB) && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">✗ = no coincide con el QR de la factura.</p>}
          </div>
        )}
      </div>
    </div>
  )
}

function ResumenLado({ nombre, lectura, qr }: { nombre: string; lectura?: Lectura; qr: AciertoQr | null }) {
  if (!lectura) return null
  if (lectura.error) return <span className="text-rose-600 dark:text-rose-400">{nombre}: {lectura.error}</span>
  const costo = lectura.resultado?.uso ? costoUSD(lectura.resultado.uso) : null
  return (
    <span>
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{nombre}</span>
      {' · '}{(lectura.ms / 1000).toFixed(1)} s
      {costo !== null && <> · {usd(costo)}</>}
      {qr && qr.total > 0 && <> · QR {qr.aciertos}/{qr.total}</>}
      {lectura.resultado && !lectura.resultado.esComprobante && ' · no es factura'}
    </span>
  )
}
