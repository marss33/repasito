import { ArrowUp, BookOpen, Loader2, MessageSquare, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, mensajeDeError } from '../api'
import { useIdioma } from '../i18n'
import type { Fuente, Materia, Mensaje } from '../types'
import { Aviso, Boton, Esqueleto, Markdown, Vacio } from './ui'

// Marcas de cita [1], [2][3]... (no las de LaTeX como \sqrt[3])
const CITA = /(?<![A-Za-z\\])\[(\d+)\](?!\()/g
// Igual, con el espacio de antes: para esconderlas mientras la IA escribe
// (también las del estilo 【1】 o 【1†fuente】, que usan algunos modelos)
const CITA_CON_ESPACIO = /\s*(?:(?<![A-Za-z\\])\[\d+(?:\s*[,;]\s*\d+)*\](?!\()|【\d+[^】]*】)/g

export default function Chat({ materia, onCambio }: { materia: Materia; onCambio: () => void }) {
  const { t } = useIdioma()
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enVivo, setEnVivo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const final = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setError(null)
    setMensajes(null)
    api
      .chat(materia.id)
      .then(setMensajes)
      .catch((e) => {
        setMensajes([])
        setError(mensajeDeError(e))
      })
  }, [materia.id])

  useEffect(() => {
    final.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensajes, enviando, enVivo])

  async function enviar(pregunta: string) {
    pregunta = pregunta.trim()
    if (!pregunta || enviando) return
    const temporal: Mensaje = { id: -Date.now(), rol: 'user', texto: pregunta, fuentes: [], creado: new Date().toISOString() }
    setMensajes((m) => [...(m ?? []), temporal])
    setTexto('')
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await api.preguntar(materia.id, pregunta, setEnVivo)
      setMensajes((m) => [...(m ?? []), respuesta])
    } catch (e) {
      setMensajes((m) => (m ?? []).filter((x) => x.id !== temporal.id))
      setTexto(pregunta)
      setError(mensajeDeError(e))
    } finally {
      setEnVivo(null)
      setEnviando(false)
      onCambio()
    }
  }

  async function limpiar() {
    if (!confirm(t.confirmarBorrarChat)) return
    try {
      await api.borrarChat(materia.id)
      setMensajes([])
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  if (materia.documentos === 0) {
    return (
      <Vacio icono={<MessageSquare className="size-8" />} titulo={t.primeroSubi}>
        {t.chatSinApuntesDetalle}
      </Vacio>
    )
  }

  return (
    <div className="flex min-h-[55dvh] flex-col">
      <div className="flex-1 space-y-5 pb-2">
        {mensajes === null && <Esqueleto filas={2} alto="h-20" />}

        {mensajes?.length === 0 && !enviando && (
          <div className="flex min-h-[45dvh] flex-col items-center justify-center text-center">
            <div className="mb-3 rounded-2xl bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              <BookOpen className="size-6" />
            </div>
            <p className="font-medium">{t.preguntale}</p>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t.preguntaleDetalle}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {t.sugerencias.map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm transition-colors hover:border-indigo-400 hover:text-indigo-700 dark:border-stone-700 dark:bg-stone-900 dark:hover:text-indigo-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes?.map((m) => (m.rol === 'user' ? <MensajeUsuario key={m.id} texto={m.texto} /> : <MensajeTutor key={m.id} mensaje={m} />))}

        {enviando &&
          (enVivo ? (
            <Burbuja>
              <div className="escribiendo">
                <Markdown texto={enVivo.replace(CITA_CON_ESPACIO, '')} />
              </div>
            </Burbuja>
          ) : (
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Loader2 className="size-4 animate-spin" /> {t.buscando}
            </div>
          ))}
        <div ref={final} />
      </div>

      {/* La caja para escribir queda siempre visible abajo */}
      <div className="sticky bottom-0 -mx-1 bg-stone-50/95 px-1 pt-2 pb-4 backdrop-blur dark:bg-stone-950/95">
        {error && (
          <div className="mb-2">
            <Aviso onCerrar={() => setError(null)}>{error}</Aviso>
          </div>
        )}

        <form
          className="flex items-end gap-2 rounded-2xl border border-stone-300 bg-white p-2 shadow-sm transition-colors focus-within:border-indigo-400 dark:border-stone-700 dark:bg-stone-900"
          onSubmit={(e) => {
            e.preventDefault()
            enviar(texto)
          }}
        >
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                enviar(texto)
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder={t.escribiPregunta}
            aria-label={t.pregunta}
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 outline-none [field-sizing:content]"
          />
          {!!mensajes?.length && (
            <Boton
              type="button"
              variante="fantasma"
              className="px-2"
              onClick={limpiar}
              aria-label={t.borrarConversacion}
              title={t.borrarConversacion}
            >
              <Trash2 className="size-4" />
            </Boton>
          )}
          <Boton type="submit" className="px-2.5" disabled={!texto.trim()} cargando={enviando} aria-label={t.enviar}>
            {!enviando && <ArrowUp className="size-4" />}
          </Boton>
        </form>
      </div>
    </div>
  )
}

function MensajeUsuario({ texto }: { texto: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 whitespace-pre-wrap text-white shadow-sm">
        {texto}
      </div>
    </div>
  )
}

function Burbuja({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      {children}
    </div>
  )
}

function MensajeTutor({ mensaje }: { mensaje: Mensaje }) {
  const { t } = useIdioma()
  // Convierte las marcas [n] en links internos para mostrarlas como chips
  const texto = mensaje.texto.replace(CITA, '[$1](#fuente-$1)')
  const porNumero = new Map(mensaje.fuentes.map((f) => [f.n, f]))

  return (
    <Burbuja>
      <Markdown
        texto={texto}
        componentes={{
          a: ({ href, children }) => {
            const n = href?.startsWith('#fuente-') ? Number(href.slice(8)) : null
            const fuente = n ? porNumero.get(n) : undefined
            if (fuente) return <ChipFuente fuente={fuente} />
            return (
              <a href={href} target="_blank" rel="noreferrer" className="text-indigo-600 underline dark:text-indigo-400">
                {children}
              </a>
            )
          },
        }}
      />
      {mensaje.fuentes.length > 0 && (
        <details className="mt-3 border-t border-stone-100 pt-2 text-sm dark:border-stone-800">
          <summary className="cursor-pointer text-stone-500 select-none hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
            {t.fuentes(mensaje.fuentes.length)}
          </summary>
          <ul className="mt-2 space-y-2">
            {mensaje.fuentes.map((f) => (
              <li key={f.n} className="flex gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {f.n}
                </span>
                <div className="min-w-0">
                  <p className="font-medium break-words">{dondeEsta(f)}</p>
                  {f.cita && <p className="text-stone-500 italic dark:text-stone-400">“{f.cita}”</p>}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Burbuja>
  )
}

function ChipFuente({ fuente }: { fuente: Fuente }) {
  return (
    <span
      className="mx-0.5 inline-flex cursor-help items-center rounded bg-indigo-100 px-1.5 align-text-top text-[0.7rem] leading-4 font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
      title={`${dondeEsta(fuente)}${fuente.cita ? `\n“${fuente.cita}”` : ''}`}
    >
      {fuente.n}
    </span>
  )
}

function dondeEsta(fuente: Fuente): string {
  return fuente.ubicacion ? `${fuente.documento} · ${fuente.ubicacion}` : fuente.documento
}
