'use client'

import { ModuloComprobantes } from '@/components/comprobantes/ModuloComprobantes'

// Compras de bienes y servicios: alimentan el Formato 606.
export default function CostosGastosPage() {
  return <ModuloComprobantes tipo="compra" />
}
