import '../excalidrawAssets'
import { CaptureUpdateAction, Excalidraw, reconcileElements, restoreElements } from '@excalidraw/excalidraw'
import type { RemoteExcalidrawElement } from '@excalidraw/excalidraw/data/reconcile'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import '@excalidraw/excalidraw/index.css'
import type { AppState, BinaryFileData, BinaryFiles, Collaborator, ExcalidrawImperativeAPI, SocketId } from '@excalidraw/excalidraw/types'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useIdioma } from '../i18n'
import { useOscuro } from '../tema'
import BarraPizarra, { leerEstadoBarra, ZoomPizarra, type EstadoBarra } from './BarraPizarra'
import type { ArchivoPizarra, Conectado, ElementoPizarra, MensajePizarra } from '../useSala'

const ESPERA_TRAZOS = 80 // ms entre envíos mientras alguien dibuja
const ESPERA_PUNTERO = 50
const ELEMENTOS_POR_MENSAJE = 400 // el servidor acepta hasta 500
const MAX_IMAGEN = 4_000_000 // caracteres del data URL, igual que el servidor
const MAX_IMAGENES = 40

function colorDe(id: number) {
  return `hsl(${(id * 137) % 360} 65% 55%)`
}

/** Pizarra compartida: lo que dibuja cada uno les aparece a todos al instante. */
export default function Pizarra({
  escena,
  conectados,
  enviar,
  escucharPizarra,
  cargarImagenes,
}: {
  escena: RefObject<Map<string, ElementoPizarra>>
  conectados: Conectado[]
  enviar: (mensaje: object) => void
  escucharPizarra: (oyente: (m: MensajePizarra) => void) => () => void
  cargarImagenes: () => Promise<ArchivoPizarra[]>
}) {
  const { t, idioma } = useIdioma()
  const oscuro = useOscuro()
  const [excalidraw, setExcalidraw] = useState<ExcalidrawImperativeAPI | null>(null)
  const [barra, setBarra] = useState<EstadoBarra | null>(null)

  // Última versión que ya conocemos de cada elemento (propia o recibida): solo se envía lo que cambió
  const versiones = useRef(new Map<string, number>())
  const pendientes = useRef(new Map<string, OrderedExcalidrawElement>())
  const temporizador = useRef<number | undefined>(undefined)
  const archivosConocidos = useRef(new Set<string>())
  const ultimoPuntero = useRef(0)
  const colaboradores = useRef(new Map<SocketId, Collaborator>())
  const enviarRef = useRef(enviar)
  enviarRef.current = enviar

  const [datosIniciales] = useState(() => {
    const elementos = restoreElements([...escena.current.values()] as unknown as OrderedExcalidrawElement[], null)
    elementos.forEach((e) => versiones.current.set(e.id, e.version))
    return { elementos, appState: { collaborators: new Map<SocketId, Collaborator>() } }
  })

  function vaciar() {
    temporizador.current = undefined
    const lista = [...pendientes.current.values()]
    pendientes.current.clear()
    for (let i = 0; i < lista.length; i += ELEMENTOS_POR_MENSAJE) {
      enviarRef.current({ tipo: 'pizarra', elementos: lista.slice(i, i + ELEMENTOS_POR_MENSAJE) })
    }
  }

  function encolar(elementos: readonly OrderedExcalidrawElement[]) {
    if (!elementos.length) return
    elementos.forEach((e) => pendientes.current.set(e.id, e))
    temporizador.current ??= window.setTimeout(vaciar, ESPERA_TRAZOS)
  }

  // Al salir de la pestaña se manda lo que haya quedado pendiente
  useEffect(
    () => () => {
      window.clearTimeout(temporizador.current)
      if (pendientes.current.size) vaciar()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Lo que llega de los demás
  useEffect(() => {
    if (!excalidraw) return

    function aplicar(remotos: ElementoPizarra[]) {
      const restaurados = restoreElements(remotos as unknown as OrderedExcalidrawElement[], null) as RemoteExcalidrawElement[]
      const elementos = reconcileElements(excalidraw!.getSceneElementsIncludingDeleted(), restaurados, excalidraw!.getAppState())
      elementos.forEach((e) => versiones.current.set(e.id, e.version))
      excalidraw!.updateScene({ elements: elementos, captureUpdate: CaptureUpdateAction.NEVER })
    }

    function agregarArchivos(archivos: ArchivoPizarra[]) {
      const nuevos = archivos.filter((a) => !archivosConocidos.current.has(a.id))
      nuevos.forEach((a) => archivosConocidos.current.add(a.id))
      if (nuevos.length) excalidraw!.addFiles(nuevos as unknown as BinaryFileData[])
    }

    setBarra(leerEstadoBarra(excalidraw.getAppState()))

    // Lo que haya llegado mientras la pizarra se estaba abriendo
    aplicar([...escena.current.values()])
    cargarImagenes().then(agregarArchivos)

    return escucharPizarra((mensaje) => {
      if (mensaje.tipo === 'pizarra') {
        aplicar(mensaje.elementos)
        if (mensaje.inicial) {
          // Volvió la conexión: mandamos lo que dibujamos mientras estuvo cortada
          const servidor = new Map(mensaje.elementos.map((e) => [e.id, e.version]))
          encolar(excalidraw.getSceneElementsIncludingDeleted().filter((e) => e.version > (servidor.get(e.id) ?? 0)))
        }
      } else if (mensaje.tipo === 'imagen') {
        agregarArchivos([mensaje.archivo])
      } else if (mensaje.tipo === 'puntero') {
        colaboradores.current.set(String(mensaje.usuario_id) as SocketId, {
          username: mensaje.nombre,
          pointer: { x: mensaje.x, y: mensaje.y, tool: 'pointer' },
          button: mensaje.boton,
          color: { background: colorDe(mensaje.usuario_id), stroke: colorDe(mensaje.usuario_id) },
        })
        excalidraw.updateScene({ collaborators: new Map(colaboradores.current) })
      }
    })
  }, [excalidraw, escena, escucharPizarra, cargarImagenes])

  // Si alguien se va de la sala, su cursor desaparece
  useEffect(() => {
    if (!excalidraw) return
    const presentes = new Set(conectados.map((c) => String(c.id)))
    let cambio = false
    for (const id of colaboradores.current.keys()) {
      if (!presentes.has(id)) {
        colaboradores.current.delete(id)
        cambio = true
      }
    }
    if (cambio) excalidraw.updateScene({ collaborators: new Map(colaboradores.current) })
  }, [conectados, excalidraw])

  function alCambiar(_elementos: readonly OrderedExcalidrawElement[], appState: AppState, archivos: BinaryFiles) {
    if (!excalidraw) return
    const nuevaBarra = leerEstadoBarra(appState)
    setBarra((actual) => (actual && JSON.stringify(actual) === JSON.stringify(nuevaBarra) ? actual : nuevaBarra))
    const cambiados = excalidraw.getSceneElementsIncludingDeleted().filter((e) => versiones.current.get(e.id) !== e.version)
    cambiados.forEach((e) => versiones.current.set(e.id, e.version))
    encolar(cambiados)

    for (const archivo of Object.values(archivos)) {
      if (archivosConocidos.current.has(archivo.id)) continue
      archivosConocidos.current.add(archivo.id)
      if (archivo.dataURL.length > MAX_IMAGEN) {
        excalidraw.setToast({ message: t.sala.imagenGrande, duration: 5000 })
      } else if (archivosConocidos.current.size > MAX_IMAGENES) {
        excalidraw.setToast({ message: t.sala.pizarraLlena, duration: 5000 })
      } else {
        enviarRef.current({
          tipo: 'imagen',
          archivo: { id: archivo.id, mimeType: archivo.mimeType, dataURL: archivo.dataURL, created: archivo.created },
        })
      }
    }
  }

  return (
    <div className="pizarra flex h-[calc(100dvh-13rem)] min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800">
      {excalidraw && barra && <BarraPizarra api={excalidraw} estado={barra} />}
      <div className="relative min-h-0 flex-1">
        {excalidraw && barra && <ZoomPizarra api={excalidraw} zoom={barra.zoom} />}
        <Excalidraw
          excalidrawAPI={setExcalidraw}
          initialData={{ elements: datosIniciales.elementos, appState: datosIniciales.appState }}
          onChange={alCambiar}
          onPointerUpdate={({ pointer, button }) => {
            const ahora = Date.now()
            if (ahora - ultimoPuntero.current < ESPERA_PUNTERO && button === 'up') return
            ultimoPuntero.current = ahora
            enviarRef.current({ tipo: 'puntero', x: Math.round(pointer.x), y: Math.round(pointer.y), boton: button })
          }}
          isCollaborating
          theme={oscuro ? 'dark' : 'light'}
          langCode={idioma === 'es' ? 'es-ES' : 'en'}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: null } }}
        />
      </div>
    </div>
  )
}
