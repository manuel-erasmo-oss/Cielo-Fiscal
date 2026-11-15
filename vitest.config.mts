import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Las pruebas corren en la zona horaria de República Dominicana: el bug de
// fechas que este proyecto evita (ver CLAUDE.md, lección 1) solo aparece al
// oeste de UTC, así que en un servidor en UTC pasaría desapercibido.
process.env.TZ = 'America/Santo_Domingo'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
