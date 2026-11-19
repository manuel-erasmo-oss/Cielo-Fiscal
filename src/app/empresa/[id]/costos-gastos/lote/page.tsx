'use client'

import { CapturaLote } from '@/components/lote/CapturaLote'

// Captura por lotes desde Costos y gastos: si no se puede saber, se asume compra.
export default function LoteCostosGastosPage() {
  return <CapturaLote tipo="compra" />
}
