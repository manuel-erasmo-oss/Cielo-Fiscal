'use client'

import { ModuloComprobantes } from '@/components/comprobantes/ModuloComprobantes'

// Ventas: forman el reporte de ingresos.
export default function IngresosPage() {
  return <ModuloComprobantes tipo="venta" />
}
