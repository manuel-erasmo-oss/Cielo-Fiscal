# Cielo-Fiscal
Este es el repositorio para el desarrollo de cielo fiscal.

Contexto, decisiones y estado verificado del proyecto: ver [`CLAUDE.md`](CLAUDE.md).

```bash
npm install
cp .env.example .env.local   # y rellenar los valores (solo hacen falta para el OCR)
npm run dev                  # http://localhost:3000
npm test                     # pruebas de la lógica
```

Los datos (clientes y facturas) se guardan en el navegador. El único
servidor es la ruta que lee facturas con IA, que necesita
`ANTHROPIC_API_KEY` y `OCR_CODIGO_ACCESO`.
