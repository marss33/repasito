import { AlertTriangle, Loader2, X } from 'lucide-react'
import { Component, lazy, Suspense, useEffect, type ButtonHTMLAttributes, type ErrorInfo, type ReactNode } from 'react'
import { useIdioma } from '../i18n'
import type { PropsMarkdown } from './MarkdownCompleto'
import { esErrorDeVersion, recargarPorVersionNueva } from '../version'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro'

const estilos: Record<Variante, string> = {
  primario: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 disabled:bg-indigo-400 dark:disabled:bg-indigo-900',
  secundario:
    'border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800',
  fantasma: 'text-stone-600 hover:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-800',
  peligro: 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950',
}

interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  cargando?: boolean
}

export function Boton({ variante = 'primario', cargando, className = '', children, disabled, ...props }: BotonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed ${estilos[variante]} ${className}`}
      disabled={disabled || cargando}
      {...props}
    >
      {cargando && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Aviso({
  tipo = 'error',
  children,
  onCerrar,
}: {
  tipo?: 'error' | 'info' | 'exito'
  children: ReactNode
  onCerrar?: () => void
}) {
  const { t } = useIdioma()
  const colores = {
    error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200',
    info: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
    exito: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
  }
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${colores[tipo]}`}
      role={tipo === 'error' ? 'alert' : 'status'}
    >
      <div className="flex-1">{children}</div>
      {onCerrar && (
        <button onClick={onCerrar} className="opacity-60 hover:opacity-100" aria-label={t.cerrar}>
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

const MarkdownCompleto = lazy(() => import('./MarkdownCompleto'))

/** Markdown con fórmulas. Mientras se carga la librería muestra el texto tal cual. */
export function Markdown(props: PropsMarkdown) {
  const mientras = props.enLinea ? <span>{props.texto}</span> : <div className="whitespace-pre-wrap">{props.texto}</div>
  return (
    <Suspense fallback={mientras}>
      <MarkdownCompleto {...props} />
    </Suspense>
  )
}

export function Modal({
  titulo,
  children,
  acciones,
  onCerrar,
}: {
  titulo: string
  children: ReactNode
  acciones?: ReactNode
  onCerrar: () => void
}) {
  const { t } = useIdioma()
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', alPresionar)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', alPresionar)
      document.body.style.overflow = overflow
    }
  }, [onCerrar])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <div className="flex items-center gap-3 border-b border-stone-200 px-6 py-4 dark:border-stone-800">
          <h2 className="flex-1 truncate font-semibold">{titulo}</h2>
          {acciones}
          <Boton variante="fantasma" onClick={onCerrar} aria-label={t.cerrar} className="px-2">
            <X className="size-4" />
          </Boton>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

export function Vacio({ icono, titulo, children }: { icono: ReactNode; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-stone-300 px-6 py-14 text-center dark:border-stone-700">
      <div className="mb-3 text-stone-400">{icono}</div>
      <p className="font-medium">{titulo}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">{children}</div>}
    </div>
  )
}

/** Bloques grises animados mientras se carga una lista. */
export function Esqueleto({ filas = 3, alto = 'h-16' }: { filas?: number; alto?: string }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className={`${alto} animate-pulse rounded-xl bg-stone-200/70 dark:bg-stone-800/70`} />
      ))}
    </div>
  )
}

export const campo =
  'mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-950'

/** Si algo falla al dibujar la pantalla, muestra un mensaje en vez de dejarla en blanco. */
export class Atrapaerrores extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }

  static getDerivedStateFromError() {
    return { error: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
    // Se publicó una versión nueva mientras se usaba: se recarga sola en vez de mostrar el error
    if (esErrorDeVersion(error)) recargarPorVersionNueva()
  }

  render() {
    return this.state.error ? <PantallaDeError /> : this.props.children
  }
}

function PantallaDeError() {
  const { t } = useIdioma()
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 px-6 text-center">
      <AlertTriangle className="size-8 text-amber-500" />
      <p className="font-medium">{t.algoSalioMal}</p>
      <Boton onClick={() => location.reload()}>{t.recargar}</Boton>
    </div>
  )
}
