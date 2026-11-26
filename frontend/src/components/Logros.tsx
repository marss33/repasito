import { Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { useIdioma } from '../i18n'
import type { Logro } from '../types'
import { Esqueleto } from './ui'

/** Todos los logros con su progreso: los desbloqueados a color, los que faltan en gris. */
export default function Logros() {
  const { t } = useIdioma()
  const [logros, setLogros] = useState<Logro[] | null>(null)

  useEffect(() => {
    api
      .logros()
      .then(setLogros)
      .catch(() => setLogros([]))
  }, [])

  if (!logros) return <Esqueleto filas={3} alto="h-14" />
  const hechos = logros.filter((l) => l.logrado).length
  return (
    <div>
      <p className="text-sm text-stone-500 dark:text-stone-400">{t.logros.resumen(hechos, logros.length)}</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {logros.map((l) => {
          const nombre = t.logros.nombres[l.clave as keyof typeof t.logros.nombres] ?? l.clave
          return (
            <li
              key={l.clave}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                l.logrado
                  ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
                  : 'border-stone-200 dark:border-stone-800'
              }`}
            >
              <span className={`text-2xl ${l.logrado ? '' : 'opacity-30 grayscale'}`} aria-hidden>
                {l.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  {nombre.titulo}
                  {!l.logrado && <Lock className="size-3 text-stone-400" aria-label={t.logros.bloqueado} />}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">{nombre.detalle}</p>
                {!l.logrado && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${(l.actual / l.meta) * 100}%` }} />
                  </div>
                )}
              </div>
              <span className="shrink-0 text-xs font-semibold text-amber-700 tabular-nums dark:text-amber-300">
                {l.logrado ? '✓' : `${l.actual}/${l.meta}`} · 🪙{l.monedas}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Las insignias de alguien de la sala, para su miniperfil. */
export function Insignias({ usuarioId }: { usuarioId: number }) {
  const { t } = useIdioma()
  const [insignias, setInsignias] = useState<{ clave: string; emoji: string }[]>([])
  useEffect(() => {
    api
      .insignias(usuarioId)
      .then(setInsignias)
      .catch(() => setInsignias([]))
  }, [usuarioId])
  if (!insignias.length) return null
  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-stone-500 dark:text-stone-400">{t.logros.insignias}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {insignias.map((i) => {
          const nombre = t.logros.nombres[i.clave as keyof typeof t.logros.nombres]
          return (
            <span
              key={i.clave}
              className="grid size-9 place-items-center rounded-lg bg-amber-50 text-xl dark:bg-amber-950/40"
              title={nombre?.titulo ?? i.clave}
              aria-label={nombre?.titulo ?? i.clave}
            >
              {i.emoji}
            </span>
          )
        })}
      </div>
    </div>
  )
}
