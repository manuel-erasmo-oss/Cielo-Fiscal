/** @type {import('next').NextConfig} */
const nextConfig = {
  // A propósito SIN `output: 'export'` (a diferencia de Cielo Cloud Nómina):
  // este producto necesita API routes de servidor (OCR con la API key de
  // Anthropic, verificación de ID token con Firebase Admin). Ver CLAUDE.md.
  serverExternalPackages: ['firebase-admin'],
  // Desde el 2026-11-18 las pantallas de trabajo viven dentro de una empresa
  // (/empresa/<id>/...). Las direcciones viejas llevan a "Tus empresas" para
  // elegir primero la empresa.
  async redirects() {
    return ['/clientes', '/facturas', '/lote', '/reportes'].map(source => ({ source, destination: '/', permanent: false }))
  },
}

export default nextConfig
