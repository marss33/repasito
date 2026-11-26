import { Check, Crown, Loader2, Paperclip, Trophy, Upload, Users, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, mensajeDeError } from '../api'
import { useIdioma } from '../i18n'
import type { Conectado, EstadoTrivia, ModoTrivia } from '../useSala'
import { Aviso, Boton, Modal, campo } from './ui'

const MAX_ARCHIVOS = 3
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']
const COLORES = [
  'bg-rose-500 hover:bg-rose-600',
  'bg-sky-500 hover:bg-sky-600',
  'bg-amber-500 hover:bg-amber-600',
  'bg-emerald-500 hover:bg-emerald-600',
  'bg-violet-500 hover:bg-violet-600',
  'bg-teal-500 hover:bg-teal-600',
]

/** Segundos que faltan para `fin`, según el reloj del servidor; se actualiza solo. */
function useRestante(fin: number, ahoraServidor: () => number) {
  const [restante, setRestante] = useState(() => Math.max(0, fin - ahoraServidor()))
  useEffect(() => {
    const actualizar = () => setRestante(Math.max(0, fin - ahoraServidor()))
    actualizar()
    const id = window.setInterval(actualizar, 200)
    return () => window.clearInterval(id)
  }, [fin, ahoraServidor])
  return restante
}

/** La trivia grupal: se arma con archivos, se juega todos a la vez y gana el más rápido. */
export default function TriviaSala({
  codigo,
  usuarioId,
  conectados,
  trivia,
  preparando,
  ahoraServidor,
  enviar,
  onCerrar,
}: {
  codigo: string
  usuarioId: number
  conectados: Conectado[]
  trivia: EstadoTrivia | null
  preparando: { por: string; tema: string } | null
  ahoraServidor: () => number
  enviar: (m: object) => void
  onCerrar: () => void
}) {
  const { t } = useIdioma()
  const tr = t.trivia
  return (
    <Modal titulo={trivia ? `${tr.titulo} · ${trivia.tema}` : tr.titulo} onCerrar={onCerrar}>
      {trivia ? (
        <Partida trivia={trivia} usuarioId={usuarioId} ahoraServidor={ahoraServidor} enviar={enviar} />
      ) : preparando ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Loader2 className="mb-3 size-8 animate-spin text-indigo-500" />
          <p className="font-medium">{tr.preparando(preparando.por, preparando.tema)}</p>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{tr.preparandoDetalle}</p>
        </div>
      ) : (
        <Crear codigo={codigo} usuarioId={usuarioId} conectados={conectados} />
      )}
    </Modal>
  )
}

const MODOS: ModoTrivia[] = ['opciones', 'vf', 'completar', 'rapido']
const DIFICULTADES = ['facil', 'media', 'dificil'] as const
const CANTIDADES = [5, 8, 10, 15]

function Crear({ codigo, usuarioId, conectados }: { codigo: string; usuarioId: number; conectados: Conectado[] }) {
  const { t } = useIdioma()
  const tr = t.trivia
  const [tema, setTema] = useState('')
  const [modo, setModo] = useState<ModoTrivia>('opciones')
  const [dificultad, setDificultad] = useState<(typeof DIFICULTADES)[number]>('media')
  const [cantidad, setCantidad] = useState(8)
  const [rival, setRival] = useState<number | null>(null)
  const otros = conectados.filter((c) => c.id !== usuarioId)
  const [archivos, setArchivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  async function crear(e: FormEvent) {
    e.preventDefault()
    if (!archivos.length) return
    setEnviando(true)
    setError(null)
    try {
      await api.crearTrivia(codigo, tema.trim(), archivos, { modo, dificultad, cantidad, rival })
      // Desde acá avisa la sala: "preparando" y después la invitación
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={crear} className="space-y-4">
      <p className="text-sm text-stone-600 dark:text-stone-300">{tr.explicacion}</p>
      <label className="block">
        <span className="text-sm font-medium">{tr.tema}</span>
        <input
          value={tema}
          onChange={(e) => setTema(e.target.value)}
          placeholder={tr.temaEjemplo}
          maxLength={120}
          className={`${campo} mt-1 w-full`}
        />
      </label>
      <div>
        <span className="text-sm font-medium">{tr.modo}</span>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {MODOS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              aria-pressed={modo === m}
              className={`rounded-lg border px-2.5 py-2 text-left text-sm ${
                modo === m
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200'
                  : 'border-stone-200 hover:border-indigo-300 dark:border-stone-700'
              }`}
            >
              <span className="block font-medium">{tr.modos[m].nombre}</span>
              <span className="block text-xs text-stone-500 dark:text-stone-400">{tr.modos[m].detalle}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium">{tr.dificultad}</span>
          <select
            value={dificultad}
            onChange={(e) => setDificultad(e.target.value as (typeof DIFICULTADES)[number])}
            className={`${campo} mt-1 w-full`}
          >
            {DIFICULTADES.map((d) => (
              <option key={d} value={d}>
                {tr.dificultades[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">{tr.cantidad}</span>
          <select value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className={`${campo} mt-1 w-full`}>
            {CANTIDADES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium">{tr.paraQuien}</span>
        <select
          value={rival ?? ''}
          onChange={(e) => setRival(e.target.value ? Number(e.target.value) : null)}
          className={`${campo} mt-1 w-full`}
        >
          <option value="">{tr.todaLaSala}</option>
          {otros.map((c) => (
            <option key={c.id} value={c.id}>
              {tr.dueloCon(c.nombre)}
            </option>
          ))}
        </select>
      </label>
      <div>
        <span className="text-sm font-medium">{tr.archivos}</span>
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 px-4 py-5 text-sm text-stone-600 hover:border-indigo-400 dark:border-stone-700 dark:text-stone-300"
        >
          <Upload className="size-4" /> {tr.elegirArchivos(MAX_ARCHIVOS)}
        </button>
        <input
          ref={entrada}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const nuevos = Array.from(e.target.files ?? [])
            setArchivos((a) => [...a, ...nuevos].slice(0, MAX_ARCHIVOS))
            e.target.value = ''
          }}
        />
        {archivos.length > 0 && (
          <ul className="mt-2 space-y-1">
            {archivos.map((a, i) => (
              <li key={`${a.name}-${i}`} className="flex items-center gap-2 text-sm">
                <Paperclip className="size-3.5 shrink-0 text-stone-400" />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <button
                  type="button"
                  onClick={() => setArchivos((lista) => lista.filter((_, j) => j !== i))}
                  className="rounded p-1 text-stone-400 hover:text-red-500"
                  aria-label={tr.quitar}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <Aviso onCerrar={() => setError(null)}>{error}</Aviso>}
      <p className="text-xs text-stone-400">{tr.usaTuIA}</p>
      <Boton type="submit" className="w-full" disabled={!archivos.length || enviando}>
        {enviando ? <Loader2 className="size-4 animate-spin" /> : <Trophy className="size-4" />} {tr.crear}
      </Boton>
    </form>
  )
}

function Partida({
  trivia,
  usuarioId,
  ahoraServidor,
  enviar,
}: {
  trivia: EstadoTrivia
  usuarioId: number
  ahoraServidor: () => number
  enviar: (m: object) => void
}) {
  const { t } = useIdioma()
  const tr = t.trivia
  const restante = useRestante(trivia.fin, ahoraServidor)
  const yo = trivia.jugadores.find((j) => j.id === usuarioId)
  const soyCreador = trivia.creador_id === usuarioId
  // La respuesta propia se recuerda acá (el servidor solo dice que respondí, no qué)
  const [miRespuesta, setMiRespuesta] = useState<{ indice: number; opcion: number } | null>(null)
  const elegida = miRespuesta?.indice === trivia.indice ? miRespuesta.opcion : null

  function responder(opcion: number) {
    if (elegida !== null || yo?.respondio) return
    setMiRespuesta({ indice: trivia.indice, opcion })
    enviar({ tipo: 'trivia', accion: 'responder', opcion })
  }

  const puedoJugar = trivia.rival === null || trivia.rival === usuarioId || soyCreador
  const unirme = !yo && puedoJugar && trivia.fase !== 'terminada' && (
    <Boton className="w-full" onClick={() => enviar({ tipo: 'trivia', accion: 'unirme' })}>
      <Users className="size-4" /> {tr.unirme}
    </Boton>
  )

  if (trivia.fase === 'invitando') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-stone-600 dark:text-stone-300">
          {trivia.rival_nombre ? tr.invitandoDuelo(trivia.creador, trivia.rival_nombre) : tr.invitando(trivia.creador, trivia.total)}
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          {tr.modos[trivia.modo].nombre} · {tr.dificultades[trivia.dificultad]} · {tr.preguntas(trivia.total)}
        </p>
        <Jugadores trivia={trivia} usuarioId={usuarioId} />
        <p className="text-center text-sm text-stone-500 tabular-nums dark:text-stone-400">{tr.empiezaEn(Math.ceil(restante))}</p>
        {unirme}
        {soyCreador && (
          <Boton className="w-full" onClick={() => enviar({ tipo: 'trivia', accion: 'empezar' })}>
            {tr.empezarYa}
          </Boton>
        )}
      </div>
    )
  }

  if (trivia.fase === 'terminada') {
    const [primero] = trivia.jugadores
    return (
      <div className="space-y-4 text-center">
        <Trophy className="mx-auto size-10 text-amber-500" />
        <p className="text-lg font-semibold">{primero ? tr.gano(primero.nombre) : tr.terminada}</p>
        <Jugadores trivia={trivia} usuarioId={usuarioId} final />
        <p className="text-xs text-stone-500 dark:text-stone-400">{tr.premios}</p>
        <Boton variante="secundario" className="w-full" onClick={() => enviar({ tipo: 'trivia', accion: 'cerrar' })}>
          {tr.cerrar}
        </Boton>
      </div>
    )
  }

  const pregunta = trivia.pregunta
  if (!pregunta) return null
  const revelando = trivia.fase === 'revelando'
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs font-medium text-stone-500 dark:text-stone-400">
        <span>{tr.pregunta(trivia.indice + 1, trivia.total)}</span>
        {!revelando && <span className="tabular-nums">{Math.ceil(restante)} s</span>}
      </div>
      {!revelando && (
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
          <div
            className="h-full rounded-full bg-indigo-500 transition-[width] duration-200"
            style={{ width: `${(restante / trivia.segundos) * 100}%` }}
          />
        </div>
      )}
      <p className="text-lg leading-snug font-semibold">{pregunta.enunciado}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {pregunta.opciones.map((opcion, i) => {
          const correcta = revelando && pregunta.correcta === i
          const errada = revelando && elegida === i && pregunta.correcta !== i
          const apagada = (elegida !== null && elegida !== i) || (revelando && !correcta && !errada)
          return (
            <button
              key={i}
              disabled={!yo || elegida !== null || !!yo?.respondio || revelando}
              onClick={() => responder(i)}
              className={`flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 text-left font-medium text-white shadow-sm transition-all disabled:cursor-default ${
                correcta ? 'bg-emerald-600 ring-4 ring-emerald-300' : errada ? 'bg-red-600' : COLORES[i % COLORES.length]
              } ${apagada ? 'opacity-40' : ''} ${elegida === i && !revelando ? 'ring-4 ring-white/70' : ''}`}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/25 text-sm font-bold">
                {correcta ? <Check className="size-4" /> : LETRAS[i]}
              </span>
              <span className="min-w-0 flex-1">{opcion}</span>
            </button>
          )
        })}
      </div>
      {revelando && pregunta.explicacion && (
        <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm dark:bg-stone-800">{pregunta.explicacion}</p>
      )}
      {!revelando && yo && (elegida !== null || yo.respondio) && (
        <p className="text-center text-sm text-stone-500 dark:text-stone-400">{tr.esperando}</p>
      )}
      {unirme}
      <Jugadores trivia={trivia} usuarioId={usuarioId} />
    </div>
  )
}

function Jugadores({ trivia, usuarioId, final = false }: { trivia: EstadoTrivia; usuarioId: number; final?: boolean }) {
  const { t } = useIdioma()
  return (
    <ol className="space-y-1">
      {trivia.jugadores.map((j, i) => (
        <li
          key={j.id}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
            j.id === usuarioId ? 'bg-indigo-50 dark:bg-indigo-950/50' : 'bg-stone-50 dark:bg-stone-800/60'
          }`}
        >
          <span className="w-5 text-xs text-stone-400 tabular-nums">{i + 1}</span>
          {final && i === 0 && <Crown className="size-4 text-amber-500" />}
          <span className="min-w-0 flex-1 truncate text-left">{j.nombre}</span>
          {trivia.fase === 'pregunta' && j.respondio && <Check className="size-4 text-emerald-500" aria-label={t.trivia.respondio} />}
          {trivia.fase === 'revelando' && j.acerto !== null && (
            <span className={j.acerto ? 'text-emerald-600' : 'text-red-500'}>{j.acerto ? '✓' : '✗'}</span>
          )}
          <span className="font-semibold tabular-nums">{j.puntos}</span>
        </li>
      ))}
    </ol>
  )
}
