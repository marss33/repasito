import { BookPlus, Download, FileText, Image as IconoImagen, Loader2, Music, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useState, type DragEvent } from 'react'
import { api, mensajeDeError } from '../api'
import { useIdioma } from '../i18n'
import { esPendiente, type ArchivoSala, type Materia, type Usuario } from '../types'
import { Aviso, Boton, Esqueleto, Modal } from './ui'

function tamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba|webm)$/i

function esAudio(archivo: ArchivoSala) {
  return archivo.mime.startsWith('audio/') || AUDIO.test(archivo.nombre)
}

/** La "nube" de la sala: archivos que cualquiera sube y todos pueden descargar. */
export default function ArchivosSala({
  codigo,
  usuario,
  creadorId,
  cambios,
}: {
  codigo: string
  usuario: Usuario
  creadorId: number | null
  cambios: number // aumenta cuando alguien sube o borra algo (llega por la sala en vivo)
}) {
  const { t } = useIdioma()
  const a = t.sala.archivos
  const [archivos, setArchivos] = useState<ArchivoSala[] | null>(null)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [guardando, setGuardando] = useState<ArchivoSala | null>(null)

  const cargar = useCallback(() => {
    api
      .archivosSala(codigo)
      .then(setArchivos)
      .catch((e) => setError(mensajeDeError(e)))
  }, [codigo])

  useEffect(cargar, [cargar, cambios])

  async function subir(lista: FileList | File[]) {
    setError(null)
    const errores: string[] = []
    for (const archivo of Array.from(lista)) {
      setSubiendo(archivo.name)
      try {
        await api.subirArchivoSala(codigo, archivo)
      } catch (e) {
        errores.push(`${archivo.name}: ${mensajeDeError(e)}`)
      }
    }
    setSubiendo(null)
    if (errores.length) setError(errores.join('\n'))
    cargar()
  }

  async function borrar(archivo: ArchivoSala) {
    if (!confirm(a.confirmarBorrar(archivo.nombre))) return
    try {
      await api.borrarArchivoSala(codigo, archivo.id)
      cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  function soltar(e: DragEvent) {
    e.preventDefault()
    setArrastrando(false)
    if (e.dataTransfer.files.length) subir(e.dataTransfer.files)
  }

  return (
    <section
      className={`rounded-2xl border bg-white p-5 transition-colors dark:bg-stone-900 ${
        arrastrando ? 'border-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/40' : 'border-stone-200 dark:border-stone-800'
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        setArrastrando(true)
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={soltar}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{a.titulo}</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">{arrastrando ? a.soltar : a.detalle}</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          {subiendo ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {subiendo ?? a.subir}
          <input
            type="file"
            multiple
            className="sr-only"
            disabled={!!subiendo}
            onChange={(e) => {
              if (e.target.files?.length) subir(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      <p className="mt-1 text-xs text-stone-400">{a.limites(20)}</p>

      {error && (
        <div className="mt-3 whitespace-pre-line">
          <Aviso onCerrar={() => setError(null)}>{error}</Aviso>
        </div>
      )}
      {exito && (
        <div className="mt-3">
          <Aviso tipo="exito" onCerrar={() => setExito(null)}>
            {exito}
          </Aviso>
        </div>
      )}

      <div className="mt-4">
        {archivos === null ? (
          <Esqueleto filas={3} alto="h-14" />
        ) : archivos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-500 dark:border-stone-700">
            {a.vacio}
          </p>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {archivos.map((archivo) => {
              const puedeBorrar = archivo.usuario_id === usuario.id || creadorId === usuario.id
              const Icono = archivo.mime.startsWith('image/') ? IconoImagen : esAudio(archivo) ? Music : FileText
              return (
                <li key={archivo.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Icono className="size-5 shrink-0 text-indigo-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{archivo.nombre}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {tamano(archivo.tamano)} · {a.subidoPor(archivo.por)} ·{' '}
                      {new Date(archivo.creado + 'Z').toLocaleDateString([], { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <a
                    href={api.urlArchivoSala(codigo, archivo.id)}
                    download={archivo.nombre}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
                  >
                    <Download className="size-4" /> {a.descargar}
                  </a>
                  <Boton variante="secundario" className="py-1.5" onClick={() => setGuardando(archivo)}>
                    <BookPlus className="size-4" /> <span className="hidden sm:inline">{a.aMisApuntes}</span>
                  </Boton>
                  {puedeBorrar && (
                    <Boton variante="fantasma" className="px-2" onClick={() => borrar(archivo)} aria-label={a.borrar} title={a.borrar}>
                      <Trash2 className="size-4" />
                    </Boton>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {guardando && (
        <GuardarEnMateria
          codigo={codigo}
          archivo={guardando}
          onCerrar={() => setGuardando(null)}
          onListo={(materia, procesando) => {
            setGuardando(null)
            setExito(procesando ? a.procesandoEn(materia) : a.guardadoEn(materia))
          }}
        />
      )}
    </section>
  )
}

function GuardarEnMateria({
  codigo,
  archivo,
  onCerrar,
  onListo,
}: {
  codigo: string
  archivo: ArchivoSala
  onCerrar: () => void
  onListo: (materia: string, procesando: boolean) => void
}) {
  const { t } = useIdioma()
  const a = t.sala.archivos
  const [materias, setMaterias] = useState<Materia[] | null>(null)
  const [guardando, setGuardando] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .materias()
      .then(setMaterias)
      .catch((e) => setError(mensajeDeError(e)))
  }, [])

  async function guardar(materia: Materia) {
    setGuardando(materia.id)
    setError(null)
    try {
      const r = await api.archivoSalaAMateria(codigo, archivo.id, materia.id)
      onListo(materia.nombre, esPendiente(r))
    } catch (e) {
      setError(mensajeDeError(e))
      setGuardando(null)
    }
  }

  return (
    <Modal titulo={a.elegirMateria} onCerrar={onCerrar}>
      <p className="mb-3 truncate text-sm text-stone-500">{archivo.nombre}</p>
      {error && <Aviso onCerrar={() => setError(null)}>{error}</Aviso>}
      {materias === null ? (
        <Esqueleto filas={2} alto="h-10" />
      ) : (
        <ul className="space-y-1.5">
          {materias.map((m) => (
            <li key={m.id}>
              <Boton
                variante="secundario"
                className="w-full justify-start"
                cargando={guardando === m.id}
                disabled={guardando !== null}
                onClick={() => guardar(m)}
              >
                {m.nombre}
              </Boton>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
