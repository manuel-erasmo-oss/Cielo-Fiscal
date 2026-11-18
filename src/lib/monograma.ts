// Iniciales del monograma de una empresa (ver src/components/ui/Monograma.tsx).

// Palabras que no cuentan para las iniciales (forma jurídica y conectores).
const IGNORADAS = new Set(['srl', 'sas', 'sa', 'eirl', 'de', 'del', 'la', 'las', 'los', 'el', 'y', '&'])

export function iniciales(nombre: string): string {
  const palabras = nombre
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(p => p && !IGNORADAS.has(p.toLowerCase()))
  if (palabras.length === 0) return '?'
  const [a, b] = palabras
  return ((a[0] ?? '') + (b?.[0] ?? a[1] ?? '')).toUpperCase()
}
