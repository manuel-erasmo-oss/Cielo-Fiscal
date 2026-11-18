'use client'

import Link from 'next/link'
import { CalendarClock, CircleAlert, CircleCheck, FileText, Files, ReceiptText, ShieldAlert } from 'lucide-react'
import { Pagina } from '@/components/layout/Pagina'
import { StatCard } from '@/components/ui/StatCard'
import { BTN_SECONDARY, CARD_CLASS } from '@/components/ui/clases'
import { fechaLimite606607 } from '@/lib/dgii-fiscal'
import { rutaEmpresa, useEmpresaActiva } from '@/lib/datos/empresa-context'
import { BTN_PRIMARY, cn, formatDate, formatPeriodo, hoyLocalISO, parseFechaLocal } from '@/lib/utils'
import { requiereVerificacionHumana } from '@/lib/verificacion-dgii'

// Resumen de la empresa en la que se entró: solo sus números.
export default function ResumenEmpresaPage() {
  const { empresa, documentos } = useEmpresaActiva()

  const pendientes = documentos.filter(d => d.estadoRevision === 'pendiente_revision')
  const porVerificar = pendientes.filter(d => requiereVerificacionHumana(d)).length
  const revisadas = documentos.filter(d => d.estadoRevision === 'revisado').length

  // Próximo vencimiento del 606: el del mes pasado vence el día 15 de este
  // mes; si ese día ya pasó, el próximo es el de este mes (vence el 15 del
  // mes que viene). Fechas siempre locales (lección 1 de CLAUDE.md).
  const hoyISO = hoyLocalISO()
  const hoy = parseFechaLocal(hoyISO)
  const anterior = hoy.getMonth() === 0 ? { anio: hoy.getFullYear() - 1, mes: 12 } : { anio: hoy.getFullYear(), mes: hoy.getMonth() }
  const actual = { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 }
  const mesAnterior = hoyISO <= fechaLimite606607(anterior.anio, anterior.mes) ? anterior : actual
  const vence606 = fechaLimite606607(mesAnterior.anio, mesAnterior.mes)

  return (
    <Pagina title="Resumen" subtitle={empresa.nombreComercial ?? empresa.razonSocial}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Facturas registradas" value={String(documentos.length)} icon={ReceiptText}
          iconColor="bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400" />
        <StatCard label="Por revisar" value={String(pendientes.length)} sub="No entran a ningún reporte hasta revisarlas" icon={CircleAlert}
          iconColor="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400" />
        <StatCard label="Por verificar en la DGII" value={String(porVerificar)} sub="Facturas electrónicas sin QR legible" icon={ShieldAlert}
          iconColor="bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400" />
        <StatCard label="Revisadas" value={String(revisadas)} icon={CircleCheck}
          iconColor="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400" />
      </div>

      <div className={cn(CARD_CLASS, 'flex flex-wrap items-center gap-3 px-5 py-4')}>
        <CalendarClock className="h-5 w-5 shrink-0 text-[#1B2980] dark:text-indigo-400" />
        <p className="min-w-[220px] flex-1 text-sm text-zinc-700 dark:text-zinc-300">
          El 606 de <strong>{formatPeriodo(mesAnterior.anio, mesAnterior.mes)}</strong> vence el <strong>{formatDate(vence606)}</strong>.
        </p>
        <Link href={rutaEmpresa(empresa.id, 'reportes')} className={BTN_SECONDARY}>
          <FileText className="h-4 w-4" /> Ir a Reportes
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href={rutaEmpresa(empresa.id, 'lote')} className={BTN_PRIMARY}>
          <Files className="h-4 w-4" /> Subir lote de facturas
        </Link>
        <Link href={rutaEmpresa(empresa.id, 'facturas')} className={BTN_SECONDARY}>
          <ReceiptText className="h-4 w-4" /> Ver facturas{pendientes.length > 0 ? ` (${pendientes.length} por revisar)` : ''}
        </Link>
      </div>
    </Pagina>
  )
}
