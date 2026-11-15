import type { ClienteFiscal, DocumentoFiscal } from '@/types'

// Única puerta de acceso a los datos. Las pantallas nunca tocan
// `localStorage` directamente: hablan con esta interfaz, así que pasar a
// Firestore es escribir otra implementación, no rehacer las pantallas.
// Todos los métodos son asíncronos aunque `localStorage` no lo necesite,
// precisamente para que ese cambio no altere a quien los llama.
export interface Repositorio {
  listarClientes(): Promise<ClienteFiscal[]>
  guardarCliente(cliente: ClienteFiscal): Promise<void>
  // Elimina el cliente Y todas sus facturas.
  eliminarCliente(id: string): Promise<void>

  listarDocumentos(): Promise<DocumentoFiscal[]>
  guardarDocumento(documento: DocumentoFiscal): Promise<void>
  eliminarDocumento(id: string): Promise<void>
}

export class AlmacenamientoError extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'AlmacenamientoError'
  }
}
