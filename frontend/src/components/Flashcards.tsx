import { Check, Download, Layers, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, mensajeDeError } from '../api'
import { useIdioma } from '../i18n'
import type { Flashcard, Materia } from '../types'
import { Aviso, Boton, Esqueleto, Markdown, Vacio } from './ui'

interface Props {
  materia: Materia
  onCambio: () => void
}

// Calidad para el algoritmo SM-2 (0 a 5), tecla y color de cada botón
const CALIFICACIONES = [
  { calidad: 1, tecla: '1', clase: 'bg-red-600 hover:bg-red-500' },
  { calidad: 3, tecla: '2', clase: 'bg-amber-600 hover:bg-amber-500' },
  { calidad: 4, tecla: '3', clase: 'bg-emerald-600 hover:bg-emerald-500' },
  { calidad: 5, tecla: '4', clase: 'bg-sky-600 hover:bg-sky-500' },
]

export default function Flashcards({ materia, onCambio }: Props) {
  const { t } = useIdioma()
  const [modo, setModo] = useState<'repasar' | 'todas'>('repasar')

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg bg-stone-200/70 p-1 dark:bg-stone-800">
        {(['repasar', 'todas'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setModo(m)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              modo === m
                ? 'bg-white shadow-sm dark:bg-stone-950'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
            }`}
          >
            {m === 'repasar' ? t.repasar : t.todas(materia.flashcards)}
          </button>
        ))}
      </div>
      {modo === 'repasar' ? <Repaso materia={materia} onCambio={onCambio} /> : <Lista materia={materia} onCambio={onCambio} />}
    </div>
  )
}

function Repaso({ materia, onCambio }: Props) {
  const { t } = useIdioma()
  const [cola, setCola] = useState<Flashcard[] | null>(null)
  const [volteada, setVolteada] = useState(false)
  const [repasadas, setRepasadas] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCola(null)
    setRepasadas(0)
    setVolteada(false)
    api
      .pendientes(materia.id)
      .then(setCola)
      .catch((e) => setError(mensajeDeError(e)))
  }, [materia.id])

  const actual = cola?.[0]

  const calificar = useCallback(
    async (calidad: number) => {
      if (!actual || guardando) return
      setGuardando(true)
      try {
        const actualizada = await api.repasar(actual.id, calidad)
        setVolteada(false)
        setRepasadas((n) => n + 1)
        // Si no te la sabías, vuelve al final de la cola
        setCola((c) => (c ? [...c.slice(1), ...(calidad < 3 ? [actualizada] : [])] : c))
        onCambio()
      } catch (e) {
        setError(mensajeDeError(e))
      } finally {
        setGuardando(false)
      }
    },
    [actual, guardando, onCambio],
  )

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (!actual || (e.target as HTMLElement).closest('input, textarea, select')) return
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        setVolteada((v) => !v)
      } else if (volteada) {
        const opcion = CALIFICACIONES.find((c) => c.tecla === e.key)
        if (opcion) calificar(opcion.calidad)
      }
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [actual, volteada, calificar])

  if (error) return <Aviso onCerrar={() => setError(null)}>{error}</Aviso>
  if (cola === null) return <Esqueleto filas={1} alto="h-72" />

  if (!actual) {
    return materia.flashcards === 0 ? (
      <Vacio icono={<Layers className="size-8" />} titulo={t.sinFlashcards}>
        {t.sinFlashcardsDetalle}
      </Vacio>
    ) : (
      <Vacio icono={<Check className="size-8 text-emerald-500" />} titulo={repasadas ? t.listoPorHoy : t.sinPendientes}>
        {repasadas ? t.repasaste(repasadas) : ''}
        {t.proximasDetalle}
      </Vacio>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-3 text-center text-sm text-stone-500 dark:text-stone-400">{t.quedan(cola.length, repasadas)}</p>

      <button className="tarjeta block h-72 w-full sm:h-80" onClick={() => setVolteada((v) => !v)} aria-label={t.darVuelta}>
        <div className={`tarjeta-interior ${volteada ? 'volteada' : ''}`}>
          <div className="tarjeta-cara border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <span className="mb-4 text-xs font-semibold tracking-wider text-indigo-600 uppercase dark:text-indigo-400">
              {t.preguntaTarjeta}
            </span>
            <span className="text-xl font-medium text-balance">
              <Markdown texto={actual.frente} enLinea />
            </span>
            <span className="mt-6 text-xs text-stone-400">{t.clickOEspacio}</span>
          </div>
          <div className="tarjeta-cara tarjeta-dorso border border-indigo-200 bg-indigo-50 shadow-sm dark:border-indigo-900 dark:bg-indigo-950/50">
            <span className="mb-4 text-xs font-semibold tracking-wider text-indigo-600 uppercase dark:text-indigo-400">
              {t.respuestaTarjeta}
            </span>
            <span className="text-lg text-balance">
              <Markdown texto={actual.dorso} enLinea />
            </span>
          </div>
        </div>
      </button>

      <div className={`mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 ${volteada ? '' : 'invisible'}`}>
        {CALIFICACIONES.map((c, i) => (
          <button
            key={c.calidad}
            onClick={() => calificar(c.calidad)}
            disabled={guardando}
            className={`rounded-lg px-3 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60 ${c.clase}`}
          >
            {t.calificaciones[i]} <span className="ml-1 hidden opacity-60 sm:inline">{c.tecla}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Lista({ materia, onCambio }: Props) {
  const { t } = useIdioma()
  const [tarjetas, setTarjetas] = useState<Flashcard[] | null>(null)
  const [editando, setEditando] = useState<number | 'nueva' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    api
      .flashcards(materia.id)
      .then(setTarjetas)
      .catch((e) => setError(mensajeDeError(e)))
  }, [materia.id])

  useEffect(cargar, [cargar])

  async function guardar(id: number | 'nueva', frente: string, dorso: string) {
    try {
      if (id === 'nueva') await api.crearFlashcard(materia.id, frente, dorso)
      else await api.editarFlashcard(id, frente, dorso)
      setEditando(null)
      cargar()
      onCambio()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  async function borrar(id: number) {
    try {
      await api.borrarFlashcard(id)
      cargar()
      onCambio()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  function cuando(fecha: string): string {
    const [a, m, d] = fecha.split('-').map(Number)
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const dias = Math.round((new Date(a, m - 1, d).getTime() - hoy.getTime()) / 86_400_000)
    if (dias <= 0) return t.hoy
    if (dias === 1) return t.manana
    return t.enDias(dias)
  }

  return (
    <div className="space-y-3">
      {error && <Aviso onCerrar={() => setError(null)}>{error}</Aviso>}

      {editando === 'nueva' ? (
        <Editor onGuardar={(f, d) => guardar('nueva', f, d)} onCancelar={() => setEditando(null)} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" onClick={() => setEditando('nueva')}>
            <Plus className="size-4" /> {t.nuevaFlashcard}
          </Boton>
          {!!tarjetas?.length && (
            <a
              href={api.urlExportarFlashcards(materia.id)}
              download
              className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-800"
              title={t.exportarAyuda}
            >
              <Download className="size-4" /> {t.exportar}
            </a>
          )}
        </div>
      )}

      {tarjetas === null && <Esqueleto filas={3} />}
      {tarjetas?.length === 0 && editando !== 'nueva' && <Vacio icono={<Layers className="size-8" />} titulo={t.materiaSinFlashcards} />}

      <ul className="space-y-2">
        {tarjetas?.map((tarjeta) =>
          editando === tarjeta.id ? (
            <li key={tarjeta.id}>
              <Editor inicial={tarjeta} onGuardar={(f, d) => guardar(tarjeta.id, f, d)} onCancelar={() => setEditando(null)} />
            </li>
          ) : (
            <li
              key={tarjeta.id}
              className="group flex gap-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  <Markdown texto={tarjeta.frente} enLinea />
                </p>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  <Markdown texto={tarjeta.dorso} enLinea />
                </p>
                <p className="mt-2 text-xs text-stone-400">{t.proximoRepaso(cuando(tarjeta.proxima))}</p>
              </div>
              <div className="flex shrink-0 items-start gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                <Boton variante="fantasma" className="px-2" onClick={() => setEditando(tarjeta.id)} aria-label={t.editar}>
                  <Pencil className="size-4" />
                </Boton>
                <Boton variante="peligro" className="px-2" onClick={() => borrar(tarjeta.id)} aria-label={t.borrar}>
                  <Trash2 className="size-4" />
                </Boton>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

function Editor({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial?: Flashcard
  onGuardar: (frente: string, dorso: string) => void
  onCancelar: () => void
}) {
  const { t } = useIdioma()
  const [frente, setFrente] = useState(inicial?.frente ?? '')
  const [dorso, setDorso] = useState(inicial?.dorso ?? '')
  const campo =
    'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-stone-700 dark:bg-stone-950'

  return (
    <form
      className="space-y-2 rounded-xl border border-indigo-300 bg-white p-4 dark:border-indigo-800 dark:bg-stone-900"
      onSubmit={(e) => {
        e.preventDefault()
        if (frente.trim() && dorso.trim()) onGuardar(frente, dorso)
      }}
    >
      <textarea
        autoFocus
        className={campo}
        rows={2}
        placeholder={t.preguntaTarjeta}
        value={frente}
        onChange={(e) => setFrente(e.target.value)}
      />
      <textarea className={campo} rows={2} placeholder={t.respuestaTarjeta} value={dorso} onChange={(e) => setDorso(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Boton type="button" variante="fantasma" onClick={onCancelar}>
          <X className="size-4" /> {t.cancelar}
        </Boton>
        <Boton type="submit" disabled={!frente.trim() || !dorso.trim()}>
          <Check className="size-4" /> {t.guardar}
        </Boton>
      </div>
    </form>
  )
}
