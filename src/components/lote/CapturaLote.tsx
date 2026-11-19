'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCheck, CircleCheck, CircleStop, FileUp, Info, LoaderCircle, QrCode, ShieldCheck, Sparkles } from 'lucide-react'
import { AvisoErrorCarga, Pagina } from '@/components/layout/Pagina'
import { Badge } from '@/components/ui/Badge'
import { Pasos } from '@/components/ui/premium'
import { BTN_SECONDARY, CARD_CLASS } from '@/components/ui/clases'
import { leerCodigoOCR } from '@/lib/config-local'
import { rutaEmpresa, useEmpresaActiva } from '@/lib/datos/empresa-context'
import { ETIQUETA_CAMPO } from '@/lib/documentos'
import {
  aplicarVerificacion,
  documentoDesdePagina,
  fusionarConLectura,
  interpretarPagina,
  observaciones,
  type BorradorPagina,
  type ContextoLote,
  type EstadoPagina,
} from '@/lib/lote/borrador'
import { LoteError, MAXIMO_PAGINAS_LOTE, leerPaginas, type PaginaLeida } from '@/lib/lote/leer-paginas'
import { OCRError, extraerFactura } from '@/lib/ocr-cliente'
import { VerificacionError, verificarEnDGII } from '@/lib/verificacion-cliente'
import { esECF } from '@/lib/dgii-formatos'
import { ETIQUETA_ESTADO_DGII } from '@/lib/verificacion-dgii'
import { BTN_PRIMARY, cn, formatCedula, formatDate, formatRD } from '@/lib/utils'
import type { CampoExtraido, DocumentoFiscal, TipoDocumento } from '@/types'
import { MODULO_DE } from '@/lib/modulos'

// Captura por lotes: un PDF de muchas páginas (o varias fotos) → una factura
// por página, llenada por la IA. Dos pasos automáticos:
//   1. En el navegador, gratis: separar las páginas y leer el código QR de los
//      comprobantes electrónicos (RNC, e-NCF, fecha y total exactos).
//   2. En el servidor, con costo: la IA lee cada página y llena el resto
//      (montos, ITBIS, categoría, nombre…), decide si es compra o venta y si
//      la página es una factura. Lo que vino del QR manda sobre lo que lea.
// La persona solo interviene en las páginas con observaciones.
// Ver CLAUDE.md, "Captura por lotes".
//
// Desde el 2026-11-18 se entra desde Ingresos o desde Costos y gastos: el
// módulo fija el tipo que se asume si no se puede saber si la factura es
// compra o venta. Aun así la IA y el QR deciden solos ("Objetivo del
// sistema"): una venta que aparezca en un lote de Costos y gastos se guarda
// como venta y la pantalla final dice que quedó en Ingresos.

interface PaginaLote extends PaginaLeida {
  url: string // object URL de la imagen, para la miniatura
  borrador: BorradorPagina
  incluir: boolean
  // La lectura con IA de esta página falló (se puede reintentar).
  errorIA?: string
  // La consulta a la DGII de esta página falló (se puede reintentar).
  errorDGII?: string
}

type Fase = 'inicio' | 'leyendo' | 'verificando' | 'leyendo_ia' | 'resultado' | 'guardado'

// Páginas que se leen con IA a la vez: acelera el lote sin saturar el servidor.
const LECTURAS_SIMULTANEAS = 3

const ETIQUETA_ESTADO: Record<EstadoPagina, { texto: string; variante: 'success' | 'neutral' | 'danger' | 'warning' | 'default' }> = {
  qr: { texto: 'QR leído', variante: 'default' },
  sin_qr: { texto: 'Sin QR', variante: 'neutral' },
  ajena: { texto: 'De otro contribuyente', variante: 'danger' },
  duplicada: { texto: 'Duplicada', variante: 'warning' },
  no_factura: { texto: 'No es factura', variante: 'neutral' },
}

// Una página duplicada o de otro contribuyente no se puede incluir.
const esIncluible = (p: PaginaLote) => p.borrador.estado !== 'ajena' && p.borrador.estado !== 'duplicada'
// Las que no pasan por la IA: no aportan nada y costarían igual.
const leerConIA = (p: PaginaLote) => esIncluible(p) && !p.borrador.leidaConIA
// Las que tienen un QR de e-CF y todavía no se consultaron en la DGII.
const verificarDGII = (p: PaginaLote) => esIncluible(p) && !!p.borrador.qrUrl && !p.borrador.dgii

export function CapturaLote({ tipo: tipoPorDefecto }: { tipo: TipoDocumento }) {
  // El lote es siempre de la empresa en la que se entró (ver empresa-context).
  const { errorCarga, empresa, documentos, guardarLote, guardarDocumentos } = useEmpresaActiva()
  const modulo = MODULO_DE[tipoPorDefecto]
  const otroTipo: TipoDocumento = tipoPorDefecto === 'compra' ? 'venta' : 'compra'
  const otroModulo = MODULO_DE[otroTipo]

  const [fase, setFase] = useState<Fase>('inicio')
  const [paginas, setPaginas] = useState<PaginaLote[]>([])
  const [total, setTotal] = useState(0)
  const [leidasIA, setLeidasIA] = useState(0)
  const [aLeerIA, setALeerIA] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Por qué la lectura con IA no corrió o se interrumpió (sin código, sin servicio…).
  const [avisoIA, setAvisoIA] = useState<{ mensaje: string; deCodigo: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardados, setGuardados] = useState<DocumentoFiscal[]>([])
  const [aprobadas, setAprobadas] = useState(0)
  const [hayCodigo, setHayCodigo] = useState(true)
  const [aVerificar, setAVerificar] = useState(0)
  const [verificadas, setVerificadas] = useState(0)
  const [avisoDGII, setAvisoDGII] = useState<string | null>(null)
  const inputArchivos = useRef<HTMLInputElement>(null)

  const cliente = empresa

  useEffect(() => { setHayCodigo(!!leerCodigoOCR()) }, [])

  // Si se sale de la pantalla a mitad de la lectura, esta se detiene; y las
  // miniaturas se liberan.
  const vivo = useRef(true)
  const detener = useRef(false)
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
    setLeidasIA(0)
    setALeerIA(0)
    setError(null)
    setAvisoIA(null)
    setAvisoDGII(null)
    setVerificadas(0)
    setAVerificar(0)
    setGuardados([])
    setAprobadas(0)
    setFase('inicio')
  }

  // Facturas contra las que se detectan duplicados: las guardadas y las de
  // las demás páginas del lote.
  function contexto(lista: readonly PaginaLote[], excepto?: number): ContextoLote {
    const existentes: ContextoLote['existentes'][number][] = [...documentos]
    for (const p of lista) {
      if (p.numero === excepto || !esIncluible(p) || !p.borrador.campos.ncf) continue
      existentes.push({
        id: `lote-${p.numero}`, clienteId: cliente.id, tipo: p.borrador.tipo, ncf: p.borrador.campos.ncf,
        rncCedulaContraparte: p.borrador.campos.rncCedulaContraparte, estadoRevision: 'pendiente_revision',
      })
    }
    return { cliente, tipoPorDefecto, existentes }
  }

  // Paso 2: consulta en la DGII el estado de los e-CF con QR (gratis). Una
  // factura rechazada o que la DGII no encuentra queda con observación y no se
  // aprueba en bloque (Decreto 254-06, art. 27; NG 01-2020, art. 8).
  async function verificarLasPaginas(lista: PaginaLote[]) {
    const pendientes = lista.filter(verificarDGII)
    if (pendientes.length === 0) return lista
    if (!leerCodigoOCR()) {
      setAvisoDGII('No se verificaron las facturas en la DGII: falta el código de acceso. Escríbelo en Configuración.')
      return lista
    }
    setFase('verificando')
    setAvisoDGII(null)
    setAVerificar(pendientes.length)
    setVerificadas(0)

    let actual = lista
    const actualizar = (numero: number, cambio: (p: PaginaLote) => PaginaLote) => {
      actual = actual.map(p => (p.numero === numero ? cambio(p) : p))
      if (vivo.current) setPaginas(actual)
    }
    const cola = [...pendientes]
    let abortar: string | null = null
    async function trabajador() {
      while (cola.length > 0 && !abortar && vivo.current) {
        const pagina = cola.shift()!
        try {
          const respuesta = await verificarEnDGII(pagina.borrador.qrUrl!)
          const ahora = new Date().toISOString()
          actualizar(pagina.numero, p => ({ ...p, errorDGII: undefined, borrador: aplicarVerificacion(p.borrador, respuesta, ahora) }))
        } catch (e) {
          const err = e instanceof VerificacionError ? e : new VerificacionError('No se pudo verificar en la DGII.')
          if (err.detenerTodo) abortar = `No se verificaron las facturas en la DGII: ${err.message}`
          else actualizar(pagina.numero, p => ({ ...p, errorDGII: err.message }))
        }
        if (vivo.current) setVerificadas(n => n + 1)
      }
    }
    await Promise.all(Array.from({ length: Math.min(LECTURAS_SIMULTANEAS, pendientes.length) }, trabajador))
    if (abortar && vivo.current) setAvisoDGII(abortar)
    return actual
  }

  // Paso 3: la IA lee las páginas indicadas, varias a la vez.
  async function leerConIALasPaginas(lista: PaginaLote[]) {
    const pendientes = lista.filter(leerConIA)
    if (pendientes.length === 0) return lista
    if (!leerCodigoOCR()) {
      setAvisoIA({ mensaje: 'La lectura con IA no corrió: falta el código de acceso. Escríbelo en Configuración y vuelve a intentarlo.', deCodigo: true })
      return lista
    }
    setFase('leyendo_ia')
    setAvisoIA(null)
    setALeerIA(pendientes.length)
    setLeidasIA(0)
    detener.current = false

    let actual = lista
    const actualizar = (numero: number, cambio: (p: PaginaLote) => PaginaLote) => {
      actual = actual.map(p => (p.numero === numero ? cambio(p) : p))
      if (vivo.current) setPaginas(actual)
    }

    const cola = [...pendientes]
    let abortar: { mensaje: string; deCodigo: boolean } | null = null
    async function trabajador() {
      while (cola.length > 0 && !abortar && !detener.current && vivo.current) {
        const pagina = cola.shift()!
        try {
          const archivo = new File([pagina.imagen], `${pagina.archivoNombre}-p${pagina.paginaEnArchivo}.jpg`, { type: 'image/jpeg' })
          const lectura = await extraerFactura(archivo, pagina.borrador.tipo, { rncCliente: cliente.rncCedula, actividad: cliente.actividad })
          const vigente = actual.find(p => p.numero === pagina.numero) ?? pagina
          const borrador = fusionarConLectura(vigente.borrador, lectura, contexto(actual, pagina.numero))
          actualizar(pagina.numero, p => ({
            ...p,
            borrador,
            errorIA: undefined,
            // Lo que la IA descarta (no factura, duplicada) deja de estar marcado.
            incluir: borrador.estado === 'no_factura' || borrador.estado === 'duplicada' ? false : p.incluir,
          }))
        } catch (e) {
          const err = e instanceof OCRError ? e : new OCRError('La lectura con IA falló.')
          if (err.esDeCodigo || err.sinServicio) {
            // Ninguna de las páginas que quedan va a poder leerse.
            abortar = { mensaje: err.message, deCodigo: err.esDeCodigo }
            cola.unshift(pagina)
          } else {
            actualizar(pagina.numero, p => ({ ...p, errorIA: err.message }))
          }
        }
        if (vivo.current) setLeidasIA(n => n + 1)
      }
    }
    await Promise.all(Array.from({ length: Math.min(LECTURAS_SIMULTANEAS, pendientes.length) }, trabajador))
    if (abortar && vivo.current) setAvisoIA(abortar)
    else if (detener.current && vivo.current) {
      setAvisoIA({ mensaje: `Lectura detenida. ${cola.length} página(s) quedaron sin leer con IA.`, deCodigo: false })
    }
    return actual
  }

  async function procesar(lista: FileList | null) {
    if (!cliente || !lista || lista.length === 0) return
    const archivos = Array.from(lista)
    reiniciar()
    setFase('leyendo')

    // Paso 1: páginas y QR, en el navegador.
    let leidas: PaginaLote[] = []
    try {
      await leerPaginas(archivos, (pagina, totalPaginas) => {
        const borrador = interpretarPagina(pagina.textoQr, contexto(leidas))
        const url = URL.createObjectURL(pagina.imagen)
        urls.current.push(url)
        leidas = [...leidas, { ...pagina, url, borrador, incluir: borrador.estado === 'qr' || borrador.estado === 'sin_qr' }]
        setTotal(totalPaginas)
        setPaginas(leidas)
      }, () => !vivo.current)
    } catch (e) {
      if (!vivo.current) return
      setError(e instanceof LoteError ? e.message : 'No se pudo leer el lote. Intenta de nuevo con otro archivo.')
      setFase('inicio')
      return
    }
    if (!vivo.current) return

    // Paso 2: estado en la DGII. Paso 3: la IA llena el resto.
    const verificadasDGII = await verificarLasPaginas(leidas)
    if (!vivo.current) return
    await leerConIALasPaginas(verificadasDGII)
    if (vivo.current) setFase('resultado')
  }

  async function reintentarVerificacion() {
    await verificarLasPaginas(paginas)
    if (vivo.current) setFase('resultado')
  }

  // Las que fallaron o no se alcanzaron a leer (también tienen leidaConIA = false).
  async function reintentarFallidas() {
    await leerConIALasPaginas(paginas)
    if (vivo.current) setFase('resultado')
  }

  const rnc = cliente?.rncCedula ?? ''
  const pendientesDe = (p: PaginaLote): CampoExtraido[] => observaciones(p.borrador, rnc)

  const conteo = useMemo(() => {
    const por = (estado: EstadoPagina) => paginas.filter(p => p.borrador.estado === estado).length
    const validas = paginas.filter(p => p.incluir)
    return {
      conQr: paginas.filter(p => p.borrador.conQr).length,
      leidasIA: paginas.filter(p => p.borrador.leidaConIA).length,
      sinLeerIA: paginas.filter(leerConIA).length,
      sinVerificar: paginas.filter(verificarDGII).length,
      verificadas: paginas.filter(p => p.borrador.dgii).length,
      invalidasDGII: paginas.filter(p => p.borrador.dgii && ['rechazado', 'no_encontrado'].includes(p.borrador.dgii.verificacion.estado)).length,
      noFactura: por('no_factura'),
      ajenas: por('ajena'),
      duplicadas: por('duplicada'),
      incluidas: validas.length,
      listas: validas.filter(p => observaciones(p.borrador, rnc).length === 0).length,
    }
  }, [paginas, rnc])

  function alternar(numero: number) {
    setPaginas(prev => prev.map(p => (p.numero === numero && esIncluible(p) ? { ...p, incluir: !p.incluir } : p)))
  }

  async function guardar() {
    if (!cliente) return
    const elegidas = paginas.filter(p => p.incluir)
    if (elegidas.length === 0) return
    setGuardando(true)
    setError(null)
    const ahora = new Date().toISOString()
    try {
      const lote = elegidas.map(p => ({
        documento: documentoDesdePagina(crypto.randomUUID(), p.borrador, cliente, { nombre: p.archivoNombre, pagina: p.paginaEnArchivo }, ahora),
        archivo: p.imagen,
      }))
      await guardarLote(lote)
      setGuardados(lote.map(l => l.documento))
      setFase('guardado')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el lote.')
    } finally {
      setGuardando(false)
    }
  }

  // Facturas guardadas a las que la IA les llenó todo sin dudas.
  const sinObservaciones = guardados.filter(d => d.camposIncompletos.length === 0)
  // Las que la IA o el QR leyeron como del otro tipo: quedaron en el otro módulo.
  const delOtroModulo = guardados.filter(d => d.tipo !== tipoPorDefecto).length

  async function aprobarSinObservaciones() {
    const ahora = new Date().toISOString()
    try {
      await guardarDocumentos(sinObservaciones.map(d => ({ ...d, estadoRevision: 'revisado' as const, revisadoEn: ahora, actualizadoEn: ahora })))
      setAprobadas(sinObservaciones.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron aprobar.')
    }
  }

  const leyendo = fase === 'leyendo' || fase === 'verificando' || fase === 'leyendo_ia'

  return (
    <Pagina title="Subir lote" subtitle={`${modulo.nombre} · un PDF con muchas facturas, o varias fotos`}>
      {errorCarga && <AvisoErrorCarga mensaje={errorCarga} />}

      <section className="animate-content-in">
        <Pasos pasos={[
          { titulo: 'Páginas y códigos QR', detalle: 'En tu navegador · gratis', estado: fase === 'inicio' || fase === 'leyendo' ? 'actual' : 'hecho' },
          { titulo: 'Estado en la DGII', detalle: 'Con el QR · gratis', estado: fase === 'verificando' ? 'actual' : ['leyendo_ia', 'resultado', 'guardado'].includes(fase) ? 'hecho' : 'pendiente' },
          { titulo: 'La IA llena los datos', detalle: 'Tú solo revisas lo que haga falta', estado: fase === 'leyendo_ia' ? 'actual' : ['resultado', 'guardado'].includes(fase) ? 'hecho' : 'pendiente' },
        ]} />
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-5 py-4 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {avisoDGII && (fase === 'resultado' || fase === 'leyendo_ia') && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-5 py-4 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{avisoDGII}</p>
        </div>
      )}

      {avisoIA && (fase === 'resultado' || fase === 'leyendo_ia') && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-5 py-4 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>{avisoIA.mensaje}</p>
            <p className="mt-1 text-xs">Las páginas quedan con lo que dio el código QR; puedes guardarlas igual y completarlas después.</p>
            {avisoIA.deCodigo && <Link href="/configuracion" className="mt-1 inline-block font-semibold underline">Ir a Configuración</Link>}
          </div>
        </div>
      )}

      {/* ── Inicio: cliente y archivos ─────────────────────────────────── */}
      {cliente && fase === 'inicio' && (
        <div className={cn(CARD_CLASS, 'animate-content-in space-y-5 p-5 sm:p-6')}>
          <button
            type="button"
            onClick={() => inputArchivos.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); void procesar(e.dataTransfer.files) }}
            className="group relative flex w-full flex-col items-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-[#1B2980]/20 bg-gradient-to-b from-[#f7f8fd] to-white px-6 py-14 text-center transition-all hover:border-[#1B2980]/50 hover:shadow-[0_18px_40px_-24px_rgba(27,41,128,0.45)] dark:border-indigo-500/25 dark:from-indigo-950/20 dark:to-[#141722] dark:hover:border-indigo-400/60"
          >
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-48 rounded-full bg-[#2f3fa8]/10 blur-3xl transition-opacity group-hover:opacity-100 dark:bg-indigo-500/10" />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1B2980] to-[#2f3fa8] text-white shadow-[0_10px_24px_-10px_rgba(27,41,128,0.7)] transition-transform group-hover:-translate-y-0.5">
              <FileUp className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <span className="relative mt-2 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Sube el PDF del mes o varias fotos</span>
            <span className="relative text-sm text-zinc-500 dark:text-zinc-400">
              Arrastra los archivos aquí o <span className="font-semibold text-[#1B2980] dark:text-indigo-300">elige en tu equipo</span>
            </span>
            <span className="relative mt-3 flex flex-wrap justify-center gap-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-zinc-200 dark:bg-[#1a1d2e] dark:ring-[#252840]">PDF de hasta {MAXIMO_PAGINAS_LOTE} páginas</span>
              <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-zinc-200 dark:bg-[#1a1d2e] dark:ring-[#252840]">Fotos JPG, PNG o WebP</span>
              <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-zinc-200 dark:bg-[#1a1d2e] dark:ring-[#252840]">Verificación en la DGII</span>
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

          <div className="flex items-start gap-2.5 rounded-xl bg-zinc-50 px-4 py-3 text-xs leading-relaxed text-zinc-600 dark:bg-[#171a29] dark:text-zinc-400">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1B2980] dark:text-indigo-400" />
            <span>
              {tipoPorDefecto === 'compra'
                ? 'La IA lee cada página y llena los campos del 606: RNC, nombre, NCF, fecha, montos en bienes y servicios, ITBIS, otros impuestos y el tipo de gasto, costo o activo.'
                : 'La IA lee cada página y llena los campos del reporte de ingresos: cliente, NCF, fecha, monto sin impuestos, ITBIS y otros impuestos.'}
              {' '}También decide si cada factura es compra o venta (si es una {otroTipo}, queda en {otroModulo.nombre}) y
              descarta las páginas que no son facturas. Del código QR de los comprobantes electrónicos se toman, exactos, el
              RNC, el e-NCF, la fecha y el total. Tú solo revisas las facturas con observaciones.
            </span>
          </div>
          {!hayCodigo && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Sin el código de acceso la IA no puede leer las facturas: solo se tomarán los datos del código QR.{' '}
                <Link href="/configuracion" className="font-semibold underline">Escríbelo en Configuración</Link>.
              </span>
            </p>
          )}
        </div>
      )}

      {/* ── Leyendo ────────────────────────────────────────────────────── */}
      {leyendo && (
        <div role="status" className={cn(CARD_CLASS, 'flex items-center gap-4 px-5 py-4')}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eef0fb] dark:bg-indigo-950/50">
            <LoaderCircle className="h-5 w-5 animate-spin text-[#1B2980] dark:text-indigo-400" />
          </span>
          <div className="min-w-0 flex-1">
            {fase === 'leyendo' ? (
              <>
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Paso 1 de 3 · {total > 0 ? `Separando páginas y leyendo códigos QR: ${Math.min(paginas.length + 1, total)} de ${total}…` : 'Abriendo los archivos…'}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Códigos QR leídos hasta ahora: {conteo.conQr}.</p>
              </>
            ) : fase === 'verificando' ? (
              <>
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Paso 2 de 3 · Verificando el estado en la DGII: {verificadas} de {aVerificar}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Con el código QR de cada factura electrónica. No tiene costo.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Paso 3 de 3 · La IA está leyendo las facturas: {leidasIA} de {aLeerIA}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Puede tardar varios minutos. No cierres esta pantalla.</p>
              </>
            )}
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-[#1a1d2e]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#1B2980] to-[#2f3fa8] transition-[width] duration-300 dark:from-indigo-500 dark:to-indigo-400"
                style={{ width: `${fase === 'leyendo' ? (total ? (paginas.length / total) * 100 : 0) : fase === 'verificando' ? (aVerificar ? (verificadas / aVerificar) * 100 : 0) : (aLeerIA ? (leidasIA / aLeerIA) * 100 : 0)}%` }}
              />
            </div>
          </div>
          {fase === 'leyendo_ia' && (
            <button type="button" onClick={() => { detener.current = true }} className={BTN_SECONDARY}>
              <CircleStop className="h-4 w-4" />
              Detener
            </button>
          )}
        </div>
      )}

      {/* ── Resultado ──────────────────────────────────────────────────── */}
      {cliente && fase === 'resultado' && (
        <div className={cn(CARD_CLASS, 'animate-content-in space-y-4 p-5 sm:p-6')}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {paginas.length} página(s) de {cliente.razonSocial}
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {conteo.leidasIA} leídas por la IA · {conteo.conQr} con QR · {conteo.verificadas} verificadas en la DGII
                {conteo.noFactura > 0 && ` · ${conteo.noFactura} no son facturas`}
                {conteo.duplicadas > 0 && ` · ${conteo.duplicadas} duplicada(s)`}
                {conteo.ajenas > 0 && ` · ${conteo.ajenas} de otro contribuyente`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={reiniciar} className={BTN_SECONDARY}>Empezar de nuevo</button>
              {conteo.sinVerificar > 0 && (
                <button type="button" onClick={() => void reintentarVerificacion()} className={BTN_SECONDARY}>
                  <ShieldCheck className="h-4 w-4" />
                  Verificar en la DGII las {conteo.sinVerificar} que faltan
                </button>
              )}
              {conteo.sinLeerIA > 0 && (
                <button type="button" onClick={() => void reintentarFallidas()} className={BTN_SECONDARY}>
                  <Sparkles className="h-4 w-4" />
                  Leer con IA las {conteo.sinLeerIA} que faltan
                </button>
              )}
              <button type="button" onClick={() => void guardar()} disabled={guardando || conteo.incluidas === 0} className={BTN_PRIMARY}>
                Guardar {conteo.incluidas} factura(s)
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 dark:border-emerald-900/50 dark:from-emerald-950/30 dark:to-[#141722]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white"><CircleCheck className="h-5 w-5" /></span>
              <p className="text-sm text-emerald-900 dark:text-emerald-200">
                <strong className="text-lg font-semibold">{conteo.listas}</strong> lista(s): la IA llenó todo y cuadra.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-white px-4 py-3 dark:border-amber-900/50 dark:from-amber-950/30 dark:to-[#141722]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-amber-950"><AlertTriangle className="h-5 w-5" /></span>
              <p className="text-sm text-amber-900 dark:text-amber-200">
                <strong className="text-lg font-semibold">{conteo.incluidas - conteo.listas}</strong> con observaciones: necesitan que las mires.
              </p>
            </div>
          </div>
          {conteo.invalidasDGII > 0 && (
            <p className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{conteo.invalidasDGII} factura(s) rechazada(s) por la DGII o que no existen allí. No se pueden aprobar ni entrar al 606.</span>
            </p>
          )}
          {conteo.ajenas > 0 && (
            <p className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Hay facturas cuyo QR nombra a otro contribuyente. Si son muchas, puede que estés en la empresa equivocada: revísalo arriba o cambia de empresa.</span>
            </p>
          )}
        </div>
      )}

      {(leyendo || fase === 'resultado') && paginas.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {paginas.map(p => {
            const { texto, variante } = ETIQUETA_ESTADO[p.borrador.estado]
            const c = p.borrador.campos
            const pendientes = p.incluir ? pendientesDe(p) : []
            const sinDatos = !c.ncf && !c.rncCedulaContraparte && c.montoTotal === null
            return (
              <li key={p.numero} className={cn(CARD_CLASS, 'flex flex-col overflow-hidden transition-shadow hover:shadow-md', !p.incluir && 'opacity-60')}>
                <div className="relative h-44 border-b border-zinc-100 bg-zinc-50 dark:border-[#1d2035] dark:bg-[#0d0f1a]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- object URL local, no optimizable */}
                  <img src={p.url} alt={`Página ${p.numero}`} loading="lazy" className="h-full w-full object-contain object-top" />
                  <span className="absolute left-2 top-2 rounded-lg bg-zinc-900/70 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">Pág. {p.numero}</span>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.borrador.estado !== 'qr' && p.borrador.estado !== 'sin_qr' && <Badge variant={variante}>{texto}</Badge>}
                    {p.borrador.conQr && <Badge variant="default"><QrCode className="mr-1 h-3 w-3" />QR</Badge>}
                    {p.borrador.leidaConIA && <Badge variant="default"><Sparkles className="mr-1 h-3 w-3" />IA</Badge>}
                    {p.borrador.estado !== 'no_factura' && !sinDatos && (
                      p.borrador.tipo === tipoPorDefecto
                        ? <Badge variant="neutral">{p.borrador.tipo === 'compra' ? 'Compra' : 'Venta'}</Badge>
                        : <Badge variant="warning">{p.borrador.tipo === 'compra' ? 'Compra' : 'Venta'} · va a {otroModulo.nombre}</Badge>
                    )}
                  </div>
                  {sinDatos ? (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      {p.borrador.estado === 'no_factura' ? 'Se deja fuera. Márcala si sí es una factura.' : 'Sin datos todavía.'}
                    </p>
                  ) : (
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {c.nombreContraparte && <p className="truncate font-medium text-zinc-800 dark:text-zinc-200">{c.nombreContraparte}</p>}
                      <p className="tabular-nums">{c.ncf ?? 'Sin NCF'}</p>
                      <p className="tabular-nums">{c.rncCedulaContraparte ? formatCedula(c.rncCedulaContraparte) : 'Sin RNC'}</p>
                      <p className="tabular-nums">
                        {c.fechaComprobante ? formatDate(c.fechaComprobante) : 'Sin fecha'}
                        {c.montoTotal !== null && ` · ${formatRD(c.montoTotal)}`}
                      </p>
                    </div>
                  )}
                  {p.incluir && p.borrador.leidaConIA && (pendientes.length === 0 ? (
                    <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <CircleCheck className="h-3 w-3" /> Lista
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Revisar: {pendientes.slice(0, 3).map(campo => ETIQUETA_CAMPO[campo]).join(', ')}
                      {pendientes.length > 3 && ` y ${pendientes.length - 3} más`}
                    </p>
                  ))}
                  {p.borrador.nota && p.borrador.estado !== 'no_factura' && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400">{p.borrador.nota}</p>
                  )}
                  {p.errorIA && <p className="text-[11px] text-rose-600 dark:text-rose-400">La IA no pudo leerla: {p.errorIA}</p>}
                  {p.borrador.dgii && (
                    <p className={cn('flex items-center gap-1 text-[11px] font-semibold',
                      ['aceptado', 'aceptado_condicional'].includes(p.borrador.dgii.verificacion.estado)
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : ['rechazado', 'no_encontrado'].includes(p.borrador.dgii.verificacion.estado)
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-700 dark:text-amber-400')}>
                      <ShieldCheck className="h-3 w-3" /> {ETIQUETA_ESTADO_DGII[p.borrador.dgii.verificacion.estado]}
                    </p>
                  )}
                  {p.errorDGII && <p className="text-[11px] text-amber-700 dark:text-amber-400">No se pudo verificar en la DGII: {p.errorDGII}. Verifícala a mano.</p>}
                  {p.incluir && !p.borrador.qrUrl && esECF(c.ncf) && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">No se pudo leer el código QR: verifícala a mano en la DGII.</p>
                  )}
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
        <div className={cn(CARD_CLASS, 'animate-content-in flex flex-col items-center gap-3 px-6 py-14 text-center')}>
          <span className="relative flex h-16 w-16 items-center justify-center">
            <span aria-hidden="true" className="absolute inset-0 rounded-full bg-emerald-400/20 blur-md" />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_10px_24px_-10px_rgba(5,150,105,0.7)]">
              <CircleCheck className="h-7 w-7" strokeWidth={2} />
            </span>
          </span>
          <p className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{guardados.length} factura(s) guardadas</p>
          {aprobadas > 0 ? (
            <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
              Aprobaste {aprobadas}. Las {guardados.length - aprobadas} restantes quedan pendientes: ábrelas en {modulo.nombre}, verás la
              imagen al lado y qué falta revisar.
            </p>
          ) : (
            <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
              {sinObservaciones.length > 0
                ? `${sinObservaciones.length} no tienen observaciones: la IA llenó todo y cuadra. Puedes aprobarlas ahora; las demás quedan pendientes para que las revises con la imagen al lado.`
                : `Todas quedaron pendientes de revisión: ábrelas en ${modulo.nombre}, verás la imagen al lado y qué falta revisar.`}
            </p>
          )}
          {delOtroModulo > 0 && (
            <p className="flex max-w-md flex-wrap items-center justify-center gap-x-1.5 gap-y-1 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-400/20">
              <Info className="h-4 w-4 shrink-0" />
              <span>
                <strong className="font-semibold">{delOtroModulo} {delOtroModulo === 1 ? `era ${otroTipo}` : `eran ${otroModulo.plural}`}</strong>: {delOtroModulo === 1 ? 'quedó' : 'quedaron'} en {otroModulo.nombre}.
              </span>
              <Link href={rutaEmpresa(cliente.id, otroModulo.seccion)} className="inline-flex items-center gap-1 font-semibold underline">
                Ir a {otroModulo.nombre} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <button type="button" onClick={reiniciar} className={BTN_SECONDARY}>Subir otro lote</button>
            {aprobadas === 0 && sinObservaciones.length > 0 && (
              <button type="button" onClick={() => void aprobarSinObservaciones()} className={BTN_SECONDARY}>
                <CheckCheck className="h-4 w-4" />
                Aprobar las {sinObservaciones.length} sin observaciones
              </button>
            )}
            <Link href={rutaEmpresa(cliente.id, modulo.seccion)} className={BTN_PRIMARY}>Ver las facturas</Link>
          </div>
        </div>
      )}
    </Pagina>
  )
}
