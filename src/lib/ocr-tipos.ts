import type { CampoExtraido, DocumentoFiscal, TipoDocumento } from '@/types'

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

// Varias imágenes en una misma solicitud son TRAMOS consecutivos, de arriba
// abajo, de un solo documento (un recibo largo partido para que se lea bien).
export const MAXIMO_TRAMOS = 8

export interface ResultadoOCR {
  // false si la página no es una factura ni otro comprobante fiscal (una
  // portada, una declaración, un estado de cuenta, una hoja en blanco). En
  // ese caso `extraccion` viene vacía.
  esComprobante: boolean
  // Compra o venta del cliente, deducido de quién aparece como emisor y quién
  // como comprador. Si no se pudo deducir, es el tipo que pidió quien llamó.
  tipo: TipoDocumento
  // true: el RNC del cliente aparece en la factura (como emisor o comprador).
  // false: se leyeron los dos RNC y ninguno es el del cliente.
  // null: no se pudo comprobar.
  coincideCliente: boolean | null
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
