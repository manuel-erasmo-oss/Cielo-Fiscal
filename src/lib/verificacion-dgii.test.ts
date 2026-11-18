import { describe, expect, it } from 'vitest'
import { problemasDeRevision } from './documentos'
import { CAMPOS_VACIOS } from './documentos'
import {
  RespuestaDGIIDesconocida,
  esUrlConsultaDGII,
  interpretarRespuestaDGII,
  normalizarEstado,
  problemaVerificacion,
  requiereVerificacionHumana,
} from './verificacion-dgii'

// Misma estructura que la página real de la DGII (medida el 2026-11-18), con
// datos inventados.
const fila = (th: string, td: string) => `<tr> <th class="text-left">${th}</th> <td>${td}</td> </tr>`
const pagina = (filas: string) =>
  `<!DOCTYPE html><html><head><title>Consultas Factura Electrónica - Verificaci&#xF3;n e-NCF</title><script>var x = "<th>Estado</th><td>Falso</td>";</script></head>` +
  `<body><div class="col-xs-12 table-container"><table class="table table-striped">${filas}</table></div></body></html>`
const ACEPTADA = pagina(
  fila('RNC Emisor', '101123451') + fila('Raz&#xF3;n social emisor', 'FERRETERIA EL SOL, SRL') +
  fila('RNC Comprador', '401007551') + fila('Raz&#xF3;n social comprador', ' COMERCIAL QUISQUEYA SRL ') +
  '<tr> <th>e-NCF</th> <td>E310000007629</td> </tr>' + '<tr> <th>Fecha de Emisi&#xF3;n</th> <td>01-07-2026</td> </tr>' +
  '<tr> <th> Total de ITBIS </th> <td> 372.24 </td> </tr>' + '<tr> <th>Monto Total</th> <td>2,440.24</td> </tr>' +
  '<tr> <th>Estado</th> <td>Aceptado</td> </tr>',
)
// Una página cuyo único "Estado" está dentro de un script no es una respuesta.
const SOLO_SCRIPT = pagina('')
const NO_ENCONTRADA = pagina('<tr class="text-danger" style="font-weight:bold;"> <td colspan="2">No fue encontrada la factura (e-CF).</td> </tr>')

describe('esUrlConsultaDGII', () => {
  it('acepta solo la consulta de la DGII por https', () => {
    expect(esUrlConsultaDGII('https://ecf.dgii.gov.do/eCF/ConsultaTimbre?RncEmisor=1&ENCF=E310000000001')).toBe(true)
    expect(esUrlConsultaDGII('https://ecf.dgii.gov.do/ecf/consultatimbre?x=1')).toBe(true)
    expect(esUrlConsultaDGII('https://fc.dgii.gov.do/eCF/ConsultaTimbreFC?RncEmisor=1')).toBe(true)
  })

  it('rechaza otros hosts, http, puertos, credenciales y otras rutas', () => {
    for (const url of [
      'http://ecf.dgii.gov.do/eCF/ConsultaTimbre?x=1',
      'https://ecf.dgii.gov.do.ejemplo.com/eCF/ConsultaTimbre',
      'https://ejemplo.com/eCF/ConsultaTimbre?u=https://ecf.dgii.gov.do',
      'https://ecf.dgii.gov.do:8443/eCF/ConsultaTimbre',
      'https://usuario:clave@ecf.dgii.gov.do/eCF/ConsultaTimbre',
      'https://ecf.dgii.gov.do/eCF/OtraCosa',
      'https://dgii.gov.do/eCF/ConsultaTimbre',
      'no es una url',
    ]) {
      expect(esUrlConsultaDGII(url), url).toBe(false)
    }
  })
})

describe('interpretarRespuestaDGII', () => {
  it('lee la tabla de una factura encontrada (ignora lo que haya en los scripts)', () => {
    expect(interpretarRespuestaDGII(ACEPTADA)).toEqual({
      estado: 'aceptado',
      texto: 'Aceptado',
      datos: {
        rncEmisor: '101123451', razonSocialEmisor: 'FERRETERIA EL SOL, SRL',
        rncComprador: '401007551', razonSocialComprador: 'COMERCIAL QUISQUEYA SRL',
        encf: 'E310000007629', totalItbis: 372.24, montoTotal: 2440.24,
      },
    })
  })

  it('reconoce la respuesta de factura no encontrada', () => {
    expect(interpretarRespuestaDGII(NO_ENCONTRADA)).toMatchObject({ estado: 'no_encontrado', datos: null })
  })

  it('una página que no se reconoce lanza en vez de inventar un estado', () => {
    expect(() => interpretarRespuestaDGII('<html><body>Mantenimiento</body></html>')).toThrow(RespuestaDGIIDesconocida)
    expect(() => interpretarRespuestaDGII(SOLO_SCRIPT)).toThrow(RespuestaDGIIDesconocida)
  })

  it('normaliza los estados de la NG 01-2020', () => {
    expect(normalizarEstado('Aceptado')).toBe('aceptado')
    expect(normalizarEstado('Aceptado Condicional')).toBe('aceptado_condicional')
    expect(normalizarEstado(' RECHAZADO ')).toBe('rechazado')
    expect(normalizarEstado('En Proceso')).toBe('en_proceso')
    expect(normalizarEstado('Anulado')).toBe('otro')
  })
})

describe('problemaVerificacion', () => {
  const v = (estado: Parameters<typeof normalizarEstado>[0]) => ({ estado: normalizarEstado(estado), texto: estado, consultadoEn: '2026-11-18T12:00:00Z' })

  it('aceptado (también condicional): sin problema', () => {
    expect(problemaVerificacion({ ncf: 'E310000000001', verificacionDGII: v('Aceptado') })).toBeNull()
    expect(problemaVerificacion({ ncf: 'E310000000001', verificacionDGII: v('Aceptado Condicional') })).toBeNull()
  })

  it('rechazado y no encontrado: error; en proceso y desconocido: aviso', () => {
    expect(problemaVerificacion({ ncf: 'E310000000001', verificacionDGII: v('Rechazado') })?.nivel).toBe('error')
    expect(problemaVerificacion({ ncf: 'E310000000001', verificacionDGII: { estado: 'no_encontrado', texto: 'x', consultadoEn: '' } })?.nivel).toBe('error')
    expect(problemaVerificacion({ ncf: 'E310000000001', verificacionDGII: v('En Proceso') })?.nivel).toBe('aviso')
    expect(problemaVerificacion({ ncf: 'E310000000001', verificacionDGII: v('Anulado') })?.nivel).toBe('aviso')
  })

  it('si el NCF de la factura no es el del QR verificado: error (la verificación no lo cubre)', () => {
    const qrUrl = 'https://ecf.dgii.gov.do/eCF/ConsultaTimbre?RncEmisor=101123451&encf=E310000007629&MontoTotal=1'
    expect(problemaVerificacion({ ncf: 'E310000007629', qrUrl, verificacionDGII: v('Aceptado') })).toBeNull()
    expect(problemaVerificacion({ ncf: 'e31 0000007629', qrUrl, verificacionDGII: v('Aceptado') })).toBeNull()
    const p = problemaVerificacion({ ncf: 'E310000007620', qrUrl, verificacionDGII: v('Aceptado') })
    expect(p).toMatchObject({ nivel: 'error', campo: 'ncf' })
    expect(p?.mensaje).toMatch(/E310000007629/)
  })

  it('sin verificar: aviso para e-CF (QR ilegible); serie B y sin NCF: nada', () => {
    expect(problemaVerificacion({ ncf: 'E310000000001' })).toMatchObject({ nivel: 'aviso', campo: 'ncf' })
    expect(problemaVerificacion({ ncf: 'E310000000001' })?.mensaje).toMatch(/a mano/)
    expect(problemaVerificacion({ ncf: 'B0100000001' })).toBeNull()
    expect(problemaVerificacion({ ncf: null })).toBeNull()
  })

  it('requiere verificación humana: e-CF sin verificar, en proceso o desconocido; no la serie B', () => {
    expect(requiereVerificacionHumana({ ncf: 'E310000000001' })).toBe(true)
    expect(requiereVerificacionHumana({ ncf: 'E310000000001', verificacionDGII: v('En Proceso') })).toBe(true)
    expect(requiereVerificacionHumana({ ncf: 'E310000000001', verificacionDGII: v('Anulado') })).toBe(true)
    expect(requiereVerificacionHumana({ ncf: 'E310000000001', verificacionDGII: v('Aceptado') })).toBe(false)
    expect(requiereVerificacionHumana({ ncf: 'E310000000001', verificacionDGII: v('Rechazado') })).toBe(false) // es error, no revisión
    expect(requiereVerificacionHumana({ ncf: 'B0100000001' })).toBe(false)
  })

  it('una factura rechazada no puede marcarse revisada ni entrar a un reporte', () => {
    const compra = {
      ...CAMPOS_VACIOS, rncCedulaContraparte: '101123451', tipoBienesServicios: '09', ncf: 'E310000000001',
      fechaComprobante: '2026-03-01', montoServicios: 0, montoBienes: 1000, itbisFacturado: 180,
    }
    expect(problemasDeRevision('compra', { ...compra, verificacionDGII: v('Aceptado') }, '401007551')).toEqual([])
    const rechazada = problemasDeRevision('compra', { ...compra, verificacionDGII: v('Rechazado') }, '401007551')
    expect(rechazada.filter(p => p.nivel === 'error').map(p => p.campo)).toEqual(['ncf'])
  })
})
