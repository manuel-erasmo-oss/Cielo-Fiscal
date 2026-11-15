/** @type {import('next').NextConfig} */
const nextConfig = {
  // A propósito SIN `output: 'export'` (a diferencia de Cielo Cloud Nómina):
  // este producto necesita API routes de servidor (OCR con la API key de
  // Anthropic, verificación de ID token con Firebase Admin). Ver CLAUDE.md.
  serverExternalPackages: ['firebase-admin'],
}

export default nextConfig
