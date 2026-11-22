import { Monitor, Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useIdioma } from './i18n'

/* Tema de la app: claro, oscuro o automático (el del sistema). Se recuerda en este dispositivo. */

export type Tema = 'claro' | 'oscuro' | 'auto'

const CLAVE = 'repasito:tema'
const CONSULTA = '(prefers-color-scheme: dark)'
const avisar = new Set<() => void>()

function leerTema(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE)
    if (guardado === 'claro' || guardado === 'oscuro') return guardado
  } catch {
    // sin almacenamiento local
  }
  return 'auto'
}

let tema: Tema = leerTema()

function esOscuro() {
  return tema === 'oscuro' || (tema === 'auto' && matchMedia(CONSULTA).matches)
}

function aplicar() {
  const oscuro = esOscuro()
  document.documentElement.classList.toggle('dark', oscuro)
  document.documentElement.style.colorScheme = oscuro ? 'dark' : 'light'
  avisar.forEach((fn) => fn())
}

aplicar()
matchMedia(CONSULTA).addEventListener('change', () => tema === 'auto' && aplicar())

export function cambiarTema(nuevo: Tema) {
  tema = nuevo
  try {
    localStorage.setItem(CLAVE, nuevo)
  } catch {
    // sin almacenamiento local: vale hasta cerrar
  }
  aplicar()
}

function suscribir(fn: () => void) {
  avisar.add(fn)
  return () => {
    avisar.delete(fn)
  }
}

export function useTema(): Tema {
  return useSyncExternalStore(suscribir, () => tema)
}

/** true si la app se está viendo oscura (por elección o porque el sistema está en oscuro). */
export function useOscuro(): boolean {
  return useSyncExternalStore(suscribir, esOscuro)
}

const OPCIONES = [
  { valor: 'claro', Icono: Sun },
  { valor: 'oscuro', Icono: Moon },
  { valor: 'auto', Icono: Monitor },
] as const

export function SelectorTema({ className = '' }: { className?: string }) {
  const { t } = useIdioma()
  const actual = useTema()
  return (
    <div
      className={`inline-flex rounded-lg bg-stone-200/70 p-0.5 text-xs font-semibold dark:bg-stone-800 ${className}`}
      role="group"
      aria-label={t.tema.titulo}
    >
      {OPCIONES.map(({ valor, Icono }) => (
        <button
          key={valor}
          onClick={() => cambiarTema(valor)}
          aria-pressed={actual === valor}
          aria-label={t.tema[valor]}
          title={t.tema[valor]}
          className={`rounded-md px-1.5 py-1 transition-colors ${
            actual === valor
              ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-950 dark:text-white'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
          }`}
        >
          <Icono className="size-3.5" />
        </button>
      ))}
    </div>
  )
}
