import { CheckCircle2, ListChecks, RotateCcw, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../api'
import { useIdioma } from '../i18n'
import type { Materia, Pregunta } from '../types'
import { Aviso, Boton, campo, Markdown, Vacio } from './ui'

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']

export default function Quiz({ materia, onCambio }: { materia: Materia; onCambio: () => void }) {
  const { t } = useIdioma()
  const [tema, setTema] = useState('')
  const [cantidad, setCantidad] = useState(5)
  const [generando, setGenerando] = useState(false)
  const [preguntas, setPreguntas] = useState<Pregunta[] | null>(null)
  const [respuestas, setRespuestas] = useState<(number | null)[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPreguntas(null)
    setError(null)
  }, [materia.id])

  async function generar() {
    setGenerando(true)
    setError(null)
    try {
      const { preguntas } = await api.quiz(materia.id, tema, cantidad)
      setPreguntas(preguntas)
      setRespuestas(preguntas.map(() => null))
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGenerando(false)
      onCambio()
    }
  }

  if (materia.documentos === 0) {
    return (
      <Vacio icono={<ListChecks className="size-8" />} titulo={t.primeroSubi}>
        {t.quizSinApuntesDetalle}
      </Vacio>
    )
  }

  if (!preguntas) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
          <h3 className="font-semibold">{t.armaQuiz}</h3>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t.armaQuizDetalle}</p>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              generar()
            }}
          >
            <label className="block">
              <span className="text-sm font-medium">{t.temaOpcional}</span>
              <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder={t.ejemploTema} maxLength={200} className={campo} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t.cantidadPreguntas(cantidad)}</span>
              <input
                type="range"
                min={3}
                max={15}
                value={cantidad}
                onChange={(e) => setCantidad(Number(e.target.value))}
                className="mt-2 w-full accent-indigo-600"
              />
            </label>
            <Boton type="submit" cargando={generando} className="w-full">
              {generando ? t.armandoPreguntas : t.empezarQuiz}
            </Boton>
          </form>
        </div>
        {error && <Aviso onCerrar={() => setError(null)}>{error}</Aviso>}
      </div>
    )
  }

  const respondidas = respuestas.filter((r) => r !== null).length
  const correctas = respuestas.filter((r, i) => r === preguntas[i].correcta).length
  const proporcion = correctas / preguntas.length
  const veredicto = t.veredictos[proporcion === 1 ? 0 : proporcion >= 0.7 ? 1 : proporcion >= 0.4 ? 2 : 3]

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-stone-50/90 py-2 backdrop-blur dark:bg-stone-950/90">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
          <div className="h-full bg-indigo-600 transition-all" style={{ width: `${(respondidas / preguntas.length) * 100}%` }} />
        </div>
        <span className="text-sm text-stone-500 tabular-nums">
          {respondidas}/{preguntas.length}
        </span>
      </div>

      {preguntas.map((p, i) => (
        <TarjetaPregunta
          key={i}
          numero={i + 1}
          pregunta={p}
          elegida={respuestas[i]}
          onElegir={(opcion) => setRespuestas((r) => r.map((x, j) => (j === i ? opcion : x)))}
        />
      ))}

      {respondidas === preguntas.length && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 text-center dark:border-indigo-900 dark:bg-indigo-950/50">
          <p className="text-3xl font-bold tabular-nums">
            {correctas}/{preguntas.length}
          </p>
          <p className="mt-1 text-stone-600 dark:text-stone-300">{veredicto}</p>
          <Boton className="mt-4" onClick={() => setPreguntas(null)}>
            <RotateCcw className="size-4" /> {t.otroQuiz}
          </Boton>
        </div>
      )}
    </div>
  )
}

function TarjetaPregunta({
  numero,
  pregunta,
  elegida,
  onElegir,
}: {
  numero: number
  pregunta: Pregunta
  elegida: number | null
  onElegir: (i: number) => void
}) {
  const { t } = useIdioma()
  const respondida = elegida !== null
  const acerto = elegida === pregunta.correcta

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <p className="font-medium">
        <span className="mr-2 text-stone-400">{numero}.</span>
        <Markdown texto={pregunta.enunciado} enLinea />
      </p>
      <div className="mt-4 space-y-2">
        {pregunta.opciones.map((opcion, i) => {
          let estilo = 'border-stone-200 hover:border-indigo-400 hover:bg-indigo-50/50 dark:border-stone-700 dark:hover:bg-indigo-950/30'
          if (respondida) {
            if (i === pregunta.correcta) estilo = 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/50'
            else if (i === elegida) estilo = 'border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950/50'
            else estilo = 'border-stone-200 opacity-60 dark:border-stone-800'
          }
          return (
            <button
              key={i}
              disabled={respondida}
              onClick={() => onElegir(i)}
              className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${estilo}`}
            >
              <span className="font-semibold text-stone-400">{LETRAS[i]}</span>
              <span className="flex-1">
                <Markdown texto={opcion} enLinea />
              </span>
              {respondida && i === pregunta.correcta && <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
              {respondida && i === elegida && !acerto && <XCircle className="size-4 shrink-0 text-red-600" />}
            </button>
          )
        })}
      </div>
      {respondida && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            acerto
              ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
          }`}
        >
          <strong>{acerto ? t.bien : t.noEraEsa}</strong>
          <Markdown texto={pregunta.explicacion} enLinea />
        </p>
      )}
    </div>
  )
}
