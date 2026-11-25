#!/usr/bin/env node
// Convierte el padrón de RNC de la DGII (DGII_RNC.zip, o el DGII_RNC.TXT que
// trae adentro) en los archivos que usa la aplicación para llenar sola la
// razón social, el nombre comercial y la actividad económica al escribir un
// RNC (ver src/lib/padron-rnc.ts).
//
// Uso:  node scripts/padron-rnc.mjs ruta/al/DGII_RNC.zip
//
// La DGII bloquea las descargas desde servidores: el archivo lo descarga una
// persona desde su navegador y se procesa con este script. Para actualizar el
// padrón basta con volver a correrlo con el archivo nuevo y publicar.
//
// Formato del archivo de la DGII (revisado con el de noviembre de 2026):
//   - Texto en Latin-1 (ISO-8859-1), líneas separadas por CRLF.
//   - 11 columnas separadas por "|": RNC o cédula | razón social | nombre
//     comercial | actividad económica (la DGII la corta a 30 caracteres) |
//     4 columnas vacías | fecha | estado | régimen de pagos.
//   - Unas pocas líneas traen un salto de línea dentro del nombre: se unen
//     hasta completar las 11 columnas.
//
// Salida (public/padron-rnc/):
//   - indice.json: fecha del padrón, totales, catálogo de actividades y la
//     lista de prefijos de los pedazos.
//   - <prefijo>.tsv.gz: los registros cuyo RNC empieza por ese prefijo, una
//     línea por registro: rnc \t razón social \t nombre comercial \t número
//     de actividad \t estado \t régimen. Los prefijos se parten hasta que
//     ningún pedazo comprimido pase de ~100 KB.

import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { gzipSync, inflateRawSync } from 'node:zlib'
import { join } from 'node:path'

const DESTINO = join(process.cwd(), 'public', 'padron-rnc')
const MAXIMO_BYTES = 100_000

export const ESTADOS = { ACTIVO: 'A', SUSPENDIDO: 'S', 'DADO DE BAJA': 'B', 'CESE TEMPORAL': 'C', ANULADO: 'N', RECHAZADO: 'R' }
export const REGIMENES = { NORMAL: 'N', RST: 'R' }

// Lee la única entrada de un .zip (con el directorio central, por si el
// archivo usa descriptor de datos).
function leerZip(buf) {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (fin < 0) throw new Error('No es un .zip válido.')
  const central = buf.readUInt32LE(fin + 16)
  if (buf.readUInt32LE(central) !== 0x02014b50) throw new Error('Directorio central del .zip dañado.')
  const metodo = buf.readUInt16LE(central + 10)
  const comprimido = buf.readUInt32LE(central + 20)
  const local = buf.readUInt32LE(central + 42)
  const datos = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
  const bruto = buf.subarray(datos, datos + comprimido)
  // Fecha del archivo dentro del .zip (formato MS-DOS): la de la DGII.
  const d = buf.readUInt16LE(central + 14)
  const fecha = `${1980 + (d >> 9)}-${String((d >> 5) & 15).padStart(2, '0')}-${String(d & 31).padStart(2, '0')}`
  if (metodo === 0) return { datos: bruto, fecha }
  if (metodo === 8) return { datos: inflateRawSync(bruto), fecha }
  throw new Error(`Compresión del .zip no soportada (${metodo}).`)
}

const limpio = s => s.replace(/\s+/g, ' ').trim()

export function leerPadron(texto) {
  const registros = []
  const raros = []
  let buf = ''
  for (const linea of texto.split(/\r\n|\n/)) {
    buf = buf ? `${buf} ${linea}` : linea
    const c = buf.split('|')
    if (c.length < 11) continue
    buf = ''
    const rnc = c[0].trim()
    const estado = ESTADOS[c[9].trim()]
    if (!/^\d{9}$|^\d{11}$/.test(rnc) || !estado) {
      raros.push(rnc)
      continue
    }
    registros.push({
      rnc,
      razonSocial: limpio(c[1]),
      nombreComercial: limpio(c[2]),
      actividad: limpio(c[3]),
      estado,
      regimen: REGIMENES[c[10].trim()] ?? '',
    })
  }
  return { registros, raros }
}

// Agrupa por prefijo y parte los grupos grandes un dígito más, hasta que
// cada pedazo comprimido quepa en MAXIMO_BYTES.
function partir(registros, linea, prefijo = '') {
  const grupos = new Map()
  for (const r of registros) {
    const k = r.rnc.slice(0, prefijo.length + (prefijo ? 1 : 3))
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(r)
  }
  const salida = []
  for (const [k, lista] of [...grupos].sort(([a], [b]) => a.localeCompare(b))) {
    const gz = gzipSync(Buffer.from(lista.map(linea).join('\n'), 'utf8'), { level: 9 })
    const sePuedePartir = lista.some(r => r.rnc.length > k.length + 1)
    if (gz.length > MAXIMO_BYTES && sePuedePartir) salida.push(...partir(lista, linea, k))
    else salida.push({ prefijo: k, gz, cantidad: lista.length })
  }
  return salida
}

function main() {
  const ruta = process.argv[2]
  if (!ruta) {
    console.error('Uso: node scripts/padron-rnc.mjs ruta/al/DGII_RNC.zip')
    process.exit(1)
  }
  const archivo = readFileSync(ruta)
  const { datos: crudo, fecha } = archivo.readUInt32LE(0) === 0x04034b50
    ? leerZip(archivo)
    : { datos: archivo, fecha: statSync(ruta).mtime.toISOString().slice(0, 10) }
  const { registros, raros } = leerPadron(crudo.toString('latin1'))
  if (registros.length < 100_000) throw new Error(`Solo ${registros.length} registros: ¿es el padrón completo de la DGII?`)

  const actividades = [...new Set(registros.map(r => r.actividad))].sort((a, b) => a.localeCompare(b, 'es'))
  const indiceActividad = new Map(actividades.map((a, i) => [a, i]))
  const linea = r => [r.rnc, r.razonSocial, r.nombreComercial, indiceActividad.get(r.actividad), r.estado, r.regimen].join('\t')
  const pedazos = partir(registros, linea)

  rmSync(DESTINO, { recursive: true, force: true })
  mkdirSync(DESTINO, { recursive: true })
  for (const p of pedazos) writeFileSync(join(DESTINO, `${p.prefijo}.tsv.gz`), p.gz)
  writeFileSync(join(DESTINO, 'indice.json'), JSON.stringify({
    fuente: 'DGII, padrón de RNC (DGII_RNC.TXT)',
    fechaArchivo: fecha,
    generado: new Date().toISOString().slice(0, 10),
    registros: registros.length,
    actividades,
    prefijos: pedazos.map(p => p.prefijo),
  }))

  const total = pedazos.reduce((s, p) => s + p.gz.length, 0)
  const mayor = Math.max(...pedazos.map(p => p.gz.length))
  console.log(`${registros.length} registros, ${actividades.length} actividades, ${pedazos.length} pedazos.`)
  console.log(`Total comprimido: ${(total / 1e6).toFixed(1)} MB; pedazo mayor: ${(mayor / 1e3).toFixed(0)} KB.`)
  if (raros.length) console.log(`${raros.length} líneas descartadas (RNC o estado no reconocido): ${raros.slice(0, 5).join(', ')}…`)
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main()
