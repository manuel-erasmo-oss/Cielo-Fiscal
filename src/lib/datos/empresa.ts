import type { DocumentoFiscal } from '@/types'

// Separación de datos entre empresas (pedida por el usuario el 2026-11-18:
// "para mí es fundamental la separación de los datos entre empresas ... es
// fácil confundirse y meter información de una empresa en otra").
//
// Dentro de una empresa, toda lectura se filtra por ella y toda escritura se
// comprueba aquí: una factura de otra empresa no se guarda, no se borra y su
// imagen no se lee, aunque una pantalla lo intente por error. Lógica pura,
// para poder probarla sin navegador.

export class EmpresaEquivocadaError extends Error {
  constructor() {
    super('Esta factura pertenece a otra empresa. Sal a "Tus empresas" y entra en la empresa correcta.')
    this.name = 'EmpresaEquivocadaError'
  }
}

export function documentosDeEmpresa<T extends Pick<DocumentoFiscal, 'clienteId'>>(empresaId: string, documentos: readonly T[]): T[] {
  return documentos.filter(d => d.clienteId === empresaId)
}

// Lanza si alguno de los documentos no es de la empresa.
export function exigirDeEmpresa(empresaId: string, documentos: readonly Pick<DocumentoFiscal, 'clienteId'>[]): void {
  if (!empresaId || documentos.some(d => d.clienteId !== empresaId)) throw new EmpresaEquivocadaError()
}

// Lanza si el id no corresponde a una factura de la empresa (para borrar o
// leer su imagen, que se piden por id).
export function exigirIdDeEmpresa(empresaId: string, id: string, documentos: readonly Pick<DocumentoFiscal, 'id' | 'clienteId'>[]): void {
  const doc = documentos.find(d => d.id === id)
  if (!doc || doc.clienteId !== empresaId) throw new EmpresaEquivocadaError()
}
