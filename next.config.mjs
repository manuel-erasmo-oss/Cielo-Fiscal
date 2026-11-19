/** @type {import('next').NextConfig} */
const nextConfig = {
  // A propósito SIN `output: 'export'` (a diferencia de Cielo Cloud Nómina):
  // este producto necesita API routes de servidor (OCR con la API key de
  // Anthropic, verificación de ID token con Firebase Admin). Ver CLAUDE.md.
  serverExternalPackages: ['firebase-admin'],
  // Desde el 2026-11-18 las pantallas de trabajo viven dentro de una empresa
  // (/empresa/<id>/...). Las direcciones viejas llevan a "Tus empresas" para
  // elegir primero la empresa.
  // El mismo día "Facturas" se dividió en "Ingresos" y "Costos y gastos": las
  // direcciones viejas de una empresa llevan a Costos y gastos (donde vivía
  // casi todo: las compras del 606).
  async redirects() {
    return [
      ...['/clientes', '/facturas', '/lote', '/reportes'].map(source => ({ source, destination: '/', permanent: false })),
      { source: '/empresa/:id/facturas', destination: '/empresa/:id/costos-gastos', permanent: false },
      { source: '/empresa/:id/lote', destination: '/empresa/:id/costos-gastos/lote', permanent: false },
    ]
  },
}

export default nextConfig
