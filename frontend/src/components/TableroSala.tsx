import { CheckSquare, Pin, Plus, Square, Target, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, mensajeDeError } from '../api'
import { useIdioma } from '../i18n'
import type { ItemTablero, Usuario } from '../types'
import { Aviso, campo } from './ui'

/** El tablero de la sala: metas del grupo (se tildan al cumplirlas) y notas fijadas. */
export default function TableroSala({
  codigo,
  usuario,
  creadorId,
  cambios,
}: {
  codigo: string
  usuario: Usuario
  creadorId: number | null
  cambios: number // aumenta cuando alguien cambia algo (llega por la sala en vivo)
}) {
  const { t } = useIdioma()
  const tb = t.tablero
  const [items, setItems] = useState<ItemTablero[]>([])
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    api
      .tablero(codigo)
      .then(setItems)
      .catch((e) => setError(mensajeDeError(e)))
  }, [codigo])
  useEffect(cargar, [cargar, cambios])

  async function hacer(accion: () => Promise<unknown>) {
    setError(null)
    try {
      await accion()
      cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  const metas = items.filter((i) => i.tipo === 'meta')
  const notas = items.filter((i) => i.tipo === 'nota')
  const cumplidas = metas.filter((m) => m.hecho).length
  const puedeBorrar = (i: ItemTablero) => i.usuario_id === usuario.id || creadorId === usuario.id

  return (
    <section className="grid gap-4 md:grid-cols-2">
      {error && (
        <div className="md:col-span-2">
          <Aviso onCerrar={() => setError(null)}>{error}</Aviso>
        </div>
      )}

      <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-emerald-600" />
          <h2 className="flex-1 font-semibold">{tb.metas}</h2>
          {metas.length > 0 && (
            <span className="text-xs text-stone-500 tabular-nums dark:text-stone-400">{tb.progreso(cumplidas, metas.length)}</span>
          )}
        </div>
        {metas.length > 0 && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
              style={{ width: `${(cumplidas / metas.length) * 100}%` }}
            />
          </div>
        )}
        <ul className="mt-3 space-y-1">
          {metas.map((m) => (
            <li key={m.id} className="group flex items-start gap-2 text-sm">
              <button
                onClick={() => hacer(() => api.tildarMeta(codigo, m.id, !m.hecho))}
                className="mt-0.5 shrink-0 text-emerald-600"
                aria-label={m.hecho ? tb.desmarcar : tb.marcar}
                title={m.hecho ? tb.desmarcar : tb.marcar}
              >
                {m.hecho ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
              </button>
              <span className="min-w-0 flex-1 break-words">
                <span className={m.hecho ? 'text-stone-400 line-through' : ''}>{m.texto}</span>
                {m.hecho && m.hecho_por && <span className="ml-1 text-xs text-stone-400">· {tb.cumplidaPor(m.hecho_por)}</span>}
              </span>
              {puedeBorrar(m) && <BotonBorrar onClick={() => hacer(() => api.borrarDelTablero(codigo, m.id))} />}
            </li>
          ))}
          {metas.length === 0 && <li className="text-sm text-stone-400">{tb.sinMetas}</li>}
        </ul>
        <Agregar placeholder={tb.nuevaMeta} onAgregar={(texto) => hacer(() => api.agregarAlTablero(codigo, 'meta', texto))} />
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
        <div className="flex items-center gap-2">
          <Pin className="size-4 text-amber-600" />
          <h2 className="flex-1 font-semibold">{tb.notas}</h2>
        </div>
        <ul className="mt-3 space-y-2">
          {notas.map((n) => (
            <li key={n.id} className="group flex items-start gap-2 text-sm">
              <span className="min-w-0 flex-1 break-words">
                {n.texto}
                <span className="ml-1 text-xs text-stone-500 dark:text-stone-400">· {n.por}</span>
              </span>
              {puedeBorrar(n) && <BotonBorrar onClick={() => hacer(() => api.borrarDelTablero(codigo, n.id))} />}
            </li>
          ))}
          {notas.length === 0 && <li className="text-sm text-stone-500 dark:text-stone-400">{tb.sinNotas}</li>}
        </ul>
        <Agregar placeholder={tb.nuevaNota} onAgregar={(texto) => hacer(() => api.agregarAlTablero(codigo, 'nota', texto))} />
      </div>
    </section>
  )
}

function BotonBorrar({ onClick }: { onClick: () => void }) {
  const { t } = useIdioma()
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded p-0.5 text-stone-400 opacity-60 hover:text-red-500 group-hover:opacity-100"
      aria-label={t.tablero.borrar}
      title={t.tablero.borrar}
    >
      <Trash2 className="size-3.5" />
    </button>
  )
}

function Agregar({ placeholder, onAgregar }: { placeholder: string; onAgregar: (texto: string) => Promise<void> }) {
  const { t } = useIdioma()
  const [texto, setTexto] = useState('')
  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    await onAgregar(texto.trim())
    setTexto('')
  }
  return (
    <form onSubmit={enviar} className="mt-3 flex gap-2">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={200}
        className={`${campo} min-w-0 flex-1 py-1.5 text-sm`}
      />
      <button
        type="submit"
        disabled={!texto.trim()}
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-stone-800 text-white disabled:opacity-40 dark:bg-stone-200 dark:text-stone-900"
        aria-label={t.tablero.agregar}
        title={t.tablero.agregar}
      >
        <Plus className="size-4" />
      </button>
    </form>
  )
}
