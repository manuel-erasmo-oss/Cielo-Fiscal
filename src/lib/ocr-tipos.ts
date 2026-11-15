import type { CampoExtraido, DocumentoFiscal } from '@/types'

// Contrato compartido entre la route `/api/ocr` (servidor) y quien la llama
// (navegador). Sin dependencias de servidor ni de DOM.

export const MIME_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type MimeImagen = (typeof MIME_IMAGEN)[number]
export const MIME_PDF = 'application/pdf'

export function esMimeImagen(mime: string): mime is MimeImagen {
  return (MIME_IMAGEN as readonly string[]).includes(mime)
}

// Tope del archivo que se envía al servidor. Queda por debajo del límite de
// cuerpo de una función de Vercel (4.5 MB); las fotos más pesadas se reducen
// en el navegador antes de enviarse (ver ocr-cliente.ts).
export const TAMANO_MAXIMO_BYTES = 4 * 1024 * 1024

// Encabezado con el código de acceso que protege la route.
export const ENCABEZADO_CODIGO = 'x-codigo-acceso'

export interface ResultadoOCR {
  // Todos los campos de la factura; los que el OCR no lee vienen en null.
  extraccion: Pick<DocumentoFiscal, CampoExtraido>
  // 0..1, autorreportada por el modelo. Orientativa.
  confianzaOCR: number
  // Campos que el modelo marcó como dudosos o cuyo valor no pasó validación.
  // Lo que FALTA lo calcula quien recibe la respuesta, con las reglas del
  // formato (necesita saber de qué cliente es la factura).
  camposDudosos: CampoExtraido[]
}

export interface ErrorOCR {
  error: string
}
