import type { ClienteFiscal, DocumentoFiscal } from '@/types'

// Única puerta de acceso a los datos. Las pantallas nunca tocan
// `localStorage` directamente: hablan con esta interfaz, así que pasar a
// Firestore es escribir otra implementación, no rehacer las pantallas.
// Todos los métodos son asíncronos aunque `localStorage` no lo necesite,
// precisamente para que ese cambio no altere a quien los llama.
export interface Repositorio {
  listarClientes(): Promise<ClienteFiscal[]>
  guardarCliente(cliente: ClienteFiscal): Promise<void>
  // Elimina el cliente, todas sus facturas y las imágenes de estas.
  eliminarCliente(id: string): Promise<void>

  listarDocumentos(): Promise<DocumentoFiscal[]>
  guardarDocumento(documento: DocumentoFiscal): Promise<void>
  // Varias facturas de una vez (captura por lotes).
  guardarDocumentos(documentos: readonly DocumentoFiscal[]): Promise<void>
  // Elimina la factura Y su imagen.
  eliminarDocumento(id: string): Promise<void>

  // Imagen o PDF de una factura, para poder revisarla contra el original más
  // tarde. Una por factura, identificada por el id del documento.
  guardarArchivo(documentoId: string, archivo: Blob): Promise<void>
  obtenerArchivo(documentoId: string): Promise<Blob | null>
}

export class AlmacenamientoError extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'AlmacenamientoError'
  }
}
