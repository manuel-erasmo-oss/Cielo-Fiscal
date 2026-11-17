import { normalizarDocumento } from '@/lib/documentos'
import type { ClienteFiscal, DocumentoFiscal } from '@/types'
import { AlmacenamientoError, type Repositorio } from './repositorio'

// Implementación del MVP: todo en el navegador. Clientes y facturas en
// `localStorage`; las imágenes de las facturas en IndexedDB (son demasiado
// grandes para `localStorage`). Los datos viven solo en este navegador y este
// equipo; se pierden si el usuario borra los datos del sitio. Ver CLAUDE.md,
// "Decisión de arquitectura del MVP".

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

// ─── Imágenes de facturas (IndexedDB) ────────────────────────────────────────

const BD_NOMBRE = 'cielo-fiscal'
const ALMACEN_ARCHIVOS = 'archivos'

function abrirBD(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let solicitud: IDBOpenDBRequest
    try {
      solicitud = window.indexedDB.open(BD_NOMBRE, 1)
    } catch {
      reject(new AlmacenamientoError('El navegador no permite guardar las imágenes de las facturas.'))
      return
    }
    solicitud.onupgradeneeded = () => {
      if (!solicitud.result.objectStoreNames.contains(ALMACEN_ARCHIVOS)) solicitud.result.createObjectStore(ALMACEN_ARCHIVOS)
    }
    solicitud.onsuccess = () => resolve(solicitud.result)
    solicitud.onerror = () => reject(new AlmacenamientoError('No se pudo abrir el almacén de imágenes del navegador.'))
  })
}

// Ejecuta una operación sobre el almacén de imágenes y espera a que la
// transacción termine de verdad (no solo a que la petición responda).
async function conArchivos<T>(modo: IDBTransactionMode, operar: (almacen: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const bd = await abrirBD()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = bd.transaction(ALMACEN_ARCHIVOS, modo)
      const peticion = operar(tx.objectStore(ALMACEN_ARCHIVOS))
      tx.oncomplete = () => resolve(peticion ? peticion.result : undefined)
      tx.onerror = tx.onabort = () => reject(new AlmacenamientoError('No se pudo guardar la imagen: el almacenamiento del navegador está lleno o bloqueado.'))
    })
  } finally {
    bd.close()
  }
}

async function eliminarArchivos(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  await conArchivos('readwrite', almacen => { for (const id of ids) almacen.delete(id) })
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
    const documentos = leer<DocumentoFiscal>(CLAVE_DOCUMENTOS)
    escribir(CLAVE_DOCUMENTOS, documentos.filter(d => d.clienteId !== id))
    escribir(CLAVE_CLIENTES, leer<ClienteFiscal>(CLAVE_CLIENTES).filter(c => c.id !== id))
    await eliminarArchivos(documentos.filter(d => d.clienteId === id).map(d => d.id))
  },

  async listarDocumentos() {
    return leer<DocumentoFiscal>(CLAVE_DOCUMENTOS).map(normalizarDocumento)
  },
  async guardarDocumento(documento) {
    escribir(CLAVE_DOCUMENTOS, upsert(leer<DocumentoFiscal>(CLAVE_DOCUMENTOS), documento))
  },
  async guardarDocumentos(documentos) {
    escribir(CLAVE_DOCUMENTOS, documentos.reduce(upsert, leer<DocumentoFiscal>(CLAVE_DOCUMENTOS)))
  },
  async eliminarDocumento(id) {
    escribir(CLAVE_DOCUMENTOS, leer<DocumentoFiscal>(CLAVE_DOCUMENTOS).filter(d => d.id !== id))
    await eliminarArchivos([id])
  },

  async guardarArchivo(documentoId, archivo) {
    await conArchivos('readwrite', almacen => { almacen.put(archivo, documentoId) })
  },
  async obtenerArchivo(documentoId) {
    const archivo = await conArchivos<unknown>('readonly', almacen => almacen.get(documentoId))
    return archivo instanceof Blob ? archivo : null
  },
}
