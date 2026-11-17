import { describe, expect, it } from 'vitest'
import { calcularTramos } from './tramos'

describe('calcularTramos', () => {
  it('una hoja carta o una foto normal no se parte', () => {
    expect(calcularTramos(1700, 2200)).toEqual([{ y: 0, alto: 2200 }])
    expect(calcularTramos(3000, 2000)).toEqual([{ y: 0, alto: 2000 }])
    expect(calcularTramos(620, 1240)).toEqual([{ y: 0, alto: 1240 }]) // justo en el límite
  })

  it('un recibo largo se parte en tramos que lo cubren entero, con solape', () => {
    const tramos = calcularTramos(620, 4400)
    expect(tramos.length).toBeGreaterThan(1)
    expect(tramos.length).toBeLessThanOrEqual(8)
    expect(tramos[0].y).toBe(0)
    const ultimo = tramos.at(-1)!
    expect(ultimo.y + ultimo.alto).toBe(4400)
    for (let i = 1; i < tramos.length; i++) {
      const anterior = tramos[i - 1]
      expect(tramos[i].y).toBeLessThan(anterior.y + anterior.alto) // se solapan
      expect(tramos[i].y).toBeGreaterThan(anterior.y)
    }
    // Cada tramo queda con una proporción que el modelo no tiene que reducir mucho.
    for (const t of tramos) expect(t.alto / 620).toBeLessThanOrEqual(1.6)
  })

  it('nunca pasa de 8 tramos: si hace falta, los alarga', () => {
    const tramos = calcularTramos(300, 9000)
    expect(tramos).toHaveLength(8)
    expect(tramos.at(-1)!.y + tramos.at(-1)!.alto).toBe(9000)
  })

  it('medidas inválidas: un solo tramo', () => {
    expect(calcularTramos(0, 100)).toHaveLength(1)
  })
})
