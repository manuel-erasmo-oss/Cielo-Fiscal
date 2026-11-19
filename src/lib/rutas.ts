// Rutas de trabajo de una empresa (/empresa/<id>/...). Toda navegación
// interna pasa por aquí.
//
// Desde el 2026-11-18 el módulo "Facturas" se dividió en "Ingresos" (ventas)
// y "Costos y gastos" (compras del 606), cada uno con su captura por lotes.
// 'facturas' y 'lote' se conservan solo porque redirigen (next.config.mjs) a
// Costos y gastos: no enlazar a ellas desde pantallas nuevas.
export type SeccionEmpresa =
  | ''
  | 'ingresos'
  | 'ingresos/lote'
  | 'costos-gastos'
  | 'costos-gastos/lote'
  | 'reportes'
  | 'facturas'
  | 'lote'

export const rutaEmpresa = (empresaId: string, seccion: SeccionEmpresa = '') =>
  `/empresa/${encodeURIComponent(empresaId)}${seccion ? `/${seccion}` : ''}`
