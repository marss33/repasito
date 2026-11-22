import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ProveedorIdioma } from './i18n'
import './index.css'
import './tema'
import { recargarPorVersionNueva } from './version'
import '@fontsource/pixelify-sans/400.css'
import '@fontsource/pixelify-sans/600.css'

// Si mientras se usa la app se publica una versión nueva, los archivos viejos dejan de existir y
// abrir una pantalla que todavía no se había cargado (resumen, pizarra…) fallaría. En ese caso
// se recarga sola, una vez, para traer la versión nueva.
window.addEventListener('vite:preloadError', (evento) => {
  if (recargarPorVersionNueva()) evento.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorIdioma>
      <App />
    </ProveedorIdioma>
  </StrictMode>,
)
