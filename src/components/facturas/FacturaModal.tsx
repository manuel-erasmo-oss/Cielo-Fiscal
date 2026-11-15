'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, FileUp, Info, Keyboard, LoaderCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { BTN_SECONDARY, INPUT_CLASS, LABEL_CLASS } from '@/components/ui/clases'
import {
  FORMA_PAGO_606,
  TIPO_BIENES_SERVICIOS_606,
  TIPO_IDENTIFICACION_607,
  TIPO_INGRESO_607,
  TIPO_RETENCION_ISR_606,
  esConsumoBajoUmbral,
  type OpcionCatalogo,
  type Problema,
} from '@/lib/dgii-formatos'
import {
  CAMPOS_EXTRAIDOS,
  CAMPOS_FECHA,
  CAMPOS_MONTO,
  CAMPOS_POR_TIPO,
  CAMPOS_VACIOS,
  ETIQUETA_CAMPO,
  buscarDuplicado,
  normalizarNcf,
  problemasDeRevision,
  type CamposDocumento,
} from '@/lib/documentos'
import { OCRError, esArchivoSoportado, extraerFactura } from '@/lib/ocr-cliente'
import { MIME_PDF } from '@/lib/ocr-tipos'
import { BTN_PRIMARY, cn, formatRD, parseFechaLocal, redondear2, soloDigitos } from '@/lib/utils'
import {
  CONTADOR_LOCAL,
  type CampoExtraido,
  type ClienteFiscal,
  type DocumentoFiscal,
  type TipoDocumento,
} from '@/types'

interface FacturaModalProps {
  // null = factura nueva.
  documento: DocumentoFiscal | null
  clientes: readonly ClienteFiscal[]
  documentos: readonly DocumentoFiscal[]
  clienteIdInicial?: string
  onGuardar: (documento: DocumentoFiscal) => Promise<void>
  onClose: () => void
}

// El formulario trabaja con texto; se convierte al guardar.
type Valores = Record<CampoExtraido, string>

const VACIO = Object.fromEntries(CAMPOS_EXTRAIDOS.map(c => [c, ''])) as Valores

function aValores(campos: CamposDocumento): Valores {
  const v = { ...VACIO }
  for (const c of CAMPOS_EXTRAIDOS) {
    const valor = campos[c]
    v[c] = valor === null || valor === undefined ? '' : String(valor)
  }
  return v
}

// Acepta "1,234.56" o "1234.56". Devuelve null si está vacío y NaN si no es
// un monto válido.
function leerMonto(texto: string): number | null {
  const limpio = texto.replace(/[,\s]/g, '')
  if (!limpio) return null
  if (!/^\d+(\.\d+)?$/.test(limpio)) return NaN
  return redondear2(Number(limpio))
}

// Convierte el formulario a campos del documento. Devuelve además los
// errores de FORMATO (texto que no es un monto o una fecha); lo que le falta
// a la factura según la DGII lo decide `problemasDeRevision`. Los campos que
// no aplican al tipo de factura quedan en null.
function aCampos(v: Valores, tipo: TipoDocumento): { campos: CamposDocumento; errores: Partial<Record<CampoExtraido, string>> } {
  const errores: Partial<Record<CampoExtraido, string>> = {}
  const campos: Record<string, string | number | null> = { ...CAMPOS_VACIOS }

  for (const c of CAMPOS_POR_TIPO[tipo]) {
    const crudo = v[c].trim()
    if (CAMPOS_MONTO.includes(c)) {
      const m = leerMonto(crudo)
      if (m !== null && Number.isNaN(m)) errores[c] = 'Escribe un monto válido, por ejemplo 1250.00.'
      else campos[c] = m
    } else if (CAMPOS_FECHA.includes(c)) {
      if (!crudo) continue
      try {
        parseFechaLocal(crudo)
        campos[c] = crudo
      } catch {
        errores[c] = 'Fecha inválida.'
      }
    } else if (c === 'ncf' || c === 'ncfModificado') {
      campos[c] = normalizarNcf(crudo) || null
    } else if (c === 'rncCedulaContraparte') {
      // Un pasaporte (solo en ventas) puede llevar letras; RNC y cédula no.
      const esPasaporte = tipo === 'venta' && v.tipoIdentificacion === '3'
      campos[c] = (esPasaporte ? crudo : soloDigitos(crudo)) || null
    } else {
      campos[c] = crudo || null
    }
  }
  return { campos: campos as CamposDocumento, errores }
}

type Paso = 'origen' | 'extrayendo' | 'formulario'

export function FacturaModal({
  documento,
  clientes,
  documentos,
  clienteIdInicial,
  onGuardar,
  onClose,
}: FacturaModalProps) {
  const [paso, setPaso] = useState<Paso>(documento ? 'formulario' : 'origen')
  const [clienteId, setClienteId] = useState(documento?.clienteId ?? clienteIdInicial ?? clientes[0]?.id ?? '')
  const [tipo, setTipo] = useState<TipoDocumento>(documento?.tipo ?? 'compra')
  const [valores, setValores] = useState<Valores>(documento ? aValores(documento) : VACIO)
  const [origen, setOrigen] = useState<DocumentoFiscal['origen']>(documento?.origen ?? 'manual')
  const [confianza, setConfianza] = useState(documento?.confianzaOCR ?? 0)
  // Campos de los que el OCR dudó y que nadie ha tocado todavía.
  const [dudosos, setDudosos] = useState<Set<CampoExtraido>>(
    () => new Set(documento?.estadoRevision === 'pendiente_revision' ? documento.camposIncompletos : []),
  )
  const [archivo, setArchivo] = useState<File | null>(null)
  const [errorOCR, setErrorOCR] = useState<OCRError | null>(null)
  const [errores, setErrores] = useState<Partial<Record<CampoExtraido, string>>>({})
  // Los errores de la DGII se muestran después del primer intento de guardar
  // como revisada (o al abrir una factura que quedó pendiente).
  const [mostrarProblemas, setMostrarProblemas] = useState(documento?.estadoRevision === 'pendiente_revision')
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const inputArchivo = useRef<HTMLInputElement>(null)
  // Descarta la respuesta del OCR si el modal se cerró mientras llegaba.
  const vivo = useRef(true)
  useEffect(() => () => { vivo.current = false }, [])

  // Vista previa del archivo, solo mientras el modal está abierto.
  const urlVistaPrevia = useMemo(() => (archivo ? URL.createObjectURL(archivo) : null), [archivo])
  useEffect(() => () => { if (urlVistaPrevia) URL.revokeObjectURL(urlVistaPrevia) }, [urlVistaPrevia])

  const { campos } = useMemo(() => aCampos(valores, tipo), [valores, tipo])
  const rncCliente = clientes.find(c => c.id === clienteId)?.rncCedula ?? ''
  const problemas = useMemo(() => problemasDeRevision(tipo, campos, rncCliente), [tipo, campos, rncCliente])

  const duplicado = useMemo(
    () => buscarDuplicado({ id: documento?.id ?? '', clienteId, tipo, ncf: campos.ncf, rncCedulaContraparte: campos.rncCedulaContraparte }, documentos),
    [documento?.id, clienteId, tipo, campos.ncf, campos.rncCedulaContraparte, documentos],
  )

  // Aviso (no bloqueante): lo facturado más los impuestos no da el total.
  const diferenciaTotal = useMemo(() => {
    const base = tipo === 'venta'
      ? campos.montoFacturado
      : campos.montoServicios === null && campos.montoBienes === null
        ? null
        : (campos.montoServicios ?? 0) + (campos.montoBienes ?? 0)
    if (base === null || campos.itbisFacturado === null || campos.montoTotal === null) return 0
    const cargos = (campos.impuestoSelectivoConsumo ?? 0) + (campos.otrosImpuestos ?? 0) + (campos.propinaLegal ?? 0)
    return redondear2(campos.montoTotal - base - campos.itbisFacturado - cargos)
  }, [campos, tipo])

  async function handleArchivo(seleccionado: File | undefined) {
    if (!seleccionado) return
    if (!esArchivoSoportado(seleccionado)) {
      setErrorOCR(new OCRError('Tipo de archivo no soportado. Sube una imagen (JPEG, PNG, WebP) o un PDF.'))
      return
    }
    setErrorOCR(null)
    setArchivo(seleccionado)
    setPaso('extrayendo')
    try {
      const resultado = await extraerFactura(seleccionado, tipo)
      if (!vivo.current) return
      setValores(aValores(resultado.extraccion))
      setDudosos(new Set(resultado.camposDudosos))
      setConfianza(resultado.confianzaOCR)
      setOrigen('ocr')
      setPaso('formulario')
    } catch (err) {
      if (!vivo.current) return
      setErrorOCR(err instanceof OCRError ? err : new OCRError('El OCR falló. Intenta de nuevo o captura la factura a mano.'))
      setPaso('origen')
    }
  }

  function capturarAMano() {
    setErrorOCR(null)
    setOrigen('manual')
    setDudosos(new Set())
    setPaso('formulario')
  }

  function cambiar(campo: CampoExtraido, valor: string) {
    setValores(v => ({ ...v, [campo]: valor }))
    // Al tocar un campo, la persona ya lo miró: deja de estar "dudoso".
    setDudosos(prev => {
      if (!prev.has(campo)) return prev
      const sig = new Set(prev)
      sig.delete(campo)
      return sig
    })
    setErrores(e => (e[campo] ? { ...e, [campo]: undefined } : e))
  }

  async function guardar(comoRevisada: boolean) {
    const { campos: finales, errores: erroresFormato } = aCampos(valores, tipo)
    setErrores(erroresFormato)
    if (Object.keys(erroresFormato).length > 0) return

    const bloqueos = problemasDeRevision(tipo, finales, rncCliente).filter(p => p.nivel === 'error')
    if (comoRevisada && (bloqueos.length > 0 || duplicado)) {
      setMostrarProblemas(true) // los mensajes quedan en pantalla, campo por campo
      return
    }

    const ahora = new Date().toISOString()
    const pendientes = new Set<CampoExtraido>(dudosos)
    for (const b of bloqueos) if (b.campo) pendientes.add(b.campo)
    setGuardando(true)
    setErrorGuardar(null)
    try {
      await onGuardar({
        id: documento?.id ?? crypto.randomUUID(),
        contadorUid: documento?.contadorUid ?? CONTADOR_LOCAL,
        clienteId,
        tipo,
        origen,
        archivoNombre: archivo?.name ?? documento?.archivoNombre,
        archivoMimeType: archivo?.type ?? documento?.archivoMimeType,
        ...finales,
        confianzaOCR: confianza,
        camposIncompletos: comoRevisada ? [] : CAMPOS_EXTRAIDOS.filter(c => pendientes.has(c)),
        estadoRevision: comoRevisada ? 'revisado' : 'pendiente_revision',
        revisadoEn: comoRevisada ? ahora : undefined,
        creadoEn: documento?.creadoEn ?? ahora,
        actualizadoEn: ahora,
      })
    } catch (err) {
      setErrorGuardar(err instanceof Error ? err.message : 'No se pudo guardar la factura.')
      setGuardando(false)
    }
  }

  const contraparte = tipo === 'compra' ? 'proveedor' : 'cliente'
  const conVistaPrevia = paso === 'formulario' && !!urlVistaPrevia

  // Primer problema de la DGII asociado a un campo (errores antes que avisos).
  function problemaDe(campo: CampoExtraido): Problema | undefined {
    const propios = problemas.filter(p => p.campo === campo)
    return propios.find(p => p.nivel === 'error') ?? propios[0]
  }

  // Mensaje y estilo bajo un campo: error de formato > error DGII > aviso > duda del OCR.
  function estado(campo: CampoExtraido): { mensaje?: string; tono?: 'error' | 'aviso' } {
    if (errores[campo]) return { mensaje: errores[campo], tono: 'error' }
    const problema = problemaDe(campo)
    if (problema?.nivel === 'error' && mostrarProblemas) return { mensaje: problema.mensaje, tono: 'error' }
    if (problema?.nivel === 'aviso') return { mensaje: problema.mensaje, tono: 'aviso' }
    if (dudosos.has(campo)) return { mensaje: 'El OCR no está seguro de este dato. Verifícalo contra la factura.', tono: 'aviso' }
    return {}
  }

  const CLASE_TONO = {
    error: 'border-rose-400 dark:border-rose-500',
    aviso: 'border-amber-400 bg-amber-50 dark:border-amber-500/70 dark:bg-amber-950/20',
  }

  function pie(campo: CampoExtraido) {
    const { mensaje, tono } = estado(campo)
    if (!mensaje) return null
    return (
      <p className={cn('text-xs', tono === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400')}>
        {mensaje}
      </p>
    )
  }

  function campo(c: CampoExtraido, etiqueta: string = ETIQUETA_CAMPO[c]) {
    const id = `factura-${c}`
    const { tono } = estado(c)
    const esMonto = CAMPOS_MONTO.includes(c)
    const esFecha = CAMPOS_FECHA.includes(c)
    return (
      <div key={c} className="flex flex-col gap-1.5">
        <label htmlFor={id} className={LABEL_CLASS}>{etiqueta}</label>
        <input
          id={id}
          type={esFecha ? 'date' : 'text'}
          inputMode={esMonto ? 'decimal' : undefined}
          autoComplete="off"
          placeholder={esMonto ? '0.00' : undefined}
          value={valores[c]}
          onChange={e => cambiar(c, e.target.value)}
          aria-invalid={tono === 'error'}
          className={cn(INPUT_CLASS, esMonto && 'tabular-nums', tono && CLASE_TONO[tono])}
        />
        {pie(c)}
      </div>
    )
  }

  function selector(c: CampoExtraido, opciones: readonly OpcionCatalogo[], etiqueta: string = ETIQUETA_CAMPO[c]) {
    const id = `factura-${c}`
    const { tono } = estado(c)
    return (
      <div key={c} className="flex flex-col gap-1.5">
        <label htmlFor={id} className={LABEL_CLASS}>{etiqueta}</label>
        <select
          id={id}
          value={valores[c]}
          onChange={e => cambiar(c, e.target.value)}
          aria-invalid={tono === 'error'}
          className={cn(INPUT_CLASS, tono && CLASE_TONO[tono])}
        >
          <option value="">— Seleccionar —</option>
          {opciones.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} · {o.nombre}</option>)}
        </select>
        {pie(c)}
      </div>
    )
  }

  const TITULO_SECCION = 'text-xs font-semibold uppercase tracking-widest text-[#1B2980] dark:text-indigo-400'
  const GRID2 = 'grid gap-4 sm:grid-cols-2'
  const GRID3 = 'grid gap-4 sm:grid-cols-3'
  const errorGeneral = mostrarProblemas ? problemas.find(p => p.campo === null && p.nivel === 'error') : undefined

  return (
    <Modal
      titulo={documento ? 'Editar factura' : 'Nueva factura'}
      subtitulo={paso === 'formulario' && origen === 'ocr' && !documento
        ? 'Revisa cada dato contra la factura antes de guardarla.'
        : undefined}
      onClose={onClose}
      ancho={conVistaPrevia ? 'max-w-6xl' : paso === 'formulario' ? 'max-w-3xl' : 'max-w-xl'}
    >
      {/* ── Paso 1: cliente, tipo y origen ─────────────────────────────── */}
      {paso === 'origen' && (
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="factura-cliente" className={LABEL_CLASS}>Cliente</label>
              <select id="factura-cliente" value={clienteId} onChange={e => setClienteId(e.target.value)} className={INPUT_CLASS}>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Tipo</span>
              <div className="grid grid-cols-2 gap-2">
                {(['compra', 'venta'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={tipo === t}
                    onClick={() => setTipo(t)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      tipo === t
                        ? 'border-[#1B2980] bg-[#eef0fb] text-[#1B2980] dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-[#252840] dark:text-zinc-400 dark:hover:bg-[#1a1d2e]',
                    )}
                  >
                    {t === 'compra' ? 'Compra' : 'Venta'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => inputArchivo.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); void handleArchivo(e.dataTransfer.files[0]) }}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 dark:border-[#33395a] px-6 py-10 text-center transition-colors hover:border-[#1B2980] hover:bg-[#eef0fb]/40 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/20"
          >
            <FileUp className="h-7 w-7 text-[#1B2980] dark:text-indigo-400" strokeWidth={1.75} />
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Sube la factura para leerla automáticamente</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Imagen (JPEG, PNG, WebP) o PDF. Arrástrala aquí o haz clic.</span>
          </button>
          <input
            ref={inputArchivo}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={e => { void handleArchivo(e.target.files?.[0]); e.target.value = '' }}
          />

          {errorOCR && (
            <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-3 text-sm text-rose-700 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>{errorOCR.message}</p>
                {errorOCR.esDeCodigo && (
                  <Link href="/configuracion" className="mt-1 inline-block font-semibold underline">Ir a Configuración</Link>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-zinc-100 dark:border-[#1d2035] pt-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">¿Sin archivo o sin OCR?</p>
            <button type="button" onClick={capturarAMano} className={BTN_SECONDARY}>
              <Keyboard className="h-4 w-4" />
              Capturar a mano
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 2: leyendo ────────────────────────────────────────────── */}
      {paso === 'extrayendo' && (
        <div role="status" className="flex flex-col items-center gap-3 px-5 py-16 text-center">
          <LoaderCircle className="h-8 w-8 animate-spin text-[#1B2980] dark:text-indigo-400" />
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Leyendo la factura…</p>
          <p className="max-w-xs text-xs text-zinc-500 dark:text-zinc-400">Puede tardar hasta un minuto. No cierres esta ventana.</p>
        </div>
      )}

      {/* ── Paso 3: revisión ───────────────────────────────────────────── */}
      {paso === 'formulario' && (
        <div className={cn('grid', conVistaPrevia && 'lg:grid-cols-2')}>
          {conVistaPrevia && urlVistaPrevia && (
            <div className="border-b border-zinc-100 dark:border-[#1d2035] bg-zinc-100 dark:bg-[#0d0f1a] p-3 lg:sticky lg:top-0 lg:self-start lg:border-b-0">
              {archivo?.type === MIME_PDF ? (
                <iframe src={urlVistaPrevia} title="Factura" className="h-[45vh] w-full rounded-lg bg-white lg:h-[70vh]" />
              ) : (
                <div className="max-h-[45vh] overflow-auto rounded-lg lg:max-h-[70vh]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- object URL local, no optimizable */}
                  <img src={urlVistaPrevia} alt="Factura subida" className="w-full" />
                </div>
              )}
            </div>
          )}

          <form
            noValidate
            onSubmit={e => { e.preventDefault(); void guardar(true) }}
            className="space-y-4 px-5 py-4"
          >
            {documento && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="factura-cliente-edit" className={LABEL_CLASS}>Cliente</label>
                  <select id="factura-cliente-edit" value={clienteId} onChange={e => setClienteId(e.target.value)} className={INPUT_CLASS}>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="factura-tipo-edit" className={LABEL_CLASS}>Tipo</label>
                  <select id="factura-tipo-edit" value={tipo} onChange={e => setTipo(e.target.value as TipoDocumento)} className={INPUT_CLASS}>
                    <option value="compra">Compra</option>
                    <option value="venta">Venta</option>
                  </select>
                </div>
              </div>
            )}

            {tipo === 'compra' ? (
              <>
                <p className={TITULO_SECCION}>Comprobante</p>
                <div className={GRID2}>
                  {campo('rncCedulaContraparte', 'RNC / Cédula del proveedor')}
                  {campo('nombreContraparte', 'Nombre del proveedor')}
                  {campo('ncf')}
                  {campo('ncfModificado', 'NCF modificado (opcional)')}
                  {campo('fechaComprobante')}
                  {selector('tipoBienesServicios', TIPO_BIENES_SERVICIOS_606)}
                </div>

                <p className={TITULO_SECCION}>Montos</p>
                <div className={GRID3}>
                  {campo('montoServicios')}
                  {campo('montoBienes')}
                  {campo('itbisFacturado')}
                  {campo('impuestoSelectivoConsumo', 'Selectivo al consumo')}
                  {campo('otrosImpuestos')}
                  {campo('propinaLegal')}
                  {campo('montoTotal')}
                </div>

                <p className={TITULO_SECCION}>Pago</p>
                <div className={GRID2}>
                  {selector('formaPago', FORMA_PAGO_606, 'Forma de pago (opcional)')}
                  {campo('fechaPago', 'Fecha de pago (si ya se pagó)')}
                </div>

                <details className="rounded-lg border border-zinc-200 dark:border-[#252840] px-4 py-3" open={
                  !!(valores.itbisRetenido || valores.tipoRetencionISR || valores.montoRetencionRenta || valores.itbisProporcionalidad || valores.itbisLlevadoAlCosto)
                }>
                  <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Retenciones y tratamiento del ITBIS (si aplica)
                  </summary>
                  <div className={cn(GRID2, 'mt-4')}>
                    {campo('itbisRetenido')}
                    {selector('tipoRetencionISR', TIPO_RETENCION_ISR_606)}
                    {campo('montoRetencionRenta')}
                    {campo('itbisProporcionalidad', 'ITBIS sujeto a proporcionalidad (Art. 349)')}
                    {campo('itbisLlevadoAlCosto')}
                  </div>
                </details>
              </>
            ) : (
              <>
                <p className={TITULO_SECCION}>Comprobante</p>
                <div className={GRID2}>
                  {selector('tipoIdentificacion', TIPO_IDENTIFICACION_607)}
                  {campo('rncCedulaContraparte', 'RNC, cédula o pasaporte del cliente')}
                  {campo('nombreContraparte', 'Nombre del cliente')}
                  {campo('ncf')}
                  {campo('ncfModificado', 'NCF modificado (opcional)')}
                  {campo('fechaComprobante')}
                  {selector('tipoIngreso', TIPO_INGRESO_607)}
                </div>

                <p className={TITULO_SECCION}>Montos</p>
                <div className={GRID3}>
                  {campo('montoFacturado')}
                  {campo('itbisFacturado')}
                  {campo('impuestoSelectivoConsumo', 'Selectivo al consumo')}
                  {campo('otrosImpuestos')}
                  {campo('propinaLegal')}
                  {campo('montoTotal')}
                </div>

                {esConsumoBajoUmbral(campos) ? (
                  <p className="flex items-start gap-2 rounded-lg border border-indigo-100 dark:border-indigo-900/40 bg-[#eef0fb] dark:bg-indigo-950/30 px-3.5 py-2.5 text-xs text-[#151f66] dark:text-indigo-200">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Factura de consumo menor de RD$250,000: no se detalla en el 607. Cuenta para el resumen de
                      facturas de consumo que se digita en la Oficina Virtual, así que no necesita identificación,
                      tipo de ingreso ni forma de cobro.
                    </span>
                  </p>
                ) : (
                  <>
                    <p className={TITULO_SECCION}>Cómo se cobró (montos con impuestos)</p>
                    <div className={GRID3}>
                      {campo('cobroEfectivo')}
                      {campo('cobroCheque')}
                      {campo('cobroTarjeta')}
                      {campo('cobroCredito')}
                      {campo('cobroBonos')}
                      {campo('cobroPermuta')}
                      {campo('cobroOtras')}
                    </div>

                    <details className="rounded-lg border border-zinc-200 dark:border-[#252840] px-4 py-3" open={
                      !!(valores.itbisRetenidoTerceros || valores.retencionRentaTerceros || valores.fechaRetencion)
                    }>
                      <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Retenciones que le hicieron al cliente (si aplica)
                      </summary>
                      <div className={cn(GRID3, 'mt-4')}>
                        {campo('itbisRetenidoTerceros')}
                        {campo('retencionRentaTerceros')}
                        {campo('fechaRetencion')}
                      </div>
                    </details>
                  </>
                )}
              </>
            )}

            {errorGeneral && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{errorGeneral.mensaje}</p>}

            {diferenciaTotal !== 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Lo facturado más los impuestos no da el total de la factura (diferencia de {formatRD(Math.abs(diferenciaTotal))}).
                  Revisa los montos contra la factura.
                </span>
              </p>
            )}

            {duplicado && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Ya registraste este comprobante para este cliente (mismo NCF y mismo {contraparte}).
                  No se puede marcar como revisada dos veces.
                </span>
              </p>
            )}

            {errorGuardar && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{errorGuardar}</p>}

            <div className="flex flex-wrap justify-end gap-3 border-t border-zinc-100 dark:border-[#1d2035] pt-4">
              <button type="button" onClick={onClose} className={BTN_SECONDARY}>Cancelar</button>
              <button type="button" disabled={guardando} onClick={() => void guardar(false)} className={BTN_SECONDARY}>
                Guardar como pendiente
              </button>
              <button type="submit" disabled={guardando || !!duplicado} className={BTN_PRIMARY}>
                Guardar como revisada
              </button>
            </div>
          </form>
        </div>
      )}
    </Modal>
  )
}
