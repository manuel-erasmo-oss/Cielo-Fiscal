import { describe, expect, it } from 'vitest'
import { CAMPOS_VACIOS } from './documentos'
import {
  arcosDona, composicionCompras, cuentaRegresiva, marcasEje, mesesConFacturas, montoRDCompacto, urgenciaDe, montoCompacto, obligacionesDelMes, periodo606EnCurso, periodosDisponibles,
  principalesProveedores, proximosVencimientos, resumenPeriodo, semanasDelMes, serieMensual, sumarMeses,
  ultimosPeriodos, variacion,
} from './dashboard'
import type { DocumentoFiscal } from '@/types'

let n = 0
function doc(p: Partial<DocumentoFiscal>): DocumentoFiscal {
  n++
  return {
    ...CAMPOS_VACIOS,
    id: `d${n}`, contadorUid: 'local', clienteId: 'e1', tipo: 'compra', origen: 'manual',
    confianzaOCR: null, camposIncompletos: [], estadoRevision: 'revisado',
    creadoEn: '2026-10-01T00:00:00Z', actualizadoEn: '2026-10-01T00:00:00Z',
    ...p,
  } as DocumentoFiscal
}

const compra = (fecha: string, servicios: number, itbis: number, extra: Partial<DocumentoFiscal> = {}) =>
  doc({ tipo: 'compra', fechaComprobante: fecha, montoServicios: servicios, montoBienes: null, itbisFacturado: itbis, ncf: 'B0100000001', ...extra })
const venta = (fecha: string, monto: number, itbis: number, extra: Partial<DocumentoFiscal> = {}) =>
  doc({ tipo: 'venta', fechaComprobante: fecha, montoFacturado: monto, itbisFacturado: itbis, ncf: 'B0100000002', ...extra })

describe('períodos', () => {
  it('suma meses cruzando el año', () => {
    expect(sumarMeses('2026-01', -1)).toBe('2025-12')
    expect(sumarMeses('2026-12', 1)).toBe('2027-01')
    expect(ultimosPeriodos('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })

  it('lista los períodos con facturas más el que se prepara, del más nuevo al más viejo', () => {
    const docs = [compra('2026-08-03', 1, 0), compra('2026-09-10', 1, 0), venta('2026-09-11', 1, 0), compra('2026-07-01', 1, 0, { estadoRevision: 'descartado' })]
    expect(periodosDisponibles(docs, '2026-10')).toEqual(['2026-10', '2026-09', '2026-08'])
  })
})

describe('resumen del período', () => {
  const docs = [
    compra('2026-10-05', 1000, 180),
    compra('2026-10-06', 500, 90, { montoBienes: 500 }), // servicios + bienes = 1000
    compra('2026-10-07', 200, 36, { ncf: 'E340000000001' }), // nota de crédito: resta
    venta('2026-10-08', 3000, 540),
    venta('2026-10-09', 100, 18, { estadoRevision: 'descartado' }), // no cuenta
    compra('2026-09-30', 9999, 0), // otro mes
  ]

  it('suma compras y ventas sin impuestos; la nota de crédito resta', () => {
    const r = resumenPeriodo(docs, '2026-10')
    expect(r.compras).toEqual({ cantidad: 3, monto: 1800, itbis: 234 })
    expect(r.ventas).toEqual({ cantidad: 1, monto: 3000, itbis: 540 })
    expect(r.diferenciaItbis).toBe(306)
  })

  it('cuenta los estados: rechazada primero, luego revisada, verificar y por revisar', () => {
    const del = [
      compra('2026-10-01', 1, 0),
      compra('2026-10-01', 1, 0, { estadoRevision: 'pendiente_revision' }),
      compra('2026-10-01', 1, 0, { estadoRevision: 'pendiente_revision', ncf: 'E310000000001' }), // e-CF sin QR
      compra('2026-10-01', 1, 0, { estadoRevision: 'pendiente_revision', verificacionDGII: { estado: 'rechazado', texto: 'Rechazado', consultadoEn: 'x' } }),
    ]
    expect(resumenPeriodo(del, '2026-10').estado).toEqual({ total: 4, revisadas: 1, porRevisar: 1, porVerificar: 1, rechazadas: 1, listo: 25 })
    expect(resumenPeriodo([], '2026-10').estado.listo).toBeNull()
  })

  it('variación contra el mes anterior', () => {
    expect(variacion(150, 100)).toBe(50)
    expect(variacion(50, 100)).toBe(-50)
    expect(variacion(10, 0)).toBeNull()
  })

  it('serie de los últimos meses, con ceros donde no hay facturas', () => {
    expect(serieMensual(docs, '2026-10', 3).map(({ periodo, compras, ventas }) => ({ periodo, compras, ventas }))).toEqual([
      { periodo: '2026-08', compras: 0, ventas: 0 },
      { periodo: '2026-09', compras: 9999, ventas: 0 },
      { periodo: '2026-10', compras: 1800, ventas: 3000 },
    ])
    // El ITBIS de cada mes sale del mismo resumen (la nota de crédito resta).
    const oct = serieMensual(docs, '2026-10', 1)[0]
    const r = resumenPeriodo(docs, '2026-10')
    expect([oct.itbisCompras, oct.itbisVentas]).toEqual([r.compras.itbis, r.ventas.itbis])
  })
})

describe('composición y proveedores', () => {
  it('reparte las compras en costo, gasto, activo y sin clasificar, en orden fijo', () => {
    const docs = [
      compra('2026-10-01', 100, 0, { tipoBienesServicios: '09' }),
      compra('2026-10-01', 300, 0, { tipoBienesServicios: '02' }),
      compra('2026-10-01', 50, 0, { tipoBienesServicios: '10' }),
      compra('2026-10-01', 25, 0),
      venta('2026-10-01', 999, 0),
    ]
    expect(composicionCompras(docs, '2026-10').map(c => [c.parte, c.monto, c.cantidad])).toEqual([
      ['Costo', 100, 1], ['Gasto', 300, 1], ['Activo', 50, 1], ['Sin clasificar', 25, 1],
    ])
  })

  it('agrupa por RNC del proveedor y junta el resto en "Otros"', () => {
    const docs = [
      compra('2026-10-01', 100, 0, { rncCedulaContraparte: '101', nombreContraparte: 'Uno' }),
      compra('2026-10-02', 100, 0, { rncCedulaContraparte: '101', nombreContraparte: 'Uno' }),
      compra('2026-10-01', 150, 0, { rncCedulaContraparte: '102', nombreContraparte: 'Dos' }),
      compra('2026-10-01', 10, 0, { rncCedulaContraparte: '103', nombreContraparte: 'Tres' }),
      compra('2026-10-01', 5, 0, { rncCedulaContraparte: '104', nombreContraparte: 'Cuatro' }),
    ]
    const top = principalesProveedores(docs, '2026-10', 2)
    expect(top.map(p => [p.nombre, p.monto, p.cantidad])).toEqual([['Uno', 200, 2], ['Dos', 150, 1], ['Otros (2)', 15, 2]])
  })
})

describe('vencimientos', () => {
  it('el 18 de noviembre: IR-17 y 606 de octubre ya pasaron, IT-1 de octubre vence el 20', () => {
    const v = proximosVencimientos('2026-11-18')
    expect(v.map(x => [x.clave, x.periodo, x.fecha, x.faltan])).toEqual([
      ['IT-1', '2026-10', '2026-11-20', 2],
      ['IR-17', '2026-11', '2026-12-10', 22],
      ['606', '2026-11', '2026-12-15', 27],
    ])
    expect(periodo606EnCurso('2026-11-18')).toBe('2026-11')
  })

  it('el día del vencimiento todavía cuenta (faltan 0) y enero mira a diciembre', () => {
    const v = proximosVencimientos('2027-01-10')
    expect(v.find(x => x.clave === 'IR-17')).toMatchObject({ periodo: '2026-12', fecha: '2027-01-10', faltan: 0 })
    expect(periodo606EnCurso('2027-01-10')).toBe('2026-12')
  })
})

describe('calendario fiscal', () => {
  it('noviembre 2026: IR-17, 606 e IT-1 de octubre, con días que faltan o pasaron', () => {
    const o = obligacionesDelMes('2026-11', '2026-11-18')
    expect(o.map(x => [x.clave, x.periodo, x.fecha, x.faltan, x.finDeSemana])).toEqual([
      ['IR-17', '2026-10', '2026-11-10', -8, false],
      ['606', '2026-10', '2026-11-15', -3, true], // domingo
      ['IT-1', '2026-10', '2026-11-20', 2, false],
    ])
  })

  it('enero mira al período de diciembre del año anterior', () => {
    expect(obligacionesDelMes('2027-01', '2026-12-31').map(x => x.periodo)).toEqual(['2026-12', '2026-12', '2026-12'])
  })

  it('semanas de lunes a domingo: noviembre 2026 empieza en domingo', () => {
    const s = semanasDelMes('2026-11')
    expect(s[0]).toEqual([null, null, null, null, null, null, '2026-11-01'])
    expect(s.length).toBe(6)
    expect(s[5][0]).toBe('2026-11-30')
    expect(s.flat().filter(Boolean).length).toBe(30)
    expect(semanasDelMes('2027-02').flat().filter(Boolean).length).toBe(28)
  })
})

describe('ejes y montos compactos', () => {
  it('marcas redondas', () => {
    expect(marcasEje(0)).toEqual([0])
    expect(marcasEje(3200)).toEqual([0, 1000, 2000, 3000, 4000])
    expect(marcasEje(95_000)).toEqual([0, 25_000, 50_000, 75_000, 100_000])
  })

  it('montos compactos', () => {
    expect(montoCompacto(950)).toBe('950')
    expect(montoCompacto(1500)).toBe('1.5K')
    expect(montoCompacto(12_500)).toBe('13K')
    expect(montoCompacto(1_250_000)).toBe('1.3M')
    expect(montoCompacto(-2000)).toBe('-2K')
  })
})

describe('piezas del dashboard rediseñado', () => {
  it('serie de 3 y 12 meses que termina en el período elegido', () => {
    const docs = [compra('2026-10-05', 1000, 180), venta('2026-01-10', 500, 90), compra('2025-11-30', 300, 54)]
    const tres = serieMensual(docs, '2026-10', 3)
    expect(tres.map(p => p.periodo)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(tres[2].compras).toBe(1000)
    const doce = serieMensual(docs, '2026-10', 12)
    expect(doce).toHaveLength(12)
    expect(doce[0].periodo).toBe('2025-11')
    expect(doce[0].compras).toBe(300)
    expect(doce.find(p => p.periodo === '2026-01')!.ventas).toBe(500)
  })

  it('cuenta los meses con facturas, sin las descartadas', () => {
    const docs = [compra('2026-10-05', 1, 0), compra('2026-10-09', 1, 0), venta('2026-09-01', 1, 0), compra('2026-08-01', 1, 0, { estadoRevision: 'descartado' })]
    expect(mesesConFacturas(docs)).toBe(2)
    expect(mesesConFacturas([])).toBe(0)
  })

  it('tramos de la dona: proporcionales, en orden, y nada para ceros o negativos', () => {
    expect(arcosDona([1, 3])).toEqual([{ inicio: 0, fin: 0.25 }, { inicio: 0.25, fin: 1 }])
    const a = arcosDona([2, 0, -5, 2])
    expect(a[1].inicio).toBe(a[1].fin)
    expect(a[2].inicio).toBe(a[2].fin)
    expect(a[3]).toEqual({ inicio: 0.5, fin: 1 })
    expect(arcosDona([0, 0])).toEqual([{ inicio: 0, fin: 0 }, { inicio: 0, fin: 0 }])
  })

  it('texto y urgencia de una obligación: nunca dice "Cumplida"', () => {
    expect(cuentaRegresiva(2)).toBe('Faltan 2 días')
    expect(cuentaRegresiva(1)).toBe('Falta 1 día')
    expect(cuentaRegresiva(0)).toBe('Vence hoy')
    expect(cuentaRegresiva(-1)).toBe('Venció ayer')
    expect(cuentaRegresiva(-8)).toBe('Venció hace 8 días')
    expect([urgenciaDe(-1), urgenciaDe(0), urgenciaDe(3), urgenciaDe(4)]).toEqual(['vencida', 'hoy', 'pronto', 'futura'])
  })

  it('cifra compacta en pesos', () => {
    expect(montoRDCompacto(151_234)).toBe('RD$151K')
    expect(montoRDCompacto(1_250_000)).toBe('RD$1.3M')
    expect(montoRDCompacto(-3_400)).toBe('-RD$3.4K')
    expect(montoRDCompacto(0)).toBe('RD$0')
  })
})
