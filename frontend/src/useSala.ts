import { useCallback, useEffect, useRef, useState } from 'react'
import { api, mensajeDeError } from './api'
import type { Apariencia, MensajeSala } from './types'

export interface Conectado {
  id: number
  nombre: string
  apariencia: Apariencia
}

export interface EstadoPomodoro {
  fase: 'estudio' | 'descanso'
  corriendo: boolean
  fin: number | null // epoch en segundos, reloj del servidor
  restante: number
  estudio: number
  descanso: number
  ciclos: number
}

export interface JugadorTrivia {
  id: number
  nombre: string
  puntos: number
  aciertos: number
  respondio: boolean
  acerto: boolean | null // solo al mostrar la respuesta
}

export type ModoTrivia = 'opciones' | 'vf' | 'completar' | 'rapido'

export interface EstadoTrivia {
  id: string
  tema: string
  creador: string
  creador_id: number
  fase: 'invitando' | 'pregunta' | 'revelando' | 'terminada'
  indice: number
  total: number
  fin: number // epoch en segundos, reloj del servidor
  segundos: number
  modo: ModoTrivia
  dificultad: 'facil' | 'media' | 'dificil'
  rival: number | null // duelo 1 contra 1
  rival_nombre: string | null
  pregunta: {
    enunciado: string
    opciones: string[]
    correcta: number | null // solo al mostrar la respuesta
    explicacion: string | null
  } | null
  jugadores: JugadorTrivia[] // ordenados por puntos
}

export interface EstadoSala {
  conectados: Conectado[]
  pomodoro: EstadoPomodoro
  escena?: string
  clima?: string
  trivia?: EstadoTrivia | null
  preparando_trivia?: { por: string; tema: string } | null
}

export type EventoSala =
  | { evento: 'entro' | 'salio'; nombre: string }
  | { evento: 'pomodoro'; accion: string; nombre: string }
  | { evento: 'fase'; fase: 'estudio' | 'descanso' }
  | { evento: 'monedas'; ganadas: number; total: number; motivo: 'grupo' | 'solo' | 'pomodoro' | 'trivia' }
  | { evento: 'aviso'; texto?: string }
  | { evento: 'trivia'; nombre: string; tema: string; para?: number | null }
  | { evento: 'archivos' }
  | { evento: 'tablero' }
  | { evento: 'archivo'; nombre: string; archivo: string }

export type LineaChat = { tipo: 'mensaje'; mensaje: MensajeSala } | { tipo: 'evento'; id: string; evento: EventoSala }

type Conexion = 'conectando' | 'conectada' | 'reconectando'

/** Un elemento de Excalidraw, tal como viaja por la sala (solo nos importan id y versión). */
export interface ElementoPizarra {
  id: string
  version: number
  versionNonce: number
  [clave: string]: unknown
}

export interface ArchivoPizarra {
  id: string
  mimeType: string
  dataURL: string
  created: number
}

export type MensajePizarra =
  | { tipo: 'pizarra'; elementos: ElementoPizarra[]; inicial?: boolean }
  | { tipo: 'imagen'; archivo: ArchivoPizarra }
  | { tipo: 'puntero'; usuario_id: number; nombre: string; x: number; y: number; boton: 'down' | 'up' }

/** Guarda la versión más nueva de cada elemento (mismo criterio que Excalidraw). */
export function combinarEnEscena(escena: Map<string, ElementoPizarra>, elementos: ElementoPizarra[]) {
  for (const e of elementos) {
    const actual = escena.get(e.id)
    if (!actual || e.version > actual.version || (e.version === actual.version && e.versionNonce < actual.versionNonce)) escena.set(e.id, e)
  }
}

/** Se conecta a una sala por WebSocket y mantiene su estado al día. Se reconecta solo si se corta. */
export function useSala(codigo: string, alEvento: (evento: EventoSala) => void) {
  const [nombre, setNombre] = useState<string | null>(null)
  const [creadorId, setCreadorId] = useState<number | null>(null)
  const [estado, setEstado] = useState<EstadoSala | null>(null)
  const [chat, setChat] = useState<LineaChat[]>([])
  const [conexion, setConexion] = useState<Conexion>('conectando')
  const [error, setError] = useState<string | null>(null)
  const desfase = useRef(0) // reloj del servidor - reloj local, en milisegundos
  const socket = useRef<WebSocket | null>(null)
  const alEventoRef = useRef(alEvento)
  alEventoRef.current = alEvento
  // La pizarra no pasa por el estado de React (serían cientos de cambios por segundo)
  const escena = useRef(new Map<string, ElementoPizarra>())
  const oyentesPizarra = useRef(new Set<(m: MensajePizarra) => void>())
  // Las imágenes pegadas: se piden una sola vez por sala (pueden pesar varios MB)
  const archivos = useRef(new Map<string, ArchivoPizarra>())
  const imagenesPedidas = useRef<Promise<void> | null>(null)

  useEffect(() => {
    let cerrado = false
    let intentos = 0
    let reintento: number | undefined
    let latido: number | undefined
    setEstado(null)
    setChat([])
    setError(null)
    setConexion('conectando')
    escena.current = new Map()
    archivos.current = new Map()
    imagenesPedidas.current = null

    api
      .sala(codigo)
      .then((sala) => {
        setNombre(sala.nombre)
        setCreadorId(sala.creador_id)
        setChat(sala.mensajes.map((mensaje) => ({ tipo: 'mensaje', mensaje })))
        conectar()
      })
      .catch((e) => setError(mensajeDeError(e)))

    function conectar() {
      if (cerrado) return
      const ws = new WebSocket(api.urlTiempoReal(codigo))
      socket.current = ws
      ws.onopen = () => {
        intentos = 0
        setConexion('conectada')
        // Mantiene viva la conexión (algunos proxies cortan las que están quietas)
        latido = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"tipo":"ping"}'), 25_000)
      }
      ws.onmessage = (e) => {
        const datos = JSON.parse(e.data)
        if (datos.tipo === 'estado') {
          desfase.current = datos.ahora * 1000 - Date.now()
          setEstado({
            conectados: datos.conectados,
            pomodoro: datos.pomodoro,
            escena: datos.escena,
            clima: datos.clima,
            trivia: datos.trivia ?? null,
            preparando_trivia: datos.preparando_trivia ?? null,
          })
        } else if (datos.tipo === 'chat') {
          setChat((c) => [...c, { tipo: 'mensaje', mensaje: datos.mensaje }])
        } else if (datos.tipo === 'pizarra' || datos.tipo === 'imagen' || datos.tipo === 'puntero') {
          if (datos.tipo === 'pizarra') combinarEnEscena(escena.current, datos.elementos)
          if (datos.tipo === 'imagen') archivos.current.set(datos.archivo.id, datos.archivo)
          oyentesPizarra.current.forEach((oyente) => oyente(datos as MensajePizarra))
        } else if (datos.tipo === 'reacciones' || datos.tipo === 'encuesta') {
          // Se actualiza el mensaje del chat que cambió
          setChat((c) =>
            c.map((l) =>
              l.tipo === 'mensaje' && l.mensaje.id === datos.mensaje_id
                ? {
                    ...l,
                    mensaje:
                      datos.tipo === 'reacciones'
                        ? { ...l.mensaje, reacciones: datos.reacciones }
                        : { ...l.mensaje, encuesta: datos.encuesta },
                  }
                : l,
            ),
          )
        } else if (datos.tipo === 'monedas' || datos.tipo === 'aviso' || datos.tipo === 'archivos' || datos.tipo === 'tablero') {
          // Solo para esta persona: no van al chat
          alEventoRef.current({ ...datos, evento: datos.tipo } as EventoSala)
        } else if (datos.tipo === 'evento') {
          const evento = datos as EventoSala
          setChat((c) => [...c, { tipo: 'evento', id: `${Date.now()}-${Math.random()}`, evento }])
          alEventoRef.current(evento)
        }
      }
      ws.onclose = (e) => {
        window.clearInterval(latido)
        if (cerrado) return
        if (e.code === 4401 || e.code === 4404) {
          setError(e.code === 4404 ? 'sala' : 'sesion')
          return
        }
        setConexion('reconectando')
        intentos++
        reintento = window.setTimeout(conectar, Math.min(10_000, 500 * 2 ** intentos))
      }
    }

    return () => {
      cerrado = true
      window.clearTimeout(reintento)
      window.clearInterval(latido)
      socket.current?.close()
      socket.current = null
    }
  }, [codigo])

  const enviar = useCallback((mensaje: object) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(mensaje))
  }, [])

  /** Hora actual según el reloj del servidor, en segundos. */
  const ahoraServidor = useCallback(() => (Date.now() + desfase.current) / 1000, [])

  /** Para la pizarra: recibe trazos, imágenes y cursores de los demás. Devuelve cómo dejar de escuchar. */
  const escucharPizarra = useCallback((oyente: (m: MensajePizarra) => void) => {
    oyentesPizarra.current.add(oyente)
    return () => {
      oyentesPizarra.current.delete(oyente)
    }
  }, [])

  /** Trae las imágenes que ya estaban en la pizarra (solo la primera vez) y las devuelve todas. */
  const cargarImagenes = useCallback(async () => {
    if (!imagenesPedidas.current) {
      imagenesPedidas.current = api.imagenesPizarra(codigo).then(
        (lista) => lista.forEach((a) => archivos.current.set(a.id, a)),
        () => {
          imagenesPedidas.current = null // se reintenta la próxima vez
        },
      )
    }
    await imagenesPedidas.current
    return [...archivos.current.values()]
  }, [codigo])

  return {
    nombre,
    creadorId,
    estado,
    chat,
    conexion,
    error,
    enviar,
    ahoraServidor,
    desfase,
    escena,
    archivos,
    escucharPizarra,
    cargarImagenes,
  }
}
