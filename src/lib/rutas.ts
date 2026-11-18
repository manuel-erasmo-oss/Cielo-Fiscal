// Rutas de trabajo de una empresa (/empresa/<id>/...). Toda navegación
// interna pasa por aquí.
export type SeccionEmpresa = '' | 'facturas' | 'lote' | 'reportes'

export const rutaEmpresa = (empresaId: string, seccion: SeccionEmpresa = '') =>
  `/empresa/${encodeURIComponent(empresaId)}${seccion ? `/${seccion}` : ''}`
