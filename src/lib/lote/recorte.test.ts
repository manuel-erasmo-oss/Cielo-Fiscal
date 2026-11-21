import { describe, expect, it } from 'vitest'
import { cajaDeContenido } from './recorte'

// Página blanca de w×h con un rectángulo negro en (x, y, rw, rh).
function pagina(w: number, h: number, rect?: [number, number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4).fill(255)
  if (rect) {
    const [x0, y0, rw, rh] = rect
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) d.set([0, 0, 0, 255], (y * w + x) * 4)
  }
  return d
}

describe('cajaDeContenido', () => {
  it('recorta los márgenes y deja un borde de 24 px', () => {
    const c = cajaDeContenido(pagina(1000, 1400, [200, 300, 400, 500]), 1000, 1400, 1)!
    expect(c).toEqual({ x: 176, y: 276, ancho: 448, alto: 548 }) // 400×500 + 24 por lado
  })

  it('página en blanco: no recorta', () => {
    expect(cajaDeContenido(pagina(400, 400), 400, 400)).toBeNull()
  })

  it('contenido que ocupa casi toda la página: no vale la pena recortar', () => {
    expect(cajaDeContenido(pagina(400, 400, [5, 5, 390, 390]), 400, 400)).toBeNull()
  })

  it('no se sale de la página', () => {
    const c = cajaDeContenido(pagina(400, 800, [0, 0, 100, 100]), 400, 800, 1)!
    expect(c.x).toBe(0)
    expect(c.y).toBe(0)
    expect(c.ancho).toBeLessThanOrEqual(400)
  })
})
