import type { ClienteFiscal, DocumentoFiscal } from '@/types'
import { AlmacenamientoError, type Repositorio } from './repositorio'

// Implementación del MVP: todo en `localStorage` del navegador. Los datos
// viven solo en este navegador y este equipo; se pierden si el usuario borra
// los datos del sitio. Ver CLAUDE.md, "Decisión de arquitectura del MVP".

const CLAVE_CLIENTES = 'cielo-fiscal:clientes:v1'
const CLAVE_DOCUMENTOS = 'cielo-fiscal:documentos:v1'

function leer<T>(clave: string): T[] {
  let crudo: string | null
  try {
    crudo = window.localStorage.getItem(clave)
  } catch {
    throw new AlmacenamientoError('El navegador no permite leer los datos guardados (¿modo privado o almacenamiento bloqueado?).')
  }
  if (crudo === null) return []
  try {
    const datos: unknown = JSON.parse(crudo)
    if (!Array.isArray(datos)) throw new Error('no es una lista')
    return datos as T[]
  } catch {
    // No se sobrescribe ni se descarta: datos fiscales corruptos deben
    // poder recuperarse a mano, no desaparecer en silencio.
    throw new AlmacenamientoError(`Los datos guardados en "${clave}" están dañados y no se pueden leer.`)
  }
}

function escribir<T>(clave: string, datos: T[]): void {
  try {
    window.localStorage.setItem(clave, JSON.stringify(datos))
  } catch {
    throw new AlmacenamientoError('No se pudo guardar: el almacenamiento del navegador está lleno o bloqueado.')
  }
}

function upsert<T extends { id: string }>(lista: T[], item: T): T[] {
  const i = lista.findIndex(x => x.id === item.id)
  if (i === -1) return [...lista, item]
  const copia = lista.slice()
  copia[i] = item
  return copia
}

export const repositorioLocal: Repositorio = {
  async listarClientes() {
    return leer<ClienteFiscal>(CLAVE_CLIENTES)
  },
  async guardarCliente(cliente) {
    escribir(CLAVE_CLIENTES, upsert(leer<ClienteFiscal>(CLAVE_CLIENTES), cliente))
  },
  async eliminarCliente(id) {
    // Primero las facturas: si la segunda escritura fallara, queda un cliente
    // sin facturas (visible y borrable de nuevo), nunca facturas huérfanas.
    escribir(CLAVE_DOCUMENTOS, leer<DocumentoFiscal>(CLAVE_DOCUMENTOS).filter(d => d.clienteId !== id))
    escribir(CLAVE_CLIENTES, leer<ClienteFiscal>(CLAVE_CLIENTES).filter(c => c.id !== id))
  },

  async listarDocumentos() {
    return leer<DocumentoFiscal>(CLAVE_DOCUMENTOS)
  },
  async guardarDocumento(documento) {
    escribir(CLAVE_DOCUMENTOS, upsert(leer<DocumentoFiscal>(CLAVE_DOCUMENTOS), documento))
  },
  async eliminarDocumento(id) {
    escribir(CLAVE_DOCUMENTOS, leer<DocumentoFiscal>(CLAVE_DOCUMENTOS).filter(d => d.id !== id))
  },
}
