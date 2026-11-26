import { Grid3x3, Loader2, RefreshCw, Sparkles, SpellCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api, mensajeDeError } from '../api'
import { useIdioma } from '../i18n'
import type { Concepto, Materia } from '../types'
import { Aviso, Boton, campo } from './ui'

/** Saca tildes y pasa a mayúsculas: "Núcleo" -> "NUCLEO" (la Ñ se mantiene). */
function normalizar(texto: string) {
  return texto
    .toUpperCase()
    .replace(/Ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'Ñ')
    .replace(/[^A-ZÑ]/g, '')
}

/** Juegos con las palabras clave de tus apuntes: ahorcado y sopa de letras. */
export default function Juegos({ materia, onCambio }: { materia: Materia; onCambio: () => void }) {
  const { t } = useIdioma()
  const j = t.juegos
  const [tema, setTema] = useState('')
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [juego, setJuego] = useState<'ahorcado' | 'sopa'>('ahorcado')

  async function generar() {
    setCargando(true)
    setError(null)
    try {
      const lista = await api.conceptos(materia.id, tema.trim() || null)
      setConceptos(lista.filter((c) => normalizar(c.termino).length >= 3))
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
      onCambio()
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <p className="text-sm text-stone-600 dark:text-stone-300">{j.explicacion}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder={j.temaOpcional}
            aria-label={j.temaOpcional}
            maxLength={200}
            className={`${campo} flex-1`}
          />
          <Boton onClick={generar} disabled={cargando}>
            {cargando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {conceptos ? j.otrasPalabras : j.generar}
          </Boton>
        </div>
        <p className="mt-2 text-xs text-stone-400">{j.usaIA}</p>
      </div>
      {error && <Aviso onCerrar={() => setError(null)}>{error}</Aviso>}

      {conceptos && conceptos.length > 0 && (
        <>
          <div className="inline-flex rounded-xl bg-stone-200/70 p-1 dark:bg-stone-800" role="tablist">
            {(
              [
                ['ahorcado', SpellCheck, j.ahorcado],
                ['sopa', Grid3x3, j.sopa],
              ] as const
            ).map(([id, Icono, nombre]) => (
              <button
                key={id}
                role="tab"
                aria-selected={juego === id}
                onClick={() => setJuego(id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  juego === id ? 'bg-white shadow-sm dark:bg-stone-950' : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                <Icono className="size-4" /> {nombre}
              </button>
            ))}
          </div>
          {juego === 'ahorcado' ? <Ahorcado conceptos={conceptos} /> : <Sopa conceptos={conceptos} />}
        </>
      )}
    </div>
  )
}

// --- Ahorcado ---

const MAX_ERRORES = 6
const TECLADO = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('')

function Ahorcado({ conceptos }: { conceptos: Concepto[] }) {
  const { t } = useIdioma()
  const j = t.juegos
  const [indice, setIndice] = useState(0)
  const [usadas, setUsadas] = useState<string[]>([])
  const [ganadas, setGanadas] = useState(0)
  const concepto = conceptos[indice % conceptos.length]
  const palabra = normalizar(concepto.termino)
  const errores = usadas.filter((l) => !palabra.includes(l)).length
  const gano = palabra.split('').every((l) => usadas.includes(l))
  const perdio = errores >= MAX_ERRORES
  const termino = gano || perdio

  function probar(letra: string) {
    if (termino || usadas.includes(letra)) return
    const nuevas = [...usadas, letra]
    setUsadas(nuevas)
    if (palabra.split('').every((l) => nuevas.includes(l))) setGanadas((g) => g + 1)
  }

  function siguiente() {
    setIndice((i) => i + 1)
    setUsadas([])
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
        <span>{j.palabra((indice % conceptos.length) + 1, conceptos.length)}</span>
        <span>{j.acertadas(ganadas)}</span>
      </div>
      <p className="mt-3 text-sm">
        <span className="font-medium">{j.pista}:</span> {concepto.pista}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5" aria-live="polite">
        {palabra.split('').map((l, i) => (
          <span
            key={i}
            className={`grid h-10 w-8 place-items-center border-b-2 font-mono text-xl font-bold ${
              perdio && !usadas.includes(l) ? 'border-red-400 text-red-500' : 'border-stone-400'
            }`}
          >
            {usadas.includes(l) || perdio ? l : ''}
          </span>
        ))}
      </div>
      <div className="mt-4 flex justify-center gap-1" aria-label={j.vidas(MAX_ERRORES - errores)}>
        {Array.from({ length: MAX_ERRORES }, (_, i) => (
          <span key={i} className={`size-3 rounded-full ${i < MAX_ERRORES - errores ? 'bg-rose-500' : 'bg-stone-300 dark:bg-stone-700'}`} />
        ))}
      </div>
      {termino ? (
        <div className="mt-5 text-center">
          <p className={`font-semibold ${gano ? 'text-emerald-600' : 'text-red-600'}`}>{gano ? j.bien : j.era(concepto.termino)}</p>
          <Boton className="mt-3" onClick={siguiente}>
            <RefreshCw className="size-4" /> {j.siguiente}
          </Boton>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {TECLADO.map((letra) => {
            const usada = usadas.includes(letra)
            const esta = palabra.includes(letra)
            return (
              <button
                key={letra}
                onClick={() => probar(letra)}
                disabled={usada}
                className={`size-9 rounded-lg text-sm font-semibold transition-colors ${
                  !usada
                    ? 'bg-stone-100 hover:bg-indigo-100 dark:bg-stone-800 dark:hover:bg-indigo-950'
                    : esta
                      ? 'bg-emerald-500 text-white'
                      : 'bg-stone-200 text-stone-400 dark:bg-stone-800 dark:text-stone-600'
                }`}
              >
                {letra}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Sopa de letras ---

const TAMANO = 12
const DIRECCIONES = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
] as const

interface Ubicada {
  palabra: string
  pista: string
  celdas: [number, number][]
}

function armarSopa(conceptos: Concepto[], semilla: number) {
  let a = semilla >>> 0
  const azar = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = a
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  const grilla: string[][] = Array.from({ length: TAMANO }, () => Array(TAMANO).fill(''))
  const ubicadas: Ubicada[] = []
  const palabras = conceptos
    .map((c) => ({ palabra: normalizar(c.termino), pista: c.pista }))
    .filter((p) => p.palabra.length >= 3 && p.palabra.length <= TAMANO)
    .slice(0, 8)
  for (const { palabra, pista } of palabras) {
    for (let intento = 0; intento < 200; intento++) {
      const [df, dc] = DIRECCIONES[Math.floor(azar() * DIRECCIONES.length)]
      const f0 = Math.floor(azar() * TAMANO)
      const c0 = Math.floor(azar() * TAMANO)
      const celdas: [number, number][] = palabra.split('').map((_, i) => [f0 + df * i, c0 + dc * i])
      const entra = celdas.every(
        ([f, c], i) => f >= 0 && f < TAMANO && c >= 0 && c < TAMANO && (grilla[f][c] === '' || grilla[f][c] === palabra[i]),
      )
      if (!entra) continue
      celdas.forEach(([f, c], i) => (grilla[f][c] = palabra[i]))
      ubicadas.push({ palabra, pista, celdas })
      break
    }
  }
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (const fila of grilla) for (let c = 0; c < TAMANO; c++) if (!fila[c]) fila[c] = letras[Math.floor(azar() * letras.length)]
  return { grilla, ubicadas }
}

const clave = (f: number, c: number) => `${f},${c}`

function Sopa({ conceptos }: { conceptos: Concepto[] }) {
  const { t } = useIdioma()
  const j = t.juegos
  const [semilla, setSemilla] = useState(() => Date.now())
  const { grilla, ubicadas } = useMemo(() => armarSopa(conceptos, semilla), [conceptos, semilla])
  const [encontradas, setEncontradas] = useState<string[]>([])
  const [inicio, setInicio] = useState<[number, number] | null>(null)
  const [verPistas, setVerPistas] = useState(true)

  const marcadas = new Set(ubicadas.filter((u) => encontradas.includes(u.palabra)).flatMap((u) => u.celdas.map(([f, c]) => clave(f, c))))

  /** Se toca la primera letra y después la última: si forman una palabra escondida, se marca. */
  function tocar(f: number, c: number) {
    if (!inicio) {
      setInicio([f, c])
      return
    }
    const [f0, c0] = inicio
    setInicio(null)
    const hallada = ubicadas.find((u) => {
      const primera = u.celdas[0]
      const ultima = u.celdas[u.celdas.length - 1]
      const igual = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1]
      return (igual(primera, [f0, c0]) && igual(ultima, [f, c])) || (igual(primera, [f, c]) && igual(ultima, [f0, c0]))
    })
    if (hallada && !encontradas.includes(hallada.palabra)) setEncontradas((e) => [...e, hallada.palabra])
  }

  function nueva() {
    setSemilla(Date.now())
    setEncontradas([])
    setInicio(null)
  }

  const completa = ubicadas.length > 0 && encontradas.length === ubicadas.length
  return (
    <div className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-5 lg:grid-cols-[auto_1fr] dark:border-stone-800 dark:bg-stone-900">
      <div>
        <div
          className="grid w-fit touch-manipulation gap-0.5 select-none"
          style={{ gridTemplateColumns: `repeat(${TAMANO}, minmax(0, 1fr))` }}
        >
          {grilla.map((fila, f) =>
            fila.map((letra, c) => {
              const marcada = marcadas.has(clave(f, c))
              const elegida = inicio?.[0] === f && inicio?.[1] === c
              return (
                <button
                  key={clave(f, c)}
                  onClick={() => tocar(f, c)}
                  className={`grid size-7 place-items-center rounded font-mono text-sm font-semibold sm:size-8 ${
                    elegida
                      ? 'bg-indigo-500 text-white'
                      : marcada
                        ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
                        : 'bg-stone-100 hover:bg-indigo-100 dark:bg-stone-800 dark:hover:bg-indigo-950'
                  }`}
                >
                  {letra}
                </button>
              )
            }),
          )}
        </div>
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{j.comoSopa}</p>
      </div>
      <div>
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-semibold">{j.encontradas(encontradas.length, ubicadas.length)}</p>
          <button onClick={() => setVerPistas((v) => !v)} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
            {verPistas ? j.verPalabras : j.verPistas}
          </button>
        </div>
        <ul className="mt-2 space-y-1.5 text-sm">
          {ubicadas.map((u) => {
            const ok = encontradas.includes(u.palabra)
            return (
              <li key={u.palabra} className={ok ? 'text-emerald-600 line-through dark:text-emerald-400' : ''}>
                {ok || !verPistas ? u.palabra : u.pista}
              </li>
            )
          })}
        </ul>
        {completa && <p className="mt-4 font-semibold text-emerald-600">{j.sopaCompleta}</p>}
        <Boton variante="secundario" className="mt-4" onClick={nueva}>
          <RefreshCw className="size-4" /> {j.otraSopa}
        </Boton>
      </div>
    </div>
  )
}
