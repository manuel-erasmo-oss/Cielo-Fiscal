'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useDatos } from '@/lib/datos/datos-context'
import { documentosDeEmpresa, exigirDeEmpresa, exigirIdDeEmpresa } from '@/lib/datos/empresa'
import type { ClienteFiscal, DocumentoFiscal } from '@/types'

// Datos de UNA empresa: la que el contador eligió en "Tus empresas". Las
// pantallas de trabajo (Dashboard, Ingresos, Costos y gastos, Subir lote,
// Reportes) solo usan este contexto, nunca `useDatos` directo, así no pueden
// ver ni guardar facturas de otra empresa (ver src/lib/datos/empresa.ts).

export interface DatosEmpresaCtx {
  listo: boolean
  errorCarga: string | null
  // null mientras carga, o si el id de la dirección no es de ninguna empresa.
  empresa: ClienteFiscal | null
  // Solo las facturas de esta empresa.
  documentos: DocumentoFiscal[]
  guardarDocumento(documento: DocumentoFiscal, archivo?: Blob): Promise<void>
  guardarDocumentos(documentos: readonly DocumentoFiscal[]): Promise<void>
  guardarLote(lote: readonly { documento: DocumentoFiscal; archivo: Blob }[]): Promise<void>
  eliminarDocumento(id: string): Promise<void>
  obtenerArchivo(documentoId: string): Promise<Blob | null>
}

const EmpresaContext = createContext<DatosEmpresaCtx | null>(null)

export function EmpresaProvider({ empresaId, children }: { empresaId: string; children: ReactNode }) {
  const datos = useDatos()
  const valor = useMemo<DatosEmpresaCtx>(() => {
    const empresa = datos.clientes.find(c => c.id === empresaId) ?? null
    const documentos = documentosDeEmpresa(empresaId, datos.documentos)
    return {
      listo: datos.listo,
      errorCarga: datos.errorCarga,
      empresa,
      documentos,
      async guardarDocumento(documento, archivo) {
        exigirDeEmpresa(empresaId, [documento])
        await datos.guardarDocumento(documento, archivo)
      },
      async guardarDocumentos(lista) {
        exigirDeEmpresa(empresaId, lista)
        await datos.guardarDocumentos(lista)
      },
      async guardarLote(lote) {
        exigirDeEmpresa(empresaId, lote.map(l => l.documento))
        await datos.guardarLote(lote)
      },
      async eliminarDocumento(id) {
        exigirIdDeEmpresa(empresaId, id, datos.documentos)
        await datos.eliminarDocumento(id)
      },
      async obtenerArchivo(id) {
        exigirIdDeEmpresa(empresaId, id, datos.documentos)
        return datos.obtenerArchivo(id)
      },
    }
  }, [datos, empresaId])
  return <EmpresaContext.Provider value={valor}>{children}</EmpresaContext.Provider>
}

export function useEmpresa(): DatosEmpresaCtx {
  const ctx = useContext(EmpresaContext)
  if (!ctx) throw new Error('useEmpresa debe usarse dentro de una empresa (<EmpresaProvider>)')
  return ctx
}

// Para las pantallas de trabajo: el diseño de /empresa/[id] solo las dibuja
// cuando la empresa existe, así que aquí nunca es null.
export function useEmpresaActiva(): DatosEmpresaCtx & { empresa: ClienteFiscal } {
  const ctx = useEmpresa()
  if (!ctx.empresa) throw new Error('No hay una empresa activa')
  return ctx as DatosEmpresaCtx & { empresa: ClienteFiscal }
}

export { rutaEmpresa } from '@/lib/rutas'

// Para componentes compartidos (como el encabezado) que se dibujan dentro y
// fuera de una empresa.
export function useEmpresaOpcional(): DatosEmpresaCtx | null {
  return useContext(EmpresaContext)
}
