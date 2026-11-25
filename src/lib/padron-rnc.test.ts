import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import { avisoDeEstado, buscarEnPedazo, prefijoDe, type IndicePadron } from './padron-rnc'

const ACTS = ['COMERCIO AL POR MENOR', 'SERVICIOS DE CONSULTORES EN IN']
const PEDAZO = '130000001\tALFA SRL\tALFA\t0\tA\tN\n130000002\tBETA SRL\t\t1\tS\tR\n130000003\tGAMMA SRL\tGAMMA\t0\tB\t'

describe('prefijoDe', () => {
  it('elige el prefijo más largo con que empieza el RNC', () => {
    expect(prefijoDe('130123456', ['130', '1301', '13012', '131'])).toBe('13012')
    expect(prefijoDe('00112345678', ['001000', '001001', '0011'])).toBe('0011')
    expect(prefijoDe('999999999', ['130', '131'])).toBeNull()
  })
})

describe('buscarEnPedazo', () => {
  it('encuentra la primera, una del medio y la última línea', () => {
    expect(buscarEnPedazo(PEDAZO, '130000001', ACTS)).toEqual({ rnc: '130000001', razonSocial: 'ALFA SRL', nombreComercial: 'ALFA', actividad: 'COMERCIO AL POR MENOR', estado: 'ACTIVO', regimen: 'NORMAL' })
    expect(buscarEnPedazo(PEDAZO, '130000002', ACTS)).toMatchObject({ nombreComercial: '', actividad: 'SERVICIOS DE CONSULTORES EN IN', estado: 'SUSPENDIDO', regimen: 'RST' })
    expect(buscarEnPedazo(PEDAZO, '130000003', ACTS)).toMatchObject({ estado: 'DADO DE BAJA', regimen: '' })
  })

  it('no confunde un RNC con otro que lo contiene', () => {
    expect(buscarEnPedazo(PEDAZO, '30000001', ACTS)).toBeNull()
    expect(buscarEnPedazo(PEDAZO, '130000009', ACTS)).toBeNull()
  })
})

describe('avisoDeEstado', () => {
  it('activo bien; suspendido aviso; dado de baja crítico', () => {
    expect(avisoDeEstado('ACTIVO').tono).toBe('bien')
    expect(avisoDeEstado('SUSPENDIDO').tono).toBe('aviso')
    expect(avisoDeEstado('DADO DE BAJA').tono).toBe('critico')
  })
})

// El padrón generado que se publica con la aplicación.
describe('padrón publicado (public/padron-rnc)', () => {
  const dir = join(process.cwd(), 'public', 'padron-rnc')
  const indice: IndicePadron = JSON.parse(readFileSync(join(dir, 'indice.json'), 'utf8'))

  it('tiene un pedazo por prefijo, ninguno de más de 100 KB, y los prefijos no se pisan', () => {
    const archivos = readdirSync(dir).filter(f => f.endsWith('.tsv.gz'))
    expect(archivos.length).toBe(indice.prefijos.length)
    for (const f of archivos) expect(readFileSync(join(dir, f)).length).toBeLessThanOrEqual(100_000)
    for (const p of indice.prefijos) expect(indice.prefijos.filter(q => q !== p && q.startsWith(p))).toEqual([])
  })

  it('cada registro está en el pedazo que le corresponde, y suman el total', () => {
    let total = 0
    for (const p of indice.prefijos) {
      const lineas = gunzipSync(readFileSync(join(dir, `${p}.tsv.gz`))).toString('utf8').split('\n')
      total += lineas.length
      for (const l of [lineas[0], lineas[lineas.length - 1]]) {
        const rnc = l.split('\t')[0]
        expect(prefijoDe(rnc, indice.prefijos)).toBe(p)
        expect(buscarEnPedazo(lineas.join('\n'), rnc, indice.actividades)?.rnc).toBe(rnc)
      }
    }
    expect(total).toBe(indice.registros)
  })

  it('el RNC de prueba de la macro de la DGII (401007551) está y trae sus datos', () => {
    const p = prefijoDe('401007551', indice.prefijos)!
    const r = buscarEnPedazo(gunzipSync(readFileSync(join(dir, `${p}.tsv.gz`))).toString('utf8'), '401007551', indice.actividades)
    expect(r?.razonSocial.length).toBeGreaterThan(0)
    expect(r?.actividad.length).toBeGreaterThan(0)
  })
})
