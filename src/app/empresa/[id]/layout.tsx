'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { AvisoErrorCarga, Pagina } from '@/components/layout/Pagina'
import { EmptyState } from '@/components/ui/EmptyState'
import { EmpresaProvider, useEmpresa } from '@/lib/datos/empresa-context'
import { BTN_PRIMARY } from '@/lib/utils'

// Todo lo que cuelga de /empresa/<id> trabaja dentro de esa empresa: sus
// pantallas solo ven y guardan datos de ella (ver empresa-context). Si el id
// no es de ninguna empresa (se borró, o la dirección está mal), no se dibuja
// ninguna pantalla de trabajo.
export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>()
  let empresaId = id
  try {
    empresaId = decodeURIComponent(id)
  } catch {
    // id mal formado: no coincidirá con ninguna empresa
  }
  return (
    <EmpresaProvider empresaId={empresaId}>
      <SoloConEmpresa>{children}</SoloConEmpresa>
    </EmpresaProvider>
  )
}

function SoloConEmpresa({ children }: { children: React.ReactNode }) {
  const { listo, errorCarga, empresa } = useEmpresa()
  if (!listo) return null
  if (errorCarga) return <Pagina title="Empresa"><AvisoErrorCarga mensaje={errorCarga} /></Pagina>
  if (!empresa) {
    return (
      <Pagina title="Empresa no encontrada">
        <div className="flex flex-col items-center gap-4">
          <EmptyState
            icon={Building2}
            title="Esta empresa no existe"
            message="Puede que se haya eliminado o que la dirección esté mal. Elige una empresa de tu lista."
            className="w-full"
          />
          <Link href="/" className={BTN_PRIMARY}>Ir a Tus empresas</Link>
        </div>
      </Pagina>
    )
  }
  return <>{children}</>
}
