import { describe, expect, it } from 'vitest'
import { EmpresaEquivocadaError, documentosDeEmpresa, exigirDeEmpresa, exigirIdDeEmpresa } from './empresa'

const docs = [
  { id: 'a', clienteId: 'e1' },
  { id: 'b', clienteId: 'e2' },
  { id: 'c', clienteId: 'e1' },
]

describe('separación de datos entre empresas', () => {
  it('solo se ven las facturas de la empresa', () => {
    expect(documentosDeEmpresa('e1', docs).map(d => d.id)).toEqual(['a', 'c'])
    expect(documentosDeEmpresa('e3', docs)).toEqual([])
  })

  it('no se guarda una factura de otra empresa, ni un lote con una sola ajena', () => {
    expect(() => exigirDeEmpresa('e1', [docs[0], docs[2]])).not.toThrow()
    expect(() => exigirDeEmpresa('e1', [docs[1]])).toThrow(EmpresaEquivocadaError)
    expect(() => exigirDeEmpresa('e1', [docs[0], docs[1]])).toThrow(EmpresaEquivocadaError)
    expect(() => exigirDeEmpresa('', [docs[0]])).toThrow(EmpresaEquivocadaError)
  })

  it('no se borra ni se abre la imagen de una factura de otra empresa o inexistente', () => {
    expect(() => exigirIdDeEmpresa('e1', 'a', docs)).not.toThrow()
    expect(() => exigirIdDeEmpresa('e1', 'b', docs)).toThrow(EmpresaEquivocadaError)
    expect(() => exigirIdDeEmpresa('e1', 'zzz', docs)).toThrow(EmpresaEquivocadaError)
  })
})
