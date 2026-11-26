import { BarChart3, Plus, SmilePlus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useIdioma } from '../i18n'
import type { MensajeSala } from '../types'

export const EMOJIS = ['👍', '❤️', '😂', '😮', '🎉', '🔥']

/** Las reacciones de un mensaje y el botón para sumar una. */
export function Reacciones({
  mensaje,
  usuarioId,
  propio,
  enviar,
}: {
  mensaje: MensajeSala
  usuarioId: number
  propio: boolean
  enviar: (m: object) => void
}) {
  const { t } = useIdioma()
  const [eligiendo, setEligiendo] = useState(false)
  const reacciones = Object.entries(mensaje.reacciones ?? {}).filter(([, ids]) => ids.length > 0)
  const reaccionar = (emoji: string) => {
    enviar({ tipo: 'reaccion', mensaje_id: mensaje.id, emoji })
    setEligiendo(false)
  }

  return (
    <div className={`mt-1 flex flex-wrap items-center gap-1 ${propio ? 'justify-end' : ''}`}>
      {reacciones.map(([emoji, ids]) => (
        <button
          key={emoji}
          onClick={() => reaccionar(emoji)}
          className={`rounded-full border px-1.5 py-0.5 text-xs tabular-nums ${
            ids.includes(usuarioId)
              ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/60'
              : 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900'
          }`}
        >
          {emoji} {ids.length}
        </button>
      ))}
      {eligiendo ? (
        <span className="flex items-center gap-0.5 rounded-full border border-stone-200 bg-white px-1 py-0.5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => reaccionar(emoji)}
              className="rounded-full px-1 text-base hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              {emoji}
            </button>
          ))}
          <button onClick={() => setEligiendo(false)} className="px-0.5 text-stone-400" aria-label={t.sala.cerrar}>
            <X className="size-3.5" />
          </button>
        </span>
      ) : (
        <button
          onClick={() => setEligiendo(true)}
          className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800"
          aria-label={t.chatExtras.reaccionar}
          title={t.chatExtras.reaccionar}
        >
          <SmilePlus className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/** Una encuesta del chat: se vota tocando una opción (tocarla otra vez saca el voto). */
export function Encuesta({ mensaje, usuarioId, enviar }: { mensaje: MensajeSala; usuarioId: number; enviar: (m: object) => void }) {
  const { t } = useIdioma()
  const encuesta = mensaje.encuesta!
  const total = encuesta.votos.reduce((suma, ids) => suma + ids.length, 0)
  return (
    <div className="mt-0.5 w-64 max-w-full rounded-2xl border border-stone-200 bg-white p-3 text-left text-sm dark:border-stone-700 dark:bg-stone-900">
      <p className="flex items-start gap-1.5 font-semibold">
        <BarChart3 className="mt-0.5 size-4 shrink-0 text-indigo-500" /> {mensaje.texto}
      </p>
      <div className="mt-2 space-y-1.5">
        {encuesta.opciones.map((opcion, i) => {
          const votos = encuesta.votos[i] ?? []
          const mio = votos.includes(usuarioId)
          const porcentaje = total ? Math.round((votos.length / total) * 100) : 0
          return (
            <button
              key={i}
              onClick={() => enviar({ tipo: 'votar', mensaje_id: mensaje.id, opcion: i })}
              className={`relative block w-full overflow-hidden rounded-lg border px-2.5 py-1.5 text-left ${
                mio ? 'border-indigo-400' : 'border-stone-200 dark:border-stone-700'
              }`}
            >
              <span
                className="absolute inset-y-0 left-0 bg-indigo-100 transition-[width] duration-300 dark:bg-indigo-950/70"
                style={{ width: `${porcentaje}%` }}
                aria-hidden
              />
              <span className="relative flex items-center gap-2">
                <span className="min-w-0 flex-1 break-words">{opcion}</span>
                <span className="text-xs text-stone-500 tabular-nums dark:text-stone-400">{votos.length}</span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-stone-400">{t.chatExtras.votos(total)}</p>
    </div>
  )
}

/** Formulario para armar una encuesta rápida en el chat. */
export function NuevaEncuesta({ enviar, onCerrar }: { enviar: (m: object) => void; onCerrar: () => void }) {
  const { t } = useIdioma()
  const ce = t.chatExtras
  const [pregunta, setPregunta] = useState('')
  const [opciones, setOpciones] = useState(['', ''])
  const listas = opciones.map((o) => o.trim()).filter(Boolean)

  function crear(e: FormEvent) {
    e.preventDefault()
    if (!pregunta.trim() || listas.length < 2) return
    enviar({ tipo: 'encuesta', pregunta: pregunta.trim(), opciones: listas })
    onCerrar()
  }

  const input =
    'w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 dark:border-stone-700 dark:bg-stone-950'
  return (
    <form onSubmit={crear} className="space-y-2 border-t border-stone-200 p-3 dark:border-stone-800">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-indigo-500" />
        <span className="flex-1 text-sm font-semibold">{ce.nuevaEncuesta}</span>
        <button type="button" onClick={onCerrar} className="text-stone-400" aria-label={t.sala.cerrar}>
          <X className="size-4" />
        </button>
      </div>
      <input value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder={ce.pregunta} maxLength={200} className={input} />
      {opciones.map((o, i) => (
        <input
          key={i}
          value={o}
          onChange={(e) => setOpciones((lista) => lista.map((x, j) => (j === i ? e.target.value : x)))}
          placeholder={ce.opcion(i + 1)}
          maxLength={80}
          className={input}
        />
      ))}
      <div className="flex gap-2">
        {opciones.length < 4 && (
          <button
            type="button"
            onClick={() => setOpciones((lista) => [...lista, ''])}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            <Plus className="size-3.5" /> {ce.otraOpcion}
          </button>
        )}
        <button
          type="submit"
          disabled={!pregunta.trim() || listas.length < 2}
          className="ml-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {ce.publicar}
        </button>
      </div>
    </form>
  )
}
