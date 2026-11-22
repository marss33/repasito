import {
  Camera,
  FileImage,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  Presentation,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, mensajeDeError } from '../api'
import { useIdioma } from '../i18n'
import {
  esPendiente,
  type Documento,
  type DocumentoDetalle,
  type Estado,
  type Materia,
  type SubidaPendiente,
  type TipoDocumento,
} from '../types'
import { Aviso, Boton, Esqueleto, Markdown, Modal, Vacio } from './ui'

const ACEPTADOS = [
  '.pdf', '.docx', '.pptx', '.xlsx', '.xlsm', '.odt', '.odp', '.ods', '.rtf', '.txt', '.md', '.csv', '.html', '.htm',
  '.tex', '.json', 'image/*', '.heic', '.heif',
].join(',') // prettier-ignore

const MAX_MB = 20

const ICONOS: Record<TipoDocumento, typeof FileText> = {
  pdf: FileText,
  word: FileText,
  texto: FileText,
  presentacion: Presentation,
  planilla: FileSpreadsheet,
  imagen: FileImage,
}

interface Props {
  materia: Materia
  onCambio: () => void
}

export default function Apuntes({ materia, onCambio }: Props) {
  const { t } = useIdioma()
  const [documentos, setDocumentos] = useState<Documento[] | null>(null)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<Record<number, 'resumen' | 'flashcards'>>({})
  const [cantidades, setCantidades] = useState<Record<number, number>>({})
  const [resumen, setResumen] = useState<DocumentoDetalle | null>(null)
  const [limites, setLimites] = useState<Estado | null>(null)
  const [enProceso, setEnProceso] = useState<SubidaPendiente[]>([])
  const entrada = useRef<HTMLInputElement>(null)
  const camara = useRef<HTMLInputElement>(null)
  const maxMb = limites?.max_archivo_mb ?? MAX_MB

  useEffect(() => {
    api
      .estado()
      .then(setLimites)
      .catch(() => {})
  }, [])

  const cargar = useCallback(() => {
    api
      .documentos(materia.id)
      .then(setDocumentos)
      .catch((e) => {
        setDocumentos((d) => d ?? [])
        setError(mensajeDeError(e))
      })
  }, [materia.id])

  useEffect(() => {
    setError(null)
    setExito(null)
    cargar()
    // Si se subió algo pesado y se volvió a entrar, sigue apareciendo como "procesando"
    setEnProceso([])
    api
      .procesando(materia.id)
      .then((lista) => setEnProceso(lista.filter((p) => p.estado === 'procesando')))
      .catch(() => {})
  }, [cargar, materia.id])

  // Lo que se procesa en segundo plano: se pregunta cada unos segundos hasta que termine
  const hayEnProceso = enProceso.length > 0
  useEffect(() => {
    if (!hayEnProceso) return
    const id = window.setInterval(async () => {
      let lista: SubidaPendiente[]
      try {
        lista = await api.procesando(materia.id)
      } catch {
        return
      }
      const listos = lista.filter((p) => p.estado === 'listo')
      const fallidos = lista.filter((p) => p.estado === 'error')
      if (listos.length) {
        const monedas = listos.reduce((total, p) => total + p.monedas_ganadas, 0)
        const texto = listos.map((p) => t.listoEnSegundoPlano(p.nombre)).join(' ')
        setExito(monedas ? `${texto} · ${t.rincon.ganaste(monedas)} 🪙` : texto)
        cargar()
        onCambio()
      }
      if (fallidos.length) setError(fallidos.map((p) => p.error).join('\n'))
      setEnProceso(lista.filter((p) => p.estado === 'procesando'))
    }, 3000)
    return () => window.clearInterval(id)
  }, [hayEnProceso, materia.id, cargar, onCambio, t])

  async function subir(archivos: FileList | File[]) {
    setError(null)
    setExito(null)
    let subidos = 0
    let monedas = 0
    const errores: string[] = []
    const lugares = limites ? limites.max_documentos - (documentos?.length ?? 0) : Infinity
    for (const archivo of Array.from(archivos)) {
      if (subidos >= lugares) {
        errores.push(`${archivo.name}: ${t.materiaLlena(limites!.max_documentos)}`)
        continue
      }
      if (archivo.size > maxMb * 1024 * 1024) {
        errores.push(t.superaMb(archivo.name, maxMb))
        continue
      }
      setSubiendo(archivo.name)
      try {
        const doc = await api.subirDocumento(materia.id, archivo)
        if (esPendiente(doc)) {
          setEnProceso((lista) => [...lista, doc])
          continue
        }
        monedas += doc.monedas_ganadas ?? 0
        subidos++
      } catch (e) {
        errores.push(`${archivo.name}: ${mensajeDeError(e)}`)
      }
    }
    setSubiendo(null)
    if (errores.length) setError(errores.join('\n'))
    if (subidos) {
      const texto = subidos === 1 ? t.apunteSubido : t.apuntesSubidos(subidos)
      setExito(monedas ? `${texto} · ${t.rincon.ganaste(monedas)} 🪙` : texto)
      cargar()
    }
    onCambio()
  }

  async function marcarOcupado<T>(id: number, tarea: 'resumen' | 'flashcards', fn: () => Promise<T>) {
    setOcupado((o) => ({ ...o, [id]: tarea }))
    setError(null)
    setExito(null)
    try {
      return await fn()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupado(({ [id]: _, ...resto }) => resto)
      onCambio()
    }
  }

  async function verResumen(doc: Documento, regenerar = false) {
    const detalle = await marcarOcupado(doc.id, 'resumen', () =>
      doc.tiene_resumen && !regenerar ? api.documento(doc.id) : api.resumir(doc.id),
    )
    if (detalle) {
      setResumen(detalle)
      if (!doc.tiene_resumen) cargar()
    }
  }

  async function crearFlashcards(doc: Documento) {
    const cantidad = cantidades[doc.id] ?? 10
    const nuevas = await marcarOcupado(doc.id, 'flashcards', () => api.generarFlashcards(doc.id, cantidad))
    if (nuevas) setExito(t.flashcardsCreadas(nuevas.length, doc.nombre))
  }

  async function borrar(doc: Documento) {
    if (!confirm(t.confirmarBorrarApunte(doc.nombre))) return
    try {
      await api.borrarDocumento(doc.id)
      cargar()
      onCambio()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastrando(false)
          if (e.dataTransfer.files.length) subir(e.dataTransfer.files)
        }}
        onClick={() => !subiendo && entrada.current?.click()}
        className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          arrastrando
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
            : 'border-stone-300 hover:border-indigo-400 hover:bg-white dark:border-stone-700 dark:hover:bg-stone-900'
        }`}
      >
        <Upload className={`mb-3 size-8 ${subiendo ? 'animate-bounce text-indigo-500' : 'text-stone-400'}`} />
        {subiendo ? (
          <>
            <p className="font-medium">{t.procesando(subiendo)}</p>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t.procesandoDetalle}</p>
          </>
        ) : (
          <>
            <p className="font-medium">{t.arrastrar}</p>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t.formatos}</p>
            <p className="mt-0.5 text-xs text-stone-400">{t.letraAMano}</p>
            {limites && documentos && (
              <p className="mt-2 text-xs text-stone-400 tabular-nums">
                {t.limites(documentos.length, limites.max_documentos, limites.max_archivo_mb, limites.max_paginas_escaneadas)}
              </p>
            )}
          </>
        )}
        <input
          ref={entrada}
          type="file"
          accept={ACEPTADOS}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) subir(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <div className="-mt-2 flex justify-center sm:hidden">
        <Boton variante="secundario" onClick={() => camara.current?.click()} disabled={!!subiendo}>
          <Camera className="size-4" /> {t.sacarFoto}
        </Boton>
        <input
          ref={camara}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            if (e.target.files?.length) subir(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {enProceso.map((p) => (
        <div
          key={p.id}
          className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"
          role="status"
        >
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
          <span>{t.enSegundoPlano(p.nombre)}</span>
        </div>
      ))}

      {error && (
        <Aviso onCerrar={() => setError(null)}>
          <span className="whitespace-pre-line">{error}</span>
        </Aviso>
      )}
      {exito && (
        <Aviso tipo="exito" onCerrar={() => setExito(null)}>
          {exito}
        </Aviso>
      )}

      {documentos === null ? (
        <Esqueleto filas={2} />
      ) : documentos.length === 0 ? (
        <Vacio icono={<FileText className="size-8" />} titulo={t.sinApuntes}>
          {t.sinApuntesDetalle}
        </Vacio>
      ) : (
        <ul className="space-y-3">
          {documentos.map((doc) => {
            const Icono = ICONOS[doc.tipo] ?? FileText
            const tarea = ocupado[doc.id]
            return (
              <li
                key={doc.id}
                className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center dark:border-stone-800 dark:bg-stone-900"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                    <Icono className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={doc.nombre}>
                      {doc.nombre}
                    </p>
                    <p className="text-sm text-stone-500 dark:text-stone-400">{(t.tipos[doc.tipo] ?? t.tipos.texto)(doc.paginas)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Boton variante="secundario" cargando={tarea === 'resumen'} disabled={!!tarea} onClick={() => verResumen(doc)}>
                    {tarea !== 'resumen' && <Sparkles className="size-4" />}
                    {tarea === 'resumen' ? t.resumiendo : doc.tiene_resumen ? t.verResumen : t.resumir}
                  </Boton>

                  <div className="flex items-center">
                    <select
                      value={cantidades[doc.id] ?? 10}
                      onChange={(e) => setCantidades((c) => ({ ...c, [doc.id]: Number(e.target.value) }))}
                      className="h-9 rounded-l-lg border border-r-0 border-stone-300 bg-white px-2 text-sm dark:border-stone-700 dark:bg-stone-900"
                      aria-label={t.cantidadFlashcards}
                      disabled={!!tarea}
                    >
                      {[5, 10, 15, 20].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <Boton
                      variante="secundario"
                      className="rounded-l-none"
                      cargando={tarea === 'flashcards'}
                      disabled={!!tarea}
                      onClick={() => crearFlashcards(doc)}
                    >
                      {tarea !== 'flashcards' && <Layers className="size-4" />}
                      {tarea === 'flashcards' ? t.creando : 'Flashcards'}
                    </Boton>
                  </div>

                  <Boton
                    variante="peligro"
                    className="px-2"
                    onClick={() => borrar(doc)}
                    aria-label={t.borrarNombre(doc.nombre)}
                    disabled={!!tarea}
                  >
                    <Trash2 className="size-4" />
                  </Boton>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {resumen && (
        <Modal
          titulo={t.resumenDe(resumen.nombre)}
          onCerrar={() => setResumen(null)}
          acciones={
            <Boton
              variante="fantasma"
              cargando={ocupado[resumen.id] === 'resumen'}
              onClick={async () => {
                const doc = documentos?.find((d) => d.id === resumen.id)
                if (doc) await verResumen(doc, true)
              }}
            >
              {ocupado[resumen.id] !== 'resumen' && <RefreshCw className="size-4" />}
              {t.regenerar}
            </Boton>
          }
        >
          <Markdown texto={resumen.resumen ?? ''} />
        </Modal>
      )}
    </div>
  )
}
