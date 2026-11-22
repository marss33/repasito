import { ArrowRight, DoorOpen, Plus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../api'
import { useIdioma } from '../i18n'
import type { Sala } from '../types'
import { Aviso, Boton, campo, Esqueleto } from './ui'

export function irASala(codigo: string) {
  location.hash = `/sala/${codigo.trim().toUpperCase()}`
}

export default function Salas() {
  const { t } = useIdioma()
  const [salas, setSalas] = useState<Sala[] | null>(null)
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .salas()
      .then(setSalas)
      .catch((e) => {
        setSalas([])
        setError(mensajeDeError(e))
      })
  }, [])

  async function crear() {
    setCreando(true)
    setError(null)
    try {
      irASala((await api.crearSala(nombre)).codigo)
    } catch (e) {
      setError(mensajeDeError(e))
      setCreando(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Users className="size-6 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-2xl font-semibold tracking-tight">{t.sala.titulo}</h1>
        </div>
        <p className="mt-1 max-w-2xl text-stone-500 dark:text-stone-400">{t.sala.detalle}</p>
      </header>

      {error && <Aviso onCerrar={() => setError(null)}>{error}</Aviso>}

      <div className="grid gap-4 md:grid-cols-2">
        <form
          className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"
          onSubmit={(e) => {
            e.preventDefault()
            if (nombre.trim()) crear()
          }}
        >
          <h2 className="flex items-center gap-2 font-semibold">
            <Plus className="size-4" /> {t.sala.crear}
          </h2>
          <label className="mt-3 block">
            <span className="text-sm font-medium">{t.sala.nombre}</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={80}
              placeholder={t.sala.ejemploNombre}
              className={campo}
            />
          </label>
          <Boton type="submit" className="mt-4 w-full" disabled={!nombre.trim()} cargando={creando}>
            {t.sala.crear}
          </Boton>
        </form>

        <form
          className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"
          onSubmit={(e) => {
            e.preventDefault()
            if (codigo.trim()) irASala(codigo)
          }}
        >
          <h2 className="flex items-center gap-2 font-semibold">
            <DoorOpen className="size-4" /> {t.sala.unirse}
          </h2>
          <label className="mt-3 block">
            <span className="text-sm font-medium">{t.sala.codigo}</span>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={8}
              placeholder="K7Q2PX"
              className={`${campo} font-mono tracking-[0.3em] uppercase`}
            />
          </label>
          <Boton type="submit" variante="secundario" className="mt-4 w-full" disabled={codigo.length < 4}>
            {t.sala.entrar} <ArrowRight className="size-4" />
          </Boton>
        </form>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wider text-stone-400 uppercase">{t.sala.tusSalas}</h2>
        {salas === null ? (
          <Esqueleto filas={2} />
        ) : salas.length === 0 ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">{t.sala.sinSalas}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {salas.map((sala) => (
              <li key={sala.codigo}>
                <button
                  onClick={() => irASala(sala.codigo)}
                  className="flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 text-left transition-colors hover:border-indigo-400 dark:border-stone-800 dark:bg-stone-900"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{sala.nombre}</p>
                    <p className="text-sm text-stone-500 dark:text-stone-400">
                      <span className="font-mono">{sala.codigo}</span> · {t.sala.personasAhora(sala.personas)}
                    </p>
                  </div>
                  {sala.personas > 0 && <span className="size-2.5 shrink-0 rounded-full bg-emerald-500" />}
                  <ArrowRight className="size-4 shrink-0 text-stone-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
