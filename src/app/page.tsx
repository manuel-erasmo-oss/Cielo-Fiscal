'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { CircleAlert, CircleCheck, HardDrive, ReceiptText, Users } from 'lucide-react'
import { AvisoErrorCarga, Pagina } from '@/components/layout/Pagina'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/ui/StatCard'
import { CARD_CLASS, TH_CLASS } from '@/components/ui/clases'
import { useDatos } from '@/lib/datos/datos-context'
import { BTN_PRIMARY, cn } from '@/lib/utils'

export default function InicioPage() {
  const { listo, errorCarga, clientes, documentos } = useDatos()

  const pendientes = documentos.filter(d => d.estadoRevision === 'pendiente_revision').length
  const revisadas = documentos.filter(d => d.estadoRevision === 'revisado').length

  // Clientes con facturas por revisar, los más cargados primero.
  const porRevisar = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const d of documentos) {
      if (d.estadoRevision === 'pendiente_revision') cuenta.set(d.clienteId, (cuenta.get(d.clienteId) ?? 0) + 1)
    }
    return clientes
      .filter(c => cuenta.has(c.id))
      .map(c => ({ cliente: c, pendientes: cuenta.get(c.id) ?? 0 }))
      .sort((a, b) => b.pendientes - a.pendientes)
  }, [clientes, documentos])

  return (
    <Pagina title="Inicio" subtitle="Cielo Cloud Fiscal">
      {errorCarga && <AvisoErrorCarga mensaje={errorCarga} />}

      {listo && !errorCarga && clientes.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState
            icon={Users}
            title="Empieza creando tu primer cliente"
            message="Luego podrás subir sus facturas: el sistema lee los datos y tú los revisas antes de guardarlos."
            className="w-full"
          />
          <Link href="/clientes" className={BTN_PRIMARY}>Ir a Clientes</Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Clientes"
              value={String(clientes.length)}
              icon={Users}
              iconColor="bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/40 dark:text-indigo-400"
            />
            <StatCard
              label="Facturas registradas"
              value={String(documentos.length)}
              icon={ReceiptText}
              iconColor="bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400"
            />
            <StatCard
              label="Por revisar"
              value={String(pendientes)}
              sub="No entran a ningún reporte hasta revisarlas"
              icon={CircleAlert}
              iconColor="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
            />
            <StatCard
              label="Revisadas"
              value={String(revisadas)}
              icon={CircleCheck}
              iconColor="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
            />
          </div>

          {porRevisar.length > 0 && (
            <div className={cn(CARD_CLASS, 'overflow-hidden')}>
              <div className="border-b border-zinc-100 dark:border-[#1d2035] px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Facturas por revisar</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-[#1d2035] bg-zinc-50 dark:bg-[#1a1d2e]">
                    <th className={cn(TH_CLASS, 'text-left pl-5')}>Cliente</th>
                    <th className={cn(TH_CLASS, 'text-right pr-5')}>Pendientes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-[#1d2035]">
                  {porRevisar.map(({ cliente, pendientes: n }) => (
                    <tr key={cliente.id} className="hover:bg-[#eef0fb]/30 dark:hover:bg-indigo-950/20 transition-colors">
                      <td className="px-4 py-3.5 pl-5">
                        <Link href={`/facturas?cliente=${cliente.id}`} className="font-medium text-[#1B2980] dark:text-indigo-400 hover:underline">
                          {cliente.razonSocial}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 pr-5 text-right">
                        <Badge variant="warning">{n} por revisar</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="flex items-start gap-3 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-[#eef0fb] dark:bg-indigo-950/30 px-5 py-4">
        <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-[#1B2980] dark:text-indigo-300" />
        <p className="text-xs text-[#151f66] dark:text-indigo-200">
          <strong>Tus datos se guardan solo en este navegador.</strong> No se sincronizan con otros equipos y
          se pierden si borras los datos del sitio. Los archivos de las facturas no se conservan: solo los datos extraídos.
        </p>
      </div>
    </Pagina>
  )
}
