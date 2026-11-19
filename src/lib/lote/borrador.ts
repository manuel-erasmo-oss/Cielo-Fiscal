import { CAMPOS_EXTRAIDOS, CAMPOS_VACIOS, buscarDuplicado, normalizarNcf, problemasDeRevision, type CamposDocumento } from '@/lib/documentos'
import type { ResultadoOCR } from '@/lib/ocr-tipos'
import { esFacturaDeConsumo, vaConRncDelCliente } from '@/lib/dgii-formatos'
import { leerQrEcf, pertenenciaSegunQr } from '@/lib/qr-ecf'
import { esUrlConsultaDGII, requiereVerificacionHumana, type RespuestaDGII } from '@/lib/verificacion-dgii'
import { CONTADOR_LOCAL, type CampoExtraido, type ClienteFiscal, type DocumentoFiscal, type TipoDocumento, type VerificacionDGII } from '@/types'

// Captura por lotes, lógica pura: qué factura sale de cada página a partir de
// su código QR y de la lectura con IA. Sin navegador ni almacenamiento, para
// poder probarla.

export type EstadoPagina =
  // El QR se leyó y la factura es de este cliente: trae contraparte, e-NCF,
  // fecha y total exactos.
  | 'qr'
  // No se encontró un QR de comprobante electrónico. Puede ser una factura
  // sin QR o una página que no es una factura; se guarda vacía para
  // completarla a mano (o con la lectura automática) viendo la imagen.
  | 'sin_qr'
  // El QR nombra a otro comprador y a otro emisor: no es de este cliente.
  | 'ajena'
  // Ya está registrada, o está repetida dentro del mismo lote.
  | 'duplicada'
  // La IA dice que la página no es una factura (una declaración, una
  // portada, una hoja en blanco).
  | 'no_factura'
  // Es del otro tipo que el módulo donde se subió (una compra en Ingresos o
  // una venta en Costos y gastos): no se guarda. Cada módulo registra solo
  // su tipo (decisión del usuario, 2026-11-19).
  | 'otro_modulo'

export interface BorradorPagina {
  estado: EstadoPagina
  tipo: TipoDocumento
  campos: CamposDocumento
  // true si el QR de la página se leyó: RNC, e-NCF, fecha y total son exactos.
  conQr: boolean
  // true si la IA ya leyó la página.
  leidaConIA: boolean
  // Campos de los que la IA dudó, o que no cuadran entre sí.
  dudosos: CampoExtraido[]
  confianzaOCR: number
  // Explicación para la persona cuando la página no entra por defecto o
  // necesita atención.
  nota?: string
  // Dirección de consulta de la DGII que trae el QR, si es un e-CF.
  qrUrl?: string
  // Lo que respondió la DGII al consultarla (ver `aplicarVerificacion`).
  dgii?: DatosDGIIPagina
}

export interface DatosDGIIPagina {
  verificacion: VerificacionDGII
  // Datos que la DGII tiene registrados: mandan sobre la lectura de la IA,
  // igual que los del QR.
  itbis: number | null
  razonSocialContraparte: string | null
}

export interface ContextoLote {
  cliente: Pick<ClienteFiscal, 'id' | 'rncCedula'>
  // Tipo de las páginas cuyo QR no permite saberlo.
  tipoPorDefecto: TipoDocumento
  // Módulo donde se sube el lote: las páginas del otro tipo se descartan.
  tipoModulo?: TipoDocumento
  // Facturas ya guardadas, más las de páginas anteriores de este lote.
  existentes: readonly Pick<DocumentoFiscal, 'id' | 'clienteId' | 'tipo' | 'ncf' | 'rncCedulaContraparte' | 'estadoRevision'>[]
}

const NOTA_DUPLICADA = 'Este comprobante ya está registrado o está repetido en el lote.'

export function notaOtroModulo(tipoModulo: TipoDocumento): string {
  return tipoModulo === 'venta'
    ? 'Es una factura de compra (gasto): en Ingresos solo se registran ventas. No se guarda aquí; súbela en Costos y gastos.'
    : 'Es una factura de venta: en Costos y gastos solo se registran compras. No se guarda aquí; súbela en Ingresos.'
}

export function interpretarPagina(textoQr: string | null, ctx: ContextoLote): BorradorPagina {
  const qr = textoQr ? leerQrEcf(textoQr) : null
  const base = { leidaConIA: false, dudosos: [], confianzaOCR: 0 }
  if (!qr) return { ...base, estado: 'sin_qr', tipo: ctx.tipoPorDefecto, campos: { ...CAMPOS_VACIOS }, conQr: false }

  const pertenencia = pertenenciaSegunQr(qr, ctx.cliente.rncCedula)
  // Si el QR no trae comprador, el emisor no es el cliente, así que el
  // cliente solo puede ser quien compró.
  const tipo: TipoDocumento = pertenencia === 'venta' ? 'venta' : 'compra'
  // En un e-CF de compras (41) autoemitido el vendedor figura como
  // comprador; en gastos menores (43) y pagos al exterior (47) el 606 lleva
  // el RNC del propio cliente, que aquí es el emisor.
  const autoemitido = tipo === 'compra' && qr.rncEmisor === ctx.cliente.rncCedula
  const contraparte = tipo === 'venta' || (autoemitido && !vaConRncDelCliente(qr.encf)) ? qr.rncComprador : qr.rncEmisor
  const campos: CamposDocumento = {
    ...CAMPOS_VACIOS,
    rncCedulaContraparte: contraparte,
    ncf: normalizarNcf(qr.encf),
    fechaComprobante: qr.fechaEmision,
    montoTotal: qr.montoTotal,
    tipoIdentificacion: tipo === 'venta' && contraparte ? (contraparte.length === 9 ? '1' : '2') : null,
  }

  if (pertenencia === 'ajena') {
    return { ...base, estado: 'ajena', tipo, campos, conQr: true, nota: 'El código QR dice que esta factura es de otro contribuyente, no de este cliente.' }
  }
  if (ctx.tipoModulo && tipo !== ctx.tipoModulo) {
    return { ...base, estado: 'otro_modulo', tipo, campos, conQr: true, nota: notaOtroModulo(ctx.tipoModulo) }
  }
  const repetida = buscarDuplicado(
    { id: '', clienteId: ctx.cliente.id, tipo, ncf: campos.ncf, rncCedulaContraparte: campos.rncCedulaContraparte },
    ctx.existentes as readonly DocumentoFiscal[],
  )
  const qrUrl = esUrlConsultaDGII(textoQr!) ? textoQr! : undefined
  if (repetida) return { ...base, estado: 'duplicada', tipo, campos, conQr: true, qrUrl, nota: NOTA_DUPLICADA }
  return { ...base, estado: 'qr', tipo, campos, conQr: true, qrUrl }
}

// Campos de montos que quedan en duda cuando las partes no suman el total.
function montosDe(tipo: TipoDocumento): CampoExtraido[] {
  return tipo === 'compra' ? ['montoServicios', 'montoBienes', 'itbisFacturado'] : ['montoFacturado', 'itbisFacturado']
}

// ¿Lo facturado más los impuestos da el total? null si falta algún dato.
function cuadra(tipo: TipoDocumento, c: CamposDocumento): boolean | null {
  const base = tipo === 'venta'
    ? c.montoFacturado
    : c.montoServicios === null && c.montoBienes === null ? null : (c.montoServicios ?? 0) + (c.montoBienes ?? 0)
  if (base === null || c.itbisFacturado === null || c.montoTotal === null) return null
  const partes = base + c.itbisFacturado + (c.impuestoSelectivoConsumo ?? 0) + (c.otrosImpuestos ?? 0) + (c.propinaLegal ?? 0)
  return Math.abs(partes - c.montoTotal) <= 0.05
}

// Combina lo que se sabía de la página (su QR, si lo tenía) con lo que leyó
// la IA. Regla: lo que viene del QR manda — lo firmó el emisor y es exacto;
// la IA aporta todo lo demás. Si las partes no suman el total, los montos
// quedan marcados para revisión.
export function fusionarConLectura(borrador: BorradorPagina, lectura: ResultadoOCR, ctx: ContextoLote): BorradorPagina {
  if (borrador.estado === 'ajena' || borrador.estado === 'duplicada' || borrador.estado === 'otro_modulo') return borrador
  const leida = { ...borrador, leidaConIA: true, confianzaOCR: lectura.confianzaOCR }

  if (!borrador.conQr) {
    if (!lectura.esComprobante) {
      return { ...leida, estado: 'no_factura', nota: 'La IA no la reconoce como una factura.' }
    }
    if (ctx.tipoModulo && lectura.tipo !== ctx.tipoModulo) {
      return { ...leida, estado: 'otro_modulo', tipo: lectura.tipo, campos: lectura.extraccion, nota: notaOtroModulo(ctx.tipoModulo) }
    }
    const campos = lectura.extraccion
    const dudosos = new Set<CampoExtraido>(lectura.camposDudosos)
    // Una venta es de la empresa solo si la emitió ella. Si la IA no pudo
    // confirmar el RNC del emisor, una persona lo revisa (decisión del
    // usuario, 2026-11-19: "lo primero, comprobar que la venta pertenezca a
    // la empresa").
    const ventaSinConfirmar = lectura.tipo === 'venta' && lectura.coincideCliente !== true
    if (ventaSinConfirmar) dudosos.add('ncf')
    if (cuadra(lectura.tipo, campos) === false) montosDe(lectura.tipo).forEach(c => dudosos.add(c))
    const repetida = buscarDuplicado(
      { id: '', clienteId: ctx.cliente.id, tipo: lectura.tipo, ncf: campos.ncf, rncCedulaContraparte: campos.rncCedulaContraparte },
      ctx.existentes as readonly DocumentoFiscal[],
    )
    if (repetida) return { ...leida, estado: 'duplicada', tipo: lectura.tipo, campos, nota: NOTA_DUPLICADA }
    return {
      ...leida,
      tipo: lectura.tipo,
      campos,
      dudosos: CAMPOS_EXTRAIDOS.filter(c => dudosos.has(c)),
      nota: lectura.coincideCliente === false
        ? 'El RNC de este cliente no aparece en la factura: comprueba que sea suya.'
        : ventaSinConfirmar ? 'No se pudo confirmar en la factura que la emitió esta empresa: revísala.' : undefined,
    }
  }

  // Con QR. Si la IA entendió la factura al revés (compra por venta), sus
  // montos están en los campos equivocados: se conserva solo lo del QR.
  if (!lectura.esComprobante || lectura.tipo !== borrador.tipo) {
    return { ...leida, nota: 'La lectura con IA no coincidió con el código QR: completa los montos a mano.' }
  }
  const delQr = borrador.campos
  const campos: CamposDocumento = {
    ...lectura.extraccion,
    rncCedulaContraparte: delQr.rncCedulaContraparte ?? lectura.extraccion.rncCedulaContraparte,
    ncf: delQr.ncf,
    fechaComprobante: delQr.fechaComprobante ?? lectura.extraccion.fechaComprobante,
    montoTotal: delQr.montoTotal ?? lectura.extraccion.montoTotal,
    tipoIdentificacion: delQr.tipoIdentificacion ?? lectura.extraccion.tipoIdentificacion,
  }
  // Lo que quedó con el valor del QR ya no está en duda, lo haya marcado la IA o no.
  const exactos: CampoExtraido[] = ['ncf']
  if (delQr.rncCedulaContraparte) exactos.push('rncCedulaContraparte')
  if (delQr.fechaComprobante) exactos.push('fechaComprobante')
  if (delQr.montoTotal !== null) exactos.push('montoTotal')
  const dudosos = new Set<CampoExtraido>(lectura.camposDudosos.filter(c => !exactos.includes(c)))
  if (cuadra(borrador.tipo, campos) === false) montosDe(borrador.tipo).forEach(c => dudosos.add(c))
  return { ...leida, campos, dudosos: CAMPOS_EXTRAIDOS.filter(c => dudosos.has(c)) }
}

// Guarda en la página lo que respondió la DGII. Solo se toman la razón social
// de la contraparte (la de quien tenga su RNC) y el total de ITBIS.
export function aplicarVerificacion(borrador: BorradorPagina, respuesta: RespuestaDGII, ahora: string): BorradorPagina {
  const d = respuesta.datos
  const contraparte = borrador.campos.rncCedulaContraparte
  const razonSocialContraparte = !d || !contraparte ? null
    : d.rncEmisor === contraparte ? d.razonSocialEmisor
      : d.rncComprador === contraparte ? d.razonSocialComprador : null
  return {
    ...borrador,
    dgii: {
      verificacion: { estado: respuesta.estado, texto: respuesta.texto, consultadoEn: ahora },
      itbis: d?.totalItbis ?? null,
      razonSocialContraparte,
    },
  }
}

// Campos y dudas de la página con lo de la DGII encima: su ITBIS manda (y deja
// de estar en duda) y su razón social llena el nombre si la IA no lo leyó.
// Si con ese ITBIS los montos no suman el total, quedan en duda.
export function conDatosDGII(borrador: BorradorPagina): { campos: CamposDocumento; dudosos: CampoExtraido[] } {
  const dgii = borrador.dgii
  if (!dgii || (dgii.itbis === null && !dgii.razonSocialContraparte)) return { campos: borrador.campos, dudosos: borrador.dudosos }
  const campos: CamposDocumento = {
    ...borrador.campos,
    itbisFacturado: dgii.itbis ?? borrador.campos.itbisFacturado,
    nombreContraparte: borrador.campos.nombreContraparte ?? dgii.razonSocialContraparte,
  }
  const dudosos = new Set(borrador.dudosos)
  if (dgii.itbis !== null) {
    dudosos.delete('itbisFacturado')
    if (cuadra(borrador.tipo, campos) === false) montosDe(borrador.tipo).filter(c => c !== 'itbisFacturado').forEach(c => dudosos.add(c))
  }
  if (!borrador.campos.nombreContraparte && dgii.razonSocialContraparte) dudosos.delete('nombreContraparte')
  return { campos, dudosos: CAMPOS_EXTRAIDOS.filter(c => dudosos.has(c)) }
}

// Lo que impide dar la página por buena: campos que el formato exige y
// faltan, los que quedaron en duda y un comprobante que la DGII rechazó o no
// encuentra. Vacío = lista para aprobar.
// Venta sin cliente identificado cuyo comprobante no es de consumo (B02/E32).
export function faltaClienteEnVenta(d: Pick<DocumentoFiscal, 'tipo' | 'ncf' | 'rncCedulaContraparte'>): boolean {
  return d.tipo === 'venta' && !d.rncCedulaContraparte && !!d.ncf && !esFacturaDeConsumo(d.ncf)
}

export function observaciones(borrador: BorradorPagina, rncCliente: string): CampoExtraido[] {
  const { campos, dudosos } = conDatosDGII(borrador)
  const pendientes = new Set<CampoExtraido>(dudosos)
  const verificacionDGII = borrador.dgii?.verificacion
  for (const p of problemasDeRevision(borrador.tipo, { ...campos, qrUrl: borrador.qrUrl, verificacionDGII }, rncCliente)) {
    if (p.nivel === 'error' && p.campo) pendientes.add(p.campo)
  }
  // e-CF sin verificar en la DGII (QR ilegible o consulta fallida): como un
  // dato borroso, lo tiene que verificar una persona.
  if (requiereVerificacionHumana({ ncf: campos.ncf, verificacionDGII })) pendientes.add('ncf')
  // Venta sin cliente que no es de consumo (B02/E32): no es "consumidor
  // final"; una persona identifica al cliente.
  if (faltaClienteEnVenta({ tipo: borrador.tipo, ...campos })) pendientes.add('rncCedulaContraparte')
  return CAMPOS_EXTRAIDOS.filter(c => pendientes.has(c))
}

// La factura que se guarda a partir de una página: siempre pendiente de
// revisión, con la lista de lo que todavía le falta.
export function documentoDesdePagina(
  id: string,
  borrador: BorradorPagina,
  cliente: Pick<ClienteFiscal, 'id' | 'rncCedula'>,
  archivo: { nombre: string; pagina: number },
  ahora: string,
): DocumentoFiscal {
  return {
    ...conDatosDGII(borrador).campos,
    qrUrl: borrador.qrUrl,
    verificacionDGII: borrador.dgii?.verificacion,
    id,
    contadorUid: CONTADOR_LOCAL,
    clienteId: cliente.id,
    tipo: borrador.tipo,
    origen: borrador.leidaConIA ? 'ocr' : borrador.conQr ? 'qr' : 'manual',
    archivoNombre: archivo.nombre,
    archivoMimeType: 'image/jpeg',
    archivoPagina: archivo.pagina,
    // Solo con QR (sin IA) los datos son exactos: no hay lectura que puntuar.
    confianzaOCR: borrador.leidaConIA ? borrador.confianzaOCR : borrador.conQr ? 1 : 0,
    camposIncompletos: observaciones(borrador, cliente.rncCedula),
    estadoRevision: 'pendiente_revision',
    creadoEn: ahora,
    actualizadoEn: ahora,
  }
}
