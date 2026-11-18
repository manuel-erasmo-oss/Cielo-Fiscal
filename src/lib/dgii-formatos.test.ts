import { describe, expect, it } from 'vitest'
import {
  clasificacionContable,
  digitoVerificadorCorrecto,
  esConsumoBajoUmbral,
  esNotaDeCredito,
  esNotaDeDebito,
  esNcfValidoIngresos,
  loEmiteElComprador,
  esNcfValido606,
  esNcfValido607,
  generar606,
  generar607,
  linea606,
  linea607,
  separarVentas607,
  tipoNcf,
  validarCompra606,
  validarVenta607,
  validarVentaIngresos,
  type CamposDocumento,
} from './dgii-formatos'
import { CAMPOS_VACIOS } from './documentos'

// Reglas tomadas de las herramientas de envío de la DGII (ver
// docs/dgii/formatos-606-607.md). RNC con dígito verificador correcto.
const RNC_CLIENTE = '401007551'
const RNC_PROVEEDOR = '101123451'

function compra(cambios: Partial<CamposDocumento> = {}): CamposDocumento {
  return {
    ...CAMPOS_VACIOS,
    rncCedulaContraparte: RNC_PROVEEDOR,
    nombreContraparte: 'Ferretería El Sol SRL',
    tipoBienesServicios: '09',
    ncf: 'B0100000123',
    fechaComprobante: '2026-03-01',
    montoServicios: 0,
    montoBienes: 1000,
    itbisFacturado: 180,
    montoTotal: 1180,
    formaPago: '04',
    ...cambios,
  }
}

function venta(cambios: Partial<CamposDocumento> = {}): CamposDocumento {
  return {
    ...CAMPOS_VACIOS,
    rncCedulaContraparte: RNC_PROVEEDOR,
    tipoIdentificacion: '1',
    ncf: 'B0100000500',
    tipoIngreso: '1',
    fechaComprobante: '2026-03-15',
    montoFacturado: 2000,
    itbisFacturado: 360,
    montoTotal: 2360,
    cobroEfectivo: 2360,
    ...cambios,
  }
}

const errores = (p: ReturnType<typeof validarCompra606>) => p.filter(x => x.nivel === 'error').map(x => x.campo)

describe('NCF', () => {
  it('606: acepta series B, E (e-CF) y las de 19 posiciones', () => {
    for (const ncf of ['B0100000001', 'B1500000001', 'B1700000001', 'E310000000001', 'E470000000001', 'A010010010100000001']) {
      expect(esNcfValido606(ncf), ncf).toBe(true)
    }
  })

  it('606: rechaza tipos fuera de rango y longitudes incorrectas', () => {
    for (const ncf of ['B1600000001', 'B0500000001', 'B010000001', 'B01000000012', 'E3100000001', 'E350000000001', 'X0100000001', 'b0100000001', '']) {
      expect(esNcfValido606(ncf), ncf).toBe(false)
    }
  })

  it('607: acepta B hasta el tipo 16 y NO admite e-NCF ni B17', () => {
    expect(esNcfValido607('B0100000001')).toBe(true)
    expect(esNcfValido607('B1600000001')).toBe(true)
    expect(esNcfValido607('E310000000001')).toBe(false)
    expect(esNcfValido607('B1700000001')).toBe(false)
  })

  it('tipoNcf: posiciones 2-3 en serie B y en e-NCF (Guía de NCF), 10-11 en serie A', () => {
    expect(tipoNcf('B0400000001')).toBe('04')
    expect(tipoNcf('A010010010100000001')).toBe('01')
    expect(tipoNcf('E340000000001')).toBe('34')
    expect(tipoNcf(null)).toBe('')
  })
})

// Fuente: Guía Informativa de NCF (DGII, marzo 2026) y su tabla de tipos
// electrónicos (Aviso núm. 24-2019).
describe('tipos de comprobante según la Guía de NCF', () => {
  it('nota de crédito: 04 y su versión electrónica 34; nota de débito: 03 y 33', () => {
    expect(esNotaDeCredito({ ncf: 'B0400000001' })).toBe(true)
    expect(esNotaDeCredito({ ncf: 'E340000000001' })).toBe(true)
    expect(esNotaDeCredito({ ncf: 'E310000000001' })).toBe(false)
    expect(esNotaDeDebito({ ncf: 'B0300000001' })).toBe(true)
    expect(esNotaDeDebito({ ncf: 'E330000000001' })).toBe(true)
    expect(esNotaDeDebito({ ncf: 'E340000000001' })).toBe(false)
  })

  it('compras, gastos menores y pagos al exterior los emite el comprador', () => {
    for (const ncf of ['B1100000001', 'B1300000001', 'B1700000001', 'E410000000001', 'E430000000001', 'E470000000001']) {
      expect(loEmiteElComprador(ncf), ncf).toBe(true)
    }
    for (const ncf of ['B0100000001', 'B0200000001', 'E310000000001', 'E440000000001', 'E460000000001', null]) {
      expect(loEmiteElComprador(ncf), String(ncf)).toBe(false)
    }
  })

  it('ingresos: e-NCF de venta (31-34, 44-46) sí; no existe el tipo 42', () => {
    for (const ncf of ['E310000000001', 'E340000000001', 'E440000000001', 'E450000000001', 'E460000000001', 'B0100000001', 'B1500000001']) {
      expect(esNcfValidoIngresos(ncf), ncf).toBe(true)
    }
    for (const ncf of ['E420000000001', 'E350000000001', 'E480000000001', 'E41000000001']) {
      expect(esNcfValidoIngresos(ncf), ncf).toBe(false)
    }
  })
})

describe('dígito verificador', () => {
  it('RNC: pesos 7,9,8,6,5,4,3,2 módulo 11', () => {
    expect(digitoVerificadorCorrecto('401007551')).toBe(true)
    expect(digitoVerificadorCorrecto('101123451')).toBe(true) // suma 65, resto 10 → 1
    expect(digitoVerificadorCorrecto('101123456')).toBe(false)
    expect(digitoVerificadorCorrecto('130000001')).toBe(true) // resto 1 → 1
  })

  it('cédula: pesos 1,2 sumando dígitos', () => {
    expect(digitoVerificadorCorrecto('00112345673')).toBe(true) // suma 27 → 3
    expect(digitoVerificadorCorrecto('00112345678')).toBe(false)
    expect(digitoVerificadorCorrecto('00100000009')).toBe(true) // suma 1 → 9
  })

  it('null si no tiene 9 u 11 dígitos', () => {
    expect(digitoVerificadorCorrecto('12345')).toBeNull()
    expect(digitoVerificadorCorrecto('A01123451')).toBeNull()
  })
})

describe('validarCompra606', () => {
  it('una compra completa no tiene problemas', () => {
    expect(validarCompra606(compra(), RNC_CLIENTE)).toEqual([])
  })

  it('exige RNC, tipo de bienes, NCF, fecha, monto e ITBIS; la forma de pago NO', () => {
    const vacia = validarCompra606({ ...CAMPOS_VACIOS }, RNC_CLIENTE)
    expect(errores(vacia).sort()).toEqual(
      ['fechaComprobante', 'itbisFacturado', 'montoServicios', 'ncf', 'rncCedulaContraparte', 'tipoBienesServicios'].sort(),
    )
  })

  it('el total (servicios + bienes) debe ser mayor que 0, pero uno solo basta', () => {
    expect(errores(validarCompra606(compra({ montoServicios: 0, montoBienes: 0 }), RNC_CLIENTE))).toEqual(['montoServicios'])
    expect(validarCompra606(compra({ montoServicios: 500, montoBienes: null }), RNC_CLIENTE)).toEqual([])
  })

  it('ITBIS en cero es válido', () => {
    expect(validarCompra606(compra({ itbisFacturado: 0 }), RNC_CLIENTE)).toEqual([])
  })

  it('gastos menores y pagos al exterior electrónicos (43, 47) llevan el RNC del cliente, igual que 13 y 17', () => {
    for (const ncf of ['B1300000001', 'E430000000001', 'E470000000001']) {
      expect(errores(validarCompra606(compra({ ncf, montoServicios: 1000, montoBienes: 0 }), RNC_CLIENTE)), ncf).toEqual(['rncCedulaContraparte'])
      expect(validarCompra606(compra({ ncf, rncCedulaContraparte: RNC_CLIENTE, montoServicios: 1000, montoBienes: 0 }), RNC_CLIENTE), ncf).toEqual([])
    }
  })

  it('factura de consumo (02 o 32): se acepta, con aviso de que no sustenta ITBIS ni costos', () => {
    for (const ncf of ['B0200000001', 'E320000000001']) {
      const p = validarCompra606(compra({ ncf }), RNC_CLIENTE)
      expect(p.map(x => [x.campo, x.nivel]), ncf).toEqual([['ncf', 'aviso']])
      expect(p[0].mensaje).toMatch(/consumo/)
    }
  })

  it('pagos al exterior con monto en bienes: aviso (solo aplica a servicios)', () => {
    const p = validarCompra606(compra({ ncf: 'E470000000001', rncCedulaContraparte: RNC_CLIENTE }), RNC_CLIENTE)
    expect(p.map(x => [x.campo, x.nivel])).toEqual([['montoBienes', 'aviso']])
  })

  it('comprobante no electrónico después del último plazo de la Ley 32-23: aviso, no error', () => {
    expect(validarCompra606(compra({ fechaComprobante: '2026-05-16' }), RNC_CLIENTE)).toEqual([])
    const tarde = validarCompra606(compra({ fechaComprobante: '2026-06-01' }), RNC_CLIENTE)
    expect(tarde.map(x => [x.campo, x.nivel])).toEqual([['ncf', 'aviso']])
    expect(tarde[0].mensaje).toMatch(/electrónico/)
    expect(validarCompra606(compra({ ncf: 'E310000000001', fechaComprobante: '2026-06-01' }), RNC_CLIENTE)).toEqual([])
  })

  it('con retenciones exige fecha de pago', () => {
    expect(errores(validarCompra606(compra({ itbisRetenido: 54 }), RNC_CLIENTE))).toEqual(['fechaPago'])
    expect(errores(validarCompra606(compra({ tipoRetencionISR: '02', montoRetencionRenta: 100 }), RNC_CLIENTE))).toEqual(['fechaPago'])
    expect(validarCompra606(compra({ itbisRetenido: 54, fechaPago: '2026-03-20' }), RNC_CLIENTE)).toEqual([])
  })

  it('gastos menores (13) y pagos al exterior (17) van con el RNC del propio cliente', () => {
    expect(errores(validarCompra606(compra({ ncf: 'B1300000001' }), RNC_CLIENTE))).toEqual(['rncCedulaContraparte'])
    expect(validarCompra606(compra({ ncf: 'B1300000001', rncCedulaContraparte: RNC_CLIENTE }), RNC_CLIENTE)).toEqual([])
    expect(errores(validarCompra606(compra({ ncf: 'B1700000001' }), RNC_CLIENTE))).toEqual(['rncCedulaContraparte'])
  })

  it('rechaza NCF mal formado, códigos fuera de catálogo y montos negativos', () => {
    expect(errores(validarCompra606(compra({ ncf: 'B01123' }), RNC_CLIENTE))).toEqual(['ncf'])
    expect(errores(validarCompra606(compra({ ncfModificado: 'XX' }), RNC_CLIENTE))).toEqual(['ncfModificado'])
    expect(errores(validarCompra606(compra({ tipoBienesServicios: '12' }), RNC_CLIENTE))).toEqual(['tipoBienesServicios'])
    expect(errores(validarCompra606(compra({ formaPago: '08' }), RNC_CLIENTE))).toEqual(['formaPago'])
    expect(errores(validarCompra606(compra({ propinaLegal: -1 }), RNC_CLIENTE))).toEqual(['propinaLegal'])
  })

  it('un dígito verificador que no cuadra es aviso, no error', () => {
    const p = validarCompra606(compra({ rncCedulaContraparte: '101123456' }), RNC_CLIENTE)
    expect(p).toHaveLength(1)
    expect(p[0].nivel).toBe('aviso')
  })
})

describe('clasificacionContable', () => {
  it('09 es costo, 10 es activo y el resto gasto', () => {
    expect(clasificacionContable('09')).toBe('Costo')
    expect(clasificacionContable('10')).toBe('Activo')
    for (const c of ['01', '02', '03', '04', '05', '06', '07', '08', '11']) expect(clasificacionContable(c)).toBe('Gasto')
    expect(clasificacionContable(null)).toBeNull()
  })
})

describe('validarVentaIngresos (reporte interno; el 607 ya no se envía)', () => {
  it('una venta completa no tiene problemas', () => {
    expect(validarVentaIngresos(venta())).toEqual([])
  })

  it('solo exige NCF, fecha, monto e ITBIS', () => {
    expect(errores(validarVentaIngresos({ ...CAMPOS_VACIOS })).sort()).toEqual(['fechaComprobante', 'itbisFacturado', 'montoFacturado', 'ncf'])
    const minima = venta({ rncCedulaContraparte: null, tipoIdentificacion: null, tipoIngreso: null, cobroEfectivo: null, montoTotal: null })
    expect(validarVentaIngresos(minima)).toEqual([])
  })

  it('admite e-NCF y series B hasta el tipo 17', () => {
    for (const ncf of ['E310000000001', 'E320000000001', 'B0200000001', 'B1600000001']) {
      expect(validarVentaIngresos(venta({ ncf })), ncf).toEqual([])
    }
    expect(errores(validarVentaIngresos(venta({ ncf: 'B01123' })))).toEqual(['ncf'])
  })

  it('admite exportación electrónica (46) y rechaza los e-CF que emite el comprador', () => {
    expect(validarVentaIngresos(venta({ ncf: 'E460000000001' }))).toEqual([])
    for (const ncf of ['E410000000001', 'E430000000001', 'E470000000001']) {
      const p = validarVentaIngresos(venta({ ncf }))
      expect(errores(p), ncf).toEqual(['ncf'])
      expect(p[0].mensaje).toMatch(/comprador/)
    }
  })

  it('retenciones sin fecha de retención: no bloquea', () => {
    expect(validarVentaIngresos(venta({ itbisRetenidoTerceros: 108, retencionRentaTerceros: 200 }))).toEqual([])
  })

  it('si se da la identificación, debe tener sentido', () => {
    expect(errores(validarVentaIngresos(venta({ rncCedulaContraparte: '12345', tipoIdentificacion: null })))).toEqual(['rncCedulaContraparte'])
    expect(errores(validarVentaIngresos(venta({ tipoIdentificacion: '2' })))).toEqual(['rncCedulaContraparte'])
    expect(validarVentaIngresos(venta({ tipoIdentificacion: '3', rncCedulaContraparte: 'AB123456' }))).toEqual([])
    expect(validarVentaIngresos(venta({ tipoIdentificacion: null, rncCedulaContraparte: '00112345673' }))).toEqual([])
  })

  it('sigue rechazando montos incoherentes y códigos fuera de catálogo', () => {
    expect(errores(validarVentaIngresos(venta({ montoFacturado: 100, itbisFacturado: 360 })))).toEqual(['montoFacturado'])
    expect(errores(validarVentaIngresos(venta({ tipoIngreso: '9' })))).toEqual(['tipoIngreso'])
    expect(errores(validarVentaIngresos(venta({ cobroEfectivo: -5 })))).toEqual(['cobroEfectivo'])
  })

  it('avisa (sin bloquear) si lo cobrado no da el total', () => {
    expect(validarVentaIngresos(venta({ cobroEfectivo: 2000 })).map(x => x.nivel)).toEqual(['aviso'])
  })
})

describe('validarVenta607 (formato en desuso; la aplicación ya no lo usa)', () => {
  it('una venta completa no tiene problemas', () => {
    expect(validarVenta607(venta(), RNC_CLIENTE)).toEqual([])
  })

  it('exige identificación, tipo de ingreso y al menos una forma de cobro', () => {
    const p = validarVenta607(venta({ rncCedulaContraparte: null, tipoIdentificacion: null, tipoIngreso: null, cobroEfectivo: null }), RNC_CLIENTE)
    expect(errores(p).sort()).toEqual(['cobroEfectivo', 'rncCedulaContraparte', 'tipoIdentificacion', 'tipoIngreso'].sort())
  })

  it('la identificación debe coincidir con su tipo; el pasaporte admite letras', () => {
    expect(errores(validarVenta607(venta({ tipoIdentificacion: '2' }), RNC_CLIENTE))).toEqual(['rncCedulaContraparte'])
    expect(validarVenta607(venta({ tipoIdentificacion: '3', rncCedulaContraparte: 'AB123456' }), RNC_CLIENTE)).toEqual([])
    expect(errores(validarVenta607(venta({ tipoIdentificacion: '2', rncCedulaContraparte: '00000000000' }), RNC_CLIENTE))).toEqual(['rncCedulaContraparte'])
  })

  it('una nota de crédito no necesita forma de cobro', () => {
    expect(validarVenta607(venta({ ncf: 'B0400000001', ncfModificado: 'B0100000500', cobroEfectivo: null }), RNC_CLIENTE)).toEqual([])
  })

  it('el monto facturado no puede ser menor que el ITBIS', () => {
    expect(errores(validarVenta607(venta({ montoFacturado: 100, itbisFacturado: 360 }), RNC_CLIENTE))).toEqual(['montoFacturado'])
  })

  it('con retenciones de terceros exige fecha de retención', () => {
    expect(errores(validarVenta607(venta({ itbisRetenidoTerceros: 108 }), RNC_CLIENTE))).toEqual(['fechaRetencion'])
  })

  it('no admite e-NCF (herramienta 607 versión 2023.1.1)', () => {
    expect(errores(validarVenta607(venta({ ncf: 'E310000000001' }), RNC_CLIENTE))).toEqual(['ncf'])
  })

  it('factura de consumo bajo el umbral: solo NCF, fecha, monto e ITBIS', () => {
    const consumo = venta({ ncf: 'B0200000001', rncCedulaContraparte: null, tipoIdentificacion: null, tipoIngreso: null, cobroEfectivo: null })
    expect(esConsumoBajoUmbral(consumo)).toBe(true)
    expect(validarVenta607(consumo, RNC_CLIENTE)).toEqual([])
    expect(esConsumoBajoUmbral(venta({ ncf: 'B0200000001', montoFacturado: 250_000 }))).toBe(false)
    expect(esConsumoBajoUmbral(venta())).toBe(false)
  })

  it('nota de crédito sobre factura de consumo menor puede ir sin identificación', () => {
    const nc = venta({ ncf: 'B0400000002', ncfModificado: 'B0200000001', rncCedulaContraparte: null, tipoIdentificacion: null, cobroEfectivo: null })
    expect(validarVenta607(nc, RNC_CLIENTE)).toEqual([])
  })

  it('registro único de ingresos (12) va con el RNC del propio cliente', () => {
    expect(errores(validarVenta607(venta({ ncf: 'B1200000001' }), RNC_CLIENTE))).toEqual(['rncCedulaContraparte'])
    expect(validarVenta607(venta({ ncf: 'B1200000001', rncCedulaContraparte: RNC_CLIENTE }), RNC_CLIENTE)).toEqual([])
  })

  it('avisa (sin bloquear) si lo cobrado no da el total', () => {
    const p = validarVenta607(venta({ cobroEfectivo: 2000 }), RNC_CLIENTE)
    expect(p.map(x => x.nivel)).toEqual(['aviso'])
  })
})

describe('archivo 606', () => {
  it('línea de detalle: 23 campos en el orden de la herramienta', () => {
    const linea = linea606(compra({
      fechaPago: '2026-03-20', montoServicios: 500, itbisFacturado: 270, itbisRetenido: 81,
      itbisLlevadoAlCosto: 20, tipoRetencionISR: '02', montoRetencionRenta: 50, propinaLegal: 10,
    }))
    expect(linea).toBe('101123451|1|09|B0100000123||20260301|20260320|500.00|1000.00|1500.00|270.00|81.00||20.00|250.00||02|50.00||||10.00|04')
    expect(linea.split('|')).toHaveLength(23)
  })

  it('cédula → tipo Id 2; campos opcionales vacíos', () => {
    expect(linea606(compra({ rncCedulaContraparte: '00112345673', montoServicios: null }))).toBe(
      '00112345673|2|09|B0100000123||20260301|||1000.00|1000.00|180.00||||180.00||||||||04',
    )
  })

  it('archivo completo: encabezado, CRLF, sin salto final, nombre y totales', () => {
    const nota = compra({ ncf: 'B0400000007', ncfModificado: 'B0100000123', montoBienes: 100, itbisFacturado: 18 })
    const archivo = generar606(RNC_CLIENTE, '202603', [compra(), nota])
    expect(archivo.nombreArchivo).toBe('DGII_F_606_401007551_202603.TXT')
    expect(archivo.contenido).toBe([
      '606|401007551|202603|2',
      '101123451|1|09|B0100000123||20260301||0.00|1000.00|1000.00|180.00||||180.00||||||||04',
      '101123451|1|09|B0400000007|B0100000123|20260301||0.00|100.00|100.00|18.00||||18.00||||||||04',
    ].join('\r\n'))
    expect(archivo.contenido.endsWith('\n')).toBe(false)
    for (const linea of archivo.contenido.split('\r\n').slice(1)) expect(linea.split('|')).toHaveLength(23)
    expect(archivo.registros).toBe(2)
    // La nota de crédito resta.
    expect(archivo.totalMontoFacturado).toBe(900)
    expect(archivo.totalItbisFacturado).toBe(162)
  })

  it('una nota de crédito electrónica (E34) resta en los totales, igual que la B04', () => {
    const nota = compra({ ncf: 'E340000000002', ncfModificado: 'E310000000001', montoBienes: 100, itbisFacturado: 18 })
    const archivo = generar606(RNC_CLIENTE, '202603', [compra({ ncf: 'E310000000001' }), nota])
    expect(archivo.totalMontoFacturado).toBe(900)
    expect(archivo.totalItbisFacturado).toBe(162)
  })

  it('compra sin forma de pago: válida al registrar, pero el archivo exige una por defecto', () => {
    const sinForma = compra({ formaPago: null })
    expect(validarCompra606(sinForma, RNC_CLIENTE)).toEqual([])
    expect(() => generar606(RNC_CLIENTE, '202603', [sinForma])).toThrow(/forma de pago/)
    expect(() => generar606(RNC_CLIENTE, '202603', [sinForma], { formaPagoPorDefecto: '99' })).toThrow()
    const archivo = generar606(RNC_CLIENTE, '202603', [sinForma, compra({ ncf: 'B0100000124' })], { formaPagoPorDefecto: '02' })
    const [, primera, segunda] = archivo.contenido.split('\r\n')
    expect(primera.endsWith('|02')).toBe(true)  // usa la forma de pago por defecto
    expect(segunda.endsWith('|04')).toBe(true)  // conserva la suya
  })

  it('rechaza encabezados inválidos', () => {
    expect(() => generar606(RNC_CLIENTE, '202603', [])).toThrow()
    expect(() => generar606('123', '202603', [compra()])).toThrow()
    expect(() => generar606(RNC_CLIENTE, '2026-03', [compra()])).toThrow()
    expect(() => generar606(RNC_CLIENTE, '201804', [compra()])).toThrow()
    expect(() => generar606(RNC_CLIENTE, '202613', [compra()])).toThrow()
  })
})

describe('archivo 607', () => {
  it('línea de detalle: 23 campos en el orden de la herramienta', () => {
    const linea = linea607(venta({
      fechaRetencion: '2026-03-28', itbisRetenidoTerceros: 108, retencionRentaTerceros: 200,
      cobroEfectivo: 1000, cobroTarjeta: 1360,
    }))
    expect(linea).toBe('101123451|1|B0100000500||1|20260315|20260328|2000.00|360.00|108.00||200.00|||||1000.00||1360.00||||')
    expect(linea.split('|')).toHaveLength(23)
  })

  it('las facturas de consumo menores se separan en un resumen', () => {
    const consumo = (ncf: string, monto: number) => venta({ ncf, montoFacturado: monto, itbisFacturado: monto * 0.18 })
    const { detalladas, resumenConsumo } = separarVentas607([
      venta(), consumo('B0200000001', 1000), consumo('B0200000002', 500), consumo('B0200000003', 300_000),
    ])
    expect(detalladas.map(d => d.ncf)).toEqual(['B0100000500', 'B0200000003'])
    expect(resumenConsumo).toEqual({ cantidad: 2, montoFacturado: 1500, itbisFacturado: 270 })
  })

  it('archivo completo', () => {
    const archivo = generar607(RNC_CLIENTE, '202603', [venta()])
    expect(archivo.nombreArchivo).toBe('DGII_F_607_401007551_202603.txt')
    expect(archivo.contenido).toBe(
      '607|401007551|202603|1\r\n101123451|1|B0100000500||1|20260315||2000.00|360.00||||||||2360.00||||||',
    )
    expect(archivo.totalMontoFacturado).toBe(2000)
  })
})
