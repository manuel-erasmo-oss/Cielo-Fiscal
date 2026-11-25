'use client'

import { useEffect, useRef, useState } from 'react'
import { CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { BTN_SECONDARY, INPUT_CLASS, LABEL_CLASS } from '@/components/ui/clases'
import { validarCliente, type DatosCliente } from '@/lib/documentos'
import { avisoDeEstado, consultarPadron, type RegistroPadron } from '@/lib/padron-rnc'
import { BTN_PRIMARY, cn, formatDate, soloDigitos } from '@/lib/utils'
import { CONTADOR_LOCAL, type ClienteFiscal, type TipoPersona } from '@/types'

interface ClienteModalProps {
  // null = cliente nuevo.
  cliente: ClienteFiscal | null
  existentes: readonly ClienteFiscal[]
  onGuardar: (cliente: ClienteFiscal) => Promise<void>
  onClose: () => void
}

export function ClienteModal({ cliente, existentes, onGuardar, onClose }: ClienteModalProps) {
  const [datos, setDatos] = useState<DatosCliente>({
    tipoPersona: cliente?.tipoPersona ?? 'juridica',
    rncCedula: cliente?.rncCedula ?? '',
    razonSocial: cliente?.razonSocial ?? '',
    nombreComercial: cliente?.nombreComercial ?? '',
    actividad: cliente?.actividad ?? '',
  })
  const [errores, setErrores] = useState<ReturnType<typeof validarCliente>>({})
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Padrón de RNC de la DGII: al escribir un RNC (9 dígitos) o una cédula
  // (11), se llenan solos la razón social, el nombre comercial y la
  // actividad. Solo se llenan los campos vacíos o los que se llenaron solos
  // antes: lo que escribió la persona no se pisa.
  const [padron, setPadron] = useState<
    | { estado: 'buscando' }
    | { estado: 'encontrado'; registro: RegistroPadron; fecha: string }
    | { estado: 'no_encontrado'; fecha: string }
    | { estado: 'error' }
    | null
  >(null)
  const autollenado = useRef<{ razonSocial: string; nombreComercial: string; actividad: string }>({ razonSocial: '', nombreComercial: '', actividad: '' })
  const digitos = soloDigitos(datos.rncCedula)
  useEffect(() => {
    // Al editar una empresa no se toca nada mientras el RNC siga igual.
    if ((digitos.length !== 9 && digitos.length !== 11) || digitos === cliente?.rncCedula) {
      setPadron(null)
      return
    }
    let vigente = true
    setPadron({ estado: 'buscando' })
    const espera = setTimeout(() => {
      consultarPadron(digitos)
        .then(({ registro, fechaPadron }) => {
          if (!vigente) return
          if (!registro) return setPadron({ estado: 'no_encontrado', fecha: fechaPadron })
          setPadron({ estado: 'encontrado', registro, fecha: fechaPadron })
          setDatos(d => {
            const antes = autollenado.current
            const poner = (actual: string | undefined, previo: string, nuevo: string) =>
              !actual?.trim() || actual === previo ? nuevo : actual
            const sig = {
              ...d,
              tipoPersona: digitos.length === 9 ? 'juridica' as const : 'fisica' as const,
              razonSocial: poner(d.razonSocial, antes.razonSocial, registro.razonSocial),
              nombreComercial: poner(d.nombreComercial, antes.nombreComercial, registro.nombreComercial),
              actividad: poner(d.actividad, antes.actividad, registro.actividad),
            }
            autollenado.current = { razonSocial: registro.razonSocial, nombreComercial: registro.nombreComercial, actividad: registro.actividad }
            return sig
          })
        })
        .catch(() => { if (vigente) setPadron({ estado: 'error' }) })
    }, 250)
    return () => { vigente = false; clearTimeout(espera) }
  }, [digitos, cliente?.rncCedula])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const encontrados = validarCliente(datos, existentes, cliente?.id)
    setErrores(encontrados)
    if (Object.keys(encontrados).length > 0) return

    const ahora = new Date().toISOString()
    setGuardando(true)
    setErrorGuardar(null)
    try {
      await onGuardar({
        id: cliente?.id ?? crypto.randomUUID(),
        contadorUid: cliente?.contadorUid ?? CONTADOR_LOCAL,
        tipoPersona: datos.tipoPersona,
        rncCedula: soloDigitos(datos.rncCedula),
        razonSocial: datos.razonSocial.trim(),
        nombreComercial: datos.nombreComercial?.trim() || undefined,
        actividad: datos.actividad?.trim() || undefined,
        mesCierreFiscal: cliente?.mesCierreFiscal,
        activo: cliente?.activo ?? true,
        creadoEn: cliente?.creadoEn ?? ahora,
        actualizadoEn: ahora,
      })
    } catch (err) {
      setErrorGuardar(err instanceof Error ? err.message : 'No se pudo guardar la empresa.')
      setGuardando(false)
    }
  }

  const TIPOS: { valor: TipoPersona; etiqueta: string }[] = [
    { valor: 'juridica', etiqueta: 'Persona jurídica' },
    { valor: 'fisica', etiqueta: 'Persona física' },
  ]

  return (
    <Modal titulo={cliente ? 'Editar empresa' : 'Añadir empresa'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4 px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <span className={LABEL_CLASS}>Tipo</span>
          <div className="grid grid-cols-2 gap-2">
            {TIPOS.map(t => (
              <button
                key={t.valor}
                type="button"
                aria-pressed={datos.tipoPersona === t.valor}
                onClick={() => setDatos(d => ({ ...d, tipoPersona: t.valor }))}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  datos.tipoPersona === t.valor
                    ? 'border-[#1B2980] bg-[#eef0fb] text-[#1B2980] dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-[#252840] dark:text-zinc-400 dark:hover:bg-[#1a1d2e]',
                )}
              >
                {t.etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cliente-rnc" className={LABEL_CLASS}>RNC o cédula</label>
          <input
            id="cliente-rnc"
            inputMode="numeric"
            autoComplete="off"
            value={datos.rncCedula}
            onChange={e => setDatos(d => ({ ...d, rncCedula: e.target.value }))}
            placeholder="9 dígitos (RNC) u 11 (cédula)"
            aria-invalid={!!errores.rncCedula}
            className={cn(INPUT_CLASS, errores.rncCedula && 'border-rose-400 dark:border-rose-500')}
          />
          {errores.rncCedula && <p className="text-xs text-rose-600 dark:text-rose-400">{errores.rncCedula}</p>}
          {padron?.estado === 'buscando' && (
            <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Buscando en el padrón de la DGII…</p>
          )}
          {padron?.estado === 'encontrado' && (() => {
            const aviso = avisoDeEstado(padron.registro.estado)
            return (
              <p role="status" className={cn('flex items-start gap-1.5 text-xs',
                aviso.tono === 'bien' ? 'text-emerald-700 dark:text-emerald-400' : aviso.tono === 'aviso' ? 'text-amber-700 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')}>
                {aviso.tono === 'bien' ? <CircleCheck className="mt-px h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />}
                <span>
                  {aviso.texto}{padron.registro.regimen === 'RST' && ' · Régimen simplificado (RST)'}. Datos del padrón de RNC de la DGII del {formatDate(padron.fecha)}.
                </span>
              </p>
            )
          })()}
          {padron?.estado === 'no_encontrado' && (
            <p role="status" className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>Este número no está en el padrón de RNC de la DGII del {formatDate(padron.fecha)}. Revisa que esté bien escrito; si es correcto, completa los datos a mano.</span>
            </p>
          )}
          {padron?.estado === 'error' && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">No se pudo consultar el padrón de RNC. Completa los datos a mano.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cliente-razon" className={LABEL_CLASS}>
            {datos.tipoPersona === 'juridica' ? 'Razón social' : 'Nombre completo'}
          </label>
          <input
            id="cliente-razon"
            autoComplete="off"
            value={datos.razonSocial}
            onChange={e => setDatos(d => ({ ...d, razonSocial: e.target.value }))}
            aria-invalid={!!errores.razonSocial}
            className={cn(INPUT_CLASS, errores.razonSocial && 'border-rose-400 dark:border-rose-500')}
          />
          {errores.razonSocial && <p className="text-xs text-rose-600 dark:text-rose-400">{errores.razonSocial}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cliente-comercial" className={LABEL_CLASS}>Nombre comercial (opcional)</label>
          <input
            id="cliente-comercial"
            autoComplete="off"
            value={datos.nombreComercial ?? ''}
            onChange={e => setDatos(d => ({ ...d, nombreComercial: e.target.value }))}
            className={INPUT_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cliente-actividad" className={LABEL_CLASS}>A qué se dedica (opcional)</label>
          <textarea
            id="cliente-actividad"
            rows={2}
            maxLength={300}
            value={datos.actividad ?? ''}
            onChange={e => setDatos(d => ({ ...d, actividad: e.target.value }))}
            placeholder="Ej.: importa y vende herrajes para muebles"
            className={INPUT_CLASS}
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Ayuda al sistema a decidir si una compra es costo, gasto o activo.
          </p>
        </div>

        {errorGuardar && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{errorGuardar}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Cancelar</button>
          <button type="submit" disabled={guardando} className={BTN_PRIMARY}>
            {cliente ? 'Guardar cambios' : 'Añadir empresa'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
