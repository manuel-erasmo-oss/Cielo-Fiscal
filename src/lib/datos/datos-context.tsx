'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ClienteFiscal, DocumentoFiscal } from '@/types'
import type { Repositorio } from './repositorio'
import { repositorioLocal } from './repositorio-local'

// Estado compartido de clientes y facturas. Cada mutación escribe en el
// repositorio y luego recarga desde él, así la pantalla siempre refleja lo
// que realmente quedó guardado.

interface DatosCtx {
  // false hasta que termina la primera carga (evita mostrar "sin datos"
  // durante el instante previo a leer el almacenamiento).
  listo: boolean
  // Mensaje si la carga inicial falló (almacenamiento bloqueado o dañado).
  errorCarga: string | null
  clientes: ClienteFiscal[]
  documentos: DocumentoFiscal[]
  guardarCliente(cliente: ClienteFiscal): Promise<void>
  eliminarCliente(id: string): Promise<void>
  // `archivo`: imagen o PDF de la factura, si se subió una nueva.
  guardarDocumento(documento: DocumentoFiscal, archivo?: Blob): Promise<void>
  // Captura por lotes: varias facturas con su imagen.
  guardarLote(lote: readonly { documento: DocumentoFiscal; archivo: Blob }[]): Promise<void>
  eliminarDocumento(id: string): Promise<void>
  obtenerArchivo(documentoId: string): Promise<Blob | null>
}

const DatosContext = createContext<DatosCtx | null>(null)

export function DatosProvider({
  children,
  repositorio = repositorioLocal,
}: {
  children: ReactNode
  repositorio?: Repositorio
}) {
  const [listo, setListo] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [clientes, setClientes] = useState<ClienteFiscal[]>([])
  const [documentos, setDocumentos] = useState<DocumentoFiscal[]>([])

  const recargar = useCallback(async () => {
    const [c, d] = await Promise.all([repositorio.listarClientes(), repositorio.listarDocumentos()])
    setClientes(c)
    setDocumentos(d)
  }, [repositorio])

  useEffect(() => {
    recargar()
      .catch((e: unknown) => setErrorCarga(e instanceof Error ? e.message : 'No se pudieron leer los datos guardados.'))
      .finally(() => setListo(true))
  }, [recargar])

  const valor = useMemo<DatosCtx>(() => ({
    listo,
    errorCarga,
    clientes,
    documentos,
    async guardarCliente(cliente) {
      await repositorio.guardarCliente(cliente)
      await recargar()
    },
    async eliminarCliente(id) {
      await repositorio.eliminarCliente(id)
      await recargar()
    },
    async guardarDocumento(documento, archivo) {
      // Primero la imagen: si no cabe, la factura no queda guardada a medias.
      if (archivo) await repositorio.guardarArchivo(documento.id, archivo)
      await repositorio.guardarDocumento(documento)
      await recargar()
    },
    async guardarLote(lote) {
      for (const { documento, archivo } of lote) await repositorio.guardarArchivo(documento.id, archivo)
      await repositorio.guardarDocumentos(lote.map(l => l.documento))
      await recargar()
    },
    obtenerArchivo: id => repositorio.obtenerArchivo(id),
    async eliminarDocumento(id) {
      await repositorio.eliminarDocumento(id)
      await recargar()
    },
  }), [listo, errorCarga, clientes, documentos, repositorio, recargar])

  return <DatosContext.Provider value={valor}>{children}</DatosContext.Provider>
}

export function useDatos(): DatosCtx {
  const ctx = useContext(DatosContext)
  if (!ctx) throw new Error('useDatos debe usarse dentro de <DatosProvider>')
  return ctx
}
