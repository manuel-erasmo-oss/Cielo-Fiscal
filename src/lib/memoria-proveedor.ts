import type { ResultadoOCR } from '@/lib/ocr-tipos'
import type { DocumentoFiscal } from '@/types'
import { soloDigitos } from '@/lib/utils'

// Memoria por proveedor (pedida por el usuario el 2026-11-25): el "tipo de
// bienes y servicios" del 606 no está impreso en la factura, así que la IA
// lo deduce y a menudo duda. Si una persona ya revisó facturas de ese mismo
// proveedor EN ESTA EMPRESA y siempre les dio la misma categoría, esa
// categoría se usa sin dudar. Es por empresa porque lo mismo puede ser costo
// para un cliente y gasto para otro (NIIF para las PYMES, Secciones 13 y 17).
// No guarda nada aparte: se calcula de las facturas revisadas.

// Cuántas facturas revisadas recientes del proveedor se miran.
const RECIENTES = 5

// Categoría que una persona le dio siempre a este proveedor en las últimas
// facturas revisadas de la empresa. null si no hay, o si no coinciden (el
// proveedor vende cosas de distintas categorías: decide la IA).
export function categoriaRecordada(
  documentos: readonly Pick<DocumentoFiscal, 'tipo' | 'estadoRevision' | 'rncCedulaContraparte' | 'tipoBienesServicios' | 'revisadoEn' | 'actualizadoEn'>[],
  rncProveedor: string | null | undefined,
): string | null {
  const rnc = soloDigitos(rncProveedor ?? '')
  if (rnc.length !== 9 && rnc.length !== 11) return null
  const revisadas = documentos
    .filter(d => d.tipo === 'compra' && d.estadoRevision === 'revisado' && d.rncCedulaContraparte === rnc && d.tipoBienesServicios)
    .sort((a, b) => (b.revisadoEn ?? b.actualizadoEn).localeCompare(a.revisadoEn ?? a.actualizadoEn))
    .slice(0, RECIENTES)
  if (revisadas.length === 0) return null
  const categoria = revisadas[0].tipoBienesServicios
  return revisadas.every(d => d.tipoBienesServicios === categoria) ? categoria : null
}

// Pone la categoría recordada en la lectura de la IA (si es una compra) y la
// quita de las dudas: una persona ya la decidió para este proveedor.
export function aplicarCategoriaRecordada(lectura: ResultadoOCR, categoria: string | null): ResultadoOCR {
  if (!categoria || !lectura.esComprobante || lectura.tipo !== 'compra') return lectura
  return {
    ...lectura,
    extraccion: { ...lectura.extraccion, tipoBienesServicios: categoria },
    camposDudosos: lectura.camposDudosos.filter(c => c !== 'tipoBienesServicios'),
  }
}
