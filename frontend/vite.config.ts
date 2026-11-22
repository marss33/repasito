import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const FUENTES = join(fileURLToPath(new URL('.', import.meta.url)), 'node_modules/@excalidraw/excalidraw/dist/prod/fonts')

/** Sirve las fuentes de la pizarra desde /fonts (en desarrollo) y las copia al compilar,
 * para no depender de un CDN (Discord no deja pedir nada a otros dominios). */
function fuentesDeLaPizarra(): Plugin {
  let salida = 'dist'
  return {
    name: 'fuentes-de-la-pizarra',
    configResolved(config) {
      salida = join(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use('/fonts', (pedido, respuesta, siguiente) => {
        const ruta = normalize(join(FUENTES, decodeURIComponent((pedido.url ?? '').split('?')[0])))
        if (!ruta.startsWith(FUENTES) || !existsSync(ruta) || !statSync(ruta).isFile()) return siguiente()
        respuesta.setHeader('Content-Type', 'font/woff2')
        createReadStream(ruta).pipe(respuesta)
      })
    },
    closeBundle() {
      cpSync(FUENTES, join(salida, 'fonts'), { recursive: true })
    },
  }
}

export default defineConfig(({ command }) => ({
  // Al compilar, todos los archivos se piden bajo /.proxy/: dentro de una actividad de Discord es la
  // única ruta que deja pasar su proxy. El servidor también la entiende, así que la web anda igual.
  base: command === 'build' ? '/.proxy/' : '/',
  plugins: [react(), tailwindcss(), fuentesDeLaPizarra()],
  // La pizarra (Excalidraw) trae piezas grandes, pero se cargan solo cuando se usan
  build: { chunkSizeWarningLimit: 2000 },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', ws: true },
    },
  },
}))
