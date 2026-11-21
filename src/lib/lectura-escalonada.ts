import { conDatosDGII, cuadra, fusionarConLectura, type BorradorPagina, type ContextoLote } from '@/lib/lote/borrador'
import { CAMPOS_EXTRAIDOS, ETIQUETA_CAMPO, problemasDeRevision } from '@/lib/documentos'
import { digitoVerificadorCorrecto } from '@/lib/dgii-formatos'
import { MODELO_OCR_POR_DEFECTO, MODELO_OCR_RELECTURA, modeloOCR } from '@/lib/ocr-modelos'
import type { ResultadoOCR } from '@/lib/ocr-tipos'
import type { CampoExtraido, TipoDocumento } from '@/types'

// Lectura escalonada (decisión del usuario, 2026-11-21):
//   1. Haiku lee la factura.
//   2. Si su lectura no pasa las validaciones automáticas, Sonnet la relee
//      UNA sola vez.
//   3. Si Sonnet tampoco pasa, la factura queda para captura manual: una
//      persona la digita y la valida, y no se permite volver a leerla con IA.
// No se usa la confianza que reporta el propio modelo para decidir (no es
// confiable; ver CLAUDE.md, "Costo y límites").
// Lógica pura: la llamada a la IA se recibe como función, para poder probarla.

export const NOTA_CAPTURA_MANUAL =
  'La IA no pudo leer esta factura con seguridad. No se permite volver a leerla con IA: una persona tiene que digitarla y validarla.'

export const MOTIVO_YA_AGOTADA =
  'Este documento ya pasó por la lectura con IA y quedó para captura manual. No se permite volver a leerlo.'

// Campos que llena la IA y que una relectura podría corregir.
export const CAMPOS_QUE_LEE_LA_IA: Record<TipoDocumento, readonly CampoExtraido[]> = {
  compra: [
    'rncCedulaContraparte', 'nombreContraparte', 'ncf', 'ncfModificado', 'fechaComprobante', 'fechaPago',
    'montoServicios', 'montoBienes', 'itbisFacturado', 'impuestoSelectivoConsumo', 'otrosImpuestos',
    'propinaLegal', 'montoTotal', 'tipoBienesServicios', 'formaPago',
  ],
  venta: [
    'rncCedulaContraparte', 'nombreContraparte', 'ncf', 'ncfModificado', 'fechaComprobante',
    'montoFacturado', 'itbisFacturado', 'impuestoSelectivoConsumo', 'otrosImpuestos', 'propinaLegal', 'montoTotal',
  ],
}

// Estados en los que la página no se guarda: no tiene sentido releerla.
const SIN_RELECTURA = ['ajena', 'duplicada', 'otro_modulo', 'no_factura']

// Campos que vienen exactos de fuera de la IA: el QR (lo firmó el emisor) y
// el ITBIS que tiene registrado la DGII. Ninguna relectura los cambia.
function camposExactos(b: BorradorPagina): Set<CampoExtraido> {
  const exactos = new Set<CampoExtraido>()
  if (b.conQr) {
    exactos.add('ncf')
    if (b.campos.rncCedulaContraparte) exactos.add('rncCedulaContraparte')
    if (b.campos.fechaComprobante) exactos.add('fechaComprobante')
    if (b.campos.montoTotal !== null) exactos.add('montoTotal')
  }
  if (b.dgii?.itbis !== null && b.dgii?.itbis !== undefined) exactos.add('itbisFacturado')
  return exactos
}

// Mismo valor salvo formato: montos con tolerancia de 5 centavos; textos sin
// espacios ni guiones y en mayúsculas (un NCF o un RNC escrito distinto).
function igual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 0.05
  const limpio = (v: unknown) => String(v).replace(/[\s-]/g, '').toUpperCase()
  return limpio(a) === limpio(b)
}

const QR_A_COMPARAR: CampoExtraido[] = ['ncf', 'rncCedulaContraparte', 'fechaComprobante', 'montoTotal']

// Por qué una lectura no pasa las validaciones. Vacío = pasa.
// `base` es la página ANTES de leerla (con su QR y lo de la DGII, si los hay).
export function motivosRelectura(base: BorradorPagina, lectura: ResultadoOCR, ctx: ContextoLote, rncCliente: string): string[] {
  const fusion = fusionarConLectura(base, lectura, ctx)
  if (SIN_RELECTURA.includes(fusion.estado)) return []
  const motivos: string[] = []

  // 1. Contra el QR: si la IA leyó distinto lo que el emisor firmó, el resto
  //    de su lectura tampoco es confiable.
  if (base.conQr) {
    if (!lectura.esComprobante || lectura.tipo !== base.tipo) {
      motivos.push('La lectura no coincide con el código QR de la factura.')
    } else {
      for (const campo of QR_A_COMPARAR) {
        const delQr = base.campos[campo]
        const leido = lectura.extraccion[campo]
        if (delQr !== null && delQr !== undefined && leido !== null && leido !== undefined && !igual(delQr, leido)) {
          motivos.push(`${ETIQUETA_CAMPO[campo]} leído distinto al del código QR.`)
        }
      }
    }
  }

  // 2. Los montos tienen que sumar el total.
  const { campos } = conDatosDGII(fusion)
  if (cuadra(fusion.tipo, campos) === false) motivos.push('Los montos no suman el total de la factura.')

  // 3. Lo que el formato de la DGII objeta en los campos que leyó la IA
  //    (vacíos obligatorios, formatos inválidos). Lo exacto no cuenta.
  const exactos = camposExactos(fusion)
  const leeIA = new Set(CAMPOS_QUE_LEE_LA_IA[fusion.tipo])
  for (const p of problemasDeRevision(fusion.tipo, { ...campos, qrUrl: fusion.qrUrl }, rncCliente)) {
    if (p.nivel === 'error' && p.campo && leeIA.has(p.campo) && !exactos.has(p.campo)) {
      motivos.push(`${ETIQUETA_CAMPO[p.campo]}: ${p.mensaje}`)
    }
  }

  // 4. Un RNC con el dígito verificador malo suele ser un dígito mal leído.
  if (!exactos.has('rncCedulaContraparte') && campos.rncCedulaContraparte && digitoVerificadorCorrecto(campos.rncCedulaContraparte) === false) {
    motivos.push('El dígito verificador del RNC o la cédula no cuadra.')
  }
  return [...new Set(motivos)]
}

// La página queda para captura manual: todos los campos que llena la IA
// (salvo los exactos del QR y la DGII) pasan a estar en duda, así que la
// factura no entra en la aprobación en bloque y la persona los revisa uno a uno.
export function marcarCapturaManual(b: BorradorPagina, motivos: string[], modelo: string): BorradorPagina {
  const exactos = camposExactos(b)
  const dudosos = new Set<CampoExtraido>(b.dudosos)
  for (const c of CAMPOS_QUE_LEE_LA_IA[b.tipo]) if (!exactos.has(c)) dudosos.add(c)
  return {
    ...b,
    leidaConIA: true,
    dudosos: CAMPOS_EXTRAIDOS.filter(c => dudosos.has(c)),
    nota: NOTA_CAPTURA_MANUAL,
    lecturaIA: { modelo, releida: true, manual: true, motivos },
  }
}

export interface ResultadoEscalonado {
  // La lectura que queda (la de Sonnet si hubo relectura). null si las dos
  // llamadas fallaron.
  lectura: ResultadoOCR | null
  modelo: string
  releida: boolean
  manual: boolean
  motivos: string[]
}

const nombre = (id: string) => modeloOCR(id)?.nombre ?? id
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'error desconocido')

// Haiku primero; si no pasa, UNA relectura con Sonnet; si tampoco, manual.
// `esFatal`: errores que no son de la lectura sino del servicio (falta el
// código, el servidor no tiene la IA): se relanzan y la página queda sin leer.
export async function leerEscalonado(
  leer: (modelo: string) => Promise<ResultadoOCR>,
  evaluar: (lectura: ResultadoOCR) => string[],
  esFatal: (e: unknown) => boolean,
): Promise<ResultadoEscalonado> {
  let primera: ResultadoOCR | null = null
  let motivos: string[]
  try {
    primera = await leer(MODELO_OCR_POR_DEFECTO)
    motivos = evaluar(primera)
    if (motivos.length === 0) return { lectura: primera, modelo: MODELO_OCR_POR_DEFECTO, releida: false, manual: false, motivos: [] }
  } catch (e) {
    if (esFatal(e)) throw e
    motivos = [`La lectura con ${nombre(MODELO_OCR_POR_DEFECTO)} falló: ${mensajeDe(e)}`]
  }

  let segunda: ResultadoOCR
  try {
    segunda = await leer(MODELO_OCR_RELECTURA)
  } catch (e) {
    if (esFatal(e)) throw e
    return {
      lectura: primera,
      modelo: primera ? MODELO_OCR_POR_DEFECTO : MODELO_OCR_RELECTURA,
      releida: true,
      manual: true,
      motivos: [...motivos, `La relectura con ${nombre(MODELO_OCR_RELECTURA)} falló: ${mensajeDe(e)}`],
    }
  }
  const motivosSegunda = evaluar(segunda)
  return { lectura: segunda, modelo: MODELO_OCR_RELECTURA, releida: true, manual: motivosSegunda.length > 0, motivos: motivosSegunda }
}

// Aplica el resultado escalonado a la página.
export function aplicarResultado(base: BorradorPagina, r: ResultadoEscalonado, ctx: ContextoLote): BorradorPagina {
  const leida = r.lectura ? fusionarConLectura(base, r.lectura, ctx) : { ...base, leidaConIA: true }
  if (r.manual) return marcarCapturaManual(leida, r.motivos, r.modelo)
  return { ...leida, lecturaIA: { modelo: r.modelo, releida: r.releida, manual: false, motivos: [] } }
}

// SHA-256 en hexadecimal de un archivo (en el navegador y en Node 20+).
export async function huellaDe(archivo: Blob): Promise<string> {
  const resumen = await crypto.subtle.digest('SHA-256', await archivo.arrayBuffer())
  return Array.from(new Uint8Array(resumen), b => b.toString(16).padStart(2, '0')).join('')
}
