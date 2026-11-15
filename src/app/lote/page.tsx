'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, CircleCheck, FileUp, Info, LoaderCircle, QrCode, Users } from 'lucide-react'
import { AvisoErrorCarga, Pagina } from '@/components/layout/Pagina'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { BTN_SECONDARY, CARD_CLASS, INPUT_CLASS, LABEL_CLASS } from '@/components/ui/clases'
import { useDatos } from '@/lib/datos/datos-context'
import { documentoDesdePagina, interpretarPagina, type BorradorPagina, type EstadoPagina } from '@/lib/lote/borrador'
import { LoteError, MAXIMO_PAGINAS_LOTE, leerPaginas, type PaginaLeida } from '@/lib/lote/leer-paginas'
import { BTN_PRIMARY, cn, formatCedula, formatDate, formatRD } from '@/lib/utils'
import type { DocumentoFiscal, TipoDocumento } from '@/types'

// Captura por lotes: un PDF de muchas páginas (o varias fotos) → una factura
// pendiente por página, con lo que diga su código QR. Ver CLAUDE.md,
// "Requisito de captura" y "Primera muestra real".

interface PaginaLote extends PaginaLeida {
  url: string // object URL de la imagen, para la miniatura
  borrador: BorradorPagina
  incluir: boolean
}

type Fase = 'inicio' | 'leyendo' | 'resultado' | 'guardado'

const ETIQUETA_ESTADO: Record<EstadoPagina, { texto: string; variante: 'success' | 'neutral' | 'danger' | 'warning' }> = {
  qr: { texto: 'QR leído', variante: 'success' },
  sin_qr: { texto: 'Sin QR', variante: 'neutral' },
  ajena: { texto: 'De otro contribuyente', variante: 'danger' },
  duplicada: { texto: 'Duplicada', variante: 'warning' },
}

// Una página duplicada o ajena no se puede incluir.
const esIncluible = (p: PaginaLote) => p.borrador.estado === 'qr' || p.borrador.estado === 'sin_qr'

function LoteContenido() {
  const params = useSearchParams()
  const { listo, errorCarga, clientes, documentos, guardarLote } = useDatos()

  const [clienteId, setClienteId] = useState(params.get('cliente') ?? '')
  const [tipoPorDefecto, setTipoPorDefecto] = useState<TipoDocumento>('compra')
  const [fase, setFase] = useState<Fase>('inicio')
  const [paginas, setPaginas] = useState<PaginaLote[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardadas, setGuardadas] = useState(0)
  const inputArchivos = useRef<HTMLInputElement>(null)

  const cliente = clientes.find(c => c.id === clienteId) ?? clientes[0]

  // Si se sale de la pantalla a mitad de la lectura, esta se detiene; y las
  // miniaturas se liberan.
  const vivo = useRef(true)
  const urls = useRef<string[]>([])
  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      urls.current.forEach(u => URL.revokeObjectURL(u))
    }
  }, [])

  function reiniciar() {
    urls.current.forEach(u => URL.revokeObjectURL(u))
    urls.current = []
    setPaginas([])
    setTotal(0)
    setError(null)
    setFase('inicio')
  }

  async function procesar(lista: FileList | null) {
    if (!cliente || !lista || lista.length === 0) return
    const archivos = Array.from(lista)
    reiniciar()
    setFase('leyendo')

    // Facturas contra las que se detectan duplicados: las guardadas y las de
    // las páginas ya leídas de este mismo lote.
    const existentes: Pick<DocumentoFiscal, 'id' | 'clienteId' | 'tipo' | 'ncf' | 'rncCedulaContraparte' | 'estadoRevision'>[] = [...documentos]
    try {
      await leerPaginas(archivos, (pagina, totalPaginas) => {
        const borrador = interpretarPagina(pagina.textoQr, { cliente, tipoPorDefecto, existentes })
        if (borrador.estado === 'qr') {
          existentes.push({
            id: `lote-${pagina.numero}`, clienteId: cliente.id, tipo: borrador.tipo, ncf: borrador.campos.ncf,
            rncCedulaContraparte: borrador.campos.rncCedulaContraparte, estadoRevision: 'pendiente_revision',
          })
        }
        const url = URL.createObjectURL(pagina.imagen)
        urls.current.push(url)
        setTotal(totalPaginas)
        setPaginas(prev => [...prev, { ...pagina, url, borrador, incluir: borrador.estado === 'qr' || borrador.estado === 'sin_qr' }])
      }, () => !vivo.current)
      if (vivo.current) setFase('resultado')
    } catch (e) {
      if (!vivo.current) return
      setError(e instanceof LoteError ? e.message : 'No se pudo leer el lote. Intenta de nuevo con otro archivo.')
      setFase(prev => (prev === 'leyendo' ? 'inicio' : prev))
    }
  }

  const conteo = useMemo(() => {
    const por = (estado: EstadoPagina) => paginas.filter(p => p.borrador.estado === estado).length
    return { qr: por('qr'), sinQr: por('sin_qr'), ajenas: por('ajena'), duplicadas: por('duplicada'), incluidas: paginas.filter(p => p.incluir).length }
  }, [paginas])

  function alternar(numero: number) {
    setPaginas(prev => prev.map(p => (p.numero === numero && esIncluible(p) ? { ...p, incluir: !p.incluir } : p)))
  }

  function incluirSinQr(incluir: boolean) {
    setPaginas(prev => prev.map(p => (p.borrador.estado === 'sin_qr' ? { ...p, incluir } : p)))
  }

  async function guardar() {
    if (!cliente) return
    const elegidas = paginas.filter(p => p.incluir)
    if (elegidas.length === 0) return
    setGuardando(true)
    setError(null)
    const ahora = new Date().toISOString()
    try {
      await guardarLote(elegidas.map(p => ({
        documento: documentoDesdePagina(crypto.randomUUID(), p.borrador, cliente, { nombre: p.archivoNombre, pagina: p.paginaEnArchivo }, ahora),
        archivo: p.imagen,
      })))
      setGuardadas(elegidas.length)
      setFase('guardado')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el lote.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Pagina title="Subir lote" subtitle="Un PDF con muchas facturas, o varias fotos">
      {errorCarga && <AvisoErrorCarga mensaje={errorCarga} />}

      {listo && !errorCarga && clientes.length === 0 && (
        <div className="flex flex-col items-center gap-4">
          <EmptyState icon={Users} title="Primero crea un cliente" message="Cada lote de facturas pertenece a un cliente." className="w-full" />
          <Link href="/clientes" className={BTN_PRIMARY}>Ir a Clientes</Link>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-5 py-4 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* ── Inicio: cliente y archivos ─────────────────────────────────── */}
      {cliente && fase === 'inicio' && (
        <div className={cn(CARD_CLASS, 'space-y-4 px-5 py-4')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lote-cliente" className={LABEL_CLASS}>Cliente</label>
              <select id="lote-cliente" value={cliente.id} onChange={e => setClienteId(e.target.value)} className={INPUT_CLASS}>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lote-tipo" className={LABEL_CLASS}>Páginas sin código QR</label>
              <select id="lote-tipo" value={tipoPorDefecto} onChange={e => setTipoPorDefecto(e.target.value as TipoDocumento)} className={INPUT_CLASS}>
                <option value="compra">Tratarlas como compras</option>
                <option value="venta">Tratarlas como ventas</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => inputArchivos.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); void procesar(e.dataTransfer.files) }}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 dark:border-[#33395a] px-6 py-12 text-center transition-colors hover:border-[#1B2980] hover:bg-[#eef0fb]/40 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/20"
          >
            <FileUp className="h-8 w-8 text-[#1B2980] dark:text-indigo-400" strokeWidth={1.75} />
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Sube el PDF del mes o varias fotos</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Hasta {MAXIMO_PAGINAS_LOTE} páginas por lote. Arrastra los archivos aquí o haz clic.
            </span>
          </button>
          <input
            ref={inputArchivos}
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => { void procesar(e.target.files); e.target.value = '' }}
          />

          <p className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              El sistema separa las páginas y lee el código QR de los comprobantes electrónicos: de ahí salen, exactos,
              el RNC, el e-NCF, la fecha y el total, y si la factura es una compra o una venta de este cliente. Este
              paso ocurre en tu navegador: no envía nada a ningún servidor ni tiene costo.
            </span>
          </p>
        </div>
      )}

      {/* ── Leyendo ────────────────────────────────────────────────────── */}
      {fase === 'leyendo' && (
        <div role="status" className={cn(CARD_CLASS, 'flex items-center gap-4 px-5 py-4')}>
          <LoaderCircle className="h-6 w-6 shrink-0 animate-spin text-[#1B2980] dark:text-indigo-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {total > 0 ? `Leyendo página ${Math.min(paginas.length + 1, total)} de ${total}…` : 'Abriendo los archivos…'}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Códigos QR leídos hasta ahora: {conteo.qr}. No cierres esta pantalla.</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-[#1a1d2e]">
              <div className="h-full rounded-full bg-[#1B2980] dark:bg-indigo-500 transition-[width]" style={{ width: `${total ? (paginas.length / total) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Resultado ──────────────────────────────────────────────────── */}
      {cliente && fase === 'resultado' && (
        <div className={cn(CARD_CLASS, 'space-y-3 px-5 py-4')}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {paginas.length} página(s) de {cliente.razonSocial}
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {conteo.qr} con QR leído · {conteo.sinQr} sin QR
                {conteo.duplicadas > 0 && ` · ${conteo.duplicadas} duplicada(s)`}
                {conteo.ajenas > 0 && ` · ${conteo.ajenas} de otro contribuyente`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={reiniciar} className={BTN_SECONDARY}>Empezar de nuevo</button>
              <button type="button" onClick={() => void guardar()} disabled={guardando || conteo.incluidas === 0} className={BTN_PRIMARY}>
                Guardar {conteo.incluidas} como pendientes
              </button>
            </div>
          </div>
          {conteo.sinQr > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-zinc-200 dark:border-[#252840] bg-zinc-50 dark:bg-[#1a1d2e] px-3.5 py-2.5 text-xs text-zinc-600 dark:text-zinc-400">
              <span className="min-w-[240px] flex-1">
                Las {conteo.sinQr} páginas sin QR se guardan vacías, con su imagen, para completarlas después. Quita las
                que no sean facturas (portadas, declaraciones, hojas en blanco).
              </span>
              <button type="button" onClick={() => incluirSinQr(false)} className="font-semibold text-[#1B2980] dark:text-indigo-400 hover:underline">Quitar todas las sin QR</button>
              <button type="button" onClick={() => incluirSinQr(true)} className="font-semibold text-[#1B2980] dark:text-indigo-400 hover:underline">Incluirlas todas</button>
            </div>
          )}
          {conteo.ajenas > 0 && (
            <p className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Hay facturas cuyo QR nombra a otro contribuyente. Si son muchas, revisa que elegiste el cliente correcto.</span>
            </p>
          )}
        </div>
      )}

      {(fase === 'leyendo' || fase === 'resultado') && paginas.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {paginas.map(p => {
            const { texto, variante } = ETIQUETA_ESTADO[p.borrador.estado]
            const c = p.borrador.campos
            return (
              <li key={p.numero} className={cn(CARD_CLASS, 'flex flex-col overflow-hidden', !p.incluir && 'opacity-60')}>
                <div className="relative h-44 bg-zinc-100 dark:bg-[#0d0f1a]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- object URL local, no optimizable */}
                  <img src={p.url} alt={`Página ${p.numero}`} loading="lazy" className="h-full w-full object-contain object-top" />
                  <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">Pág. {p.numero}</span>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={variante}>{p.borrador.estado === 'qr' && <QrCode className="mr-1 h-3 w-3" />}{texto}</Badge>
                    {p.borrador.estado !== 'sin_qr' && <Badge variant="default">{p.borrador.tipo === 'compra' ? 'Compra' : 'Venta'}</Badge>}
                  </div>
                  {p.borrador.estado === 'sin_qr' ? (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">Sin datos: se completa después.</p>
                  ) : (
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      <p className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">{c.ncf}</p>
                      <p className="tabular-nums">{c.rncCedulaContraparte ? formatCedula(c.rncCedulaContraparte) : 'Sin RNC'}</p>
                      <p className="tabular-nums">
                        {c.fechaComprobante ? formatDate(c.fechaComprobante) : 'Sin fecha'}
                        {c.montoTotal !== null && ` · ${formatRD(c.montoTotal)}`}
                      </p>
                    </div>
                  )}
                  {p.borrador.nota && <p className="text-[11px] text-rose-600 dark:text-rose-400">{p.borrador.nota}</p>}
                  {fase === 'resultado' && esIncluible(p) && (
                    <label className="mt-auto flex cursor-pointer items-center gap-2 pt-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      <input type="checkbox" checked={p.incluir} onChange={() => alternar(p.numero)} className="h-4 w-4 rounded accent-[#1B2980]" />
                      Incluir página {p.numero}
                    </label>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* ── Guardado ───────────────────────────────────────────────────── */}
      {cliente && fase === 'guardado' && (
        <div className={cn(CARD_CLASS, 'flex flex-col items-center gap-3 px-6 py-12 text-center')}>
          <CircleCheck className="h-10 w-10 text-emerald-500" strokeWidth={1.75} />
          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{guardadas} factura(s) guardadas como pendientes</p>
          <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            Ahora ábrelas una por una en Facturas: verás la imagen al lado y lo que falta por completar antes de darlas por revisadas.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <button type="button" onClick={reiniciar} className={BTN_SECONDARY}>Subir otro lote</button>
            <Link href={`/facturas?cliente=${cliente.id}`} className={BTN_PRIMARY}>Ver las facturas</Link>
          </div>
        </div>
      )}
    </Pagina>
  )
}

export default function LotePage() {
  // useSearchParams exige un límite de Suspense para el prerender estático.
  return (
    <Suspense fallback={null}>
      <LoteContenido />
    </Suspense>
  )
}
