import type {
  Apariencia,
  ArchivoSala,
  Documento,
  DocumentoDetalle,
  Estado,
  Concepto,
  Flashcard,
  Logro,
  ItemTablero,
  Materia,
  Mensaje,
  Pregunta,
  Rincon,
  Sala,
  SalaDetalle,
  SubidaPendiente,
  Usuario,
} from './types'

let alPerderSesion: () => void = () => {}

/** Dentro de una actividad de Discord la app corre en un iframe de discordsays.com: los pedidos al
 * servidor pasan por el proxy de Discord ("/.proxy") y la sesión viaja como token (no como cookie). */
export const enDiscord = new URLSearchParams(location.search).has('frame_id')
const BASE = enDiscord ? '/.proxy/api' : '/api'
let tokenSesion: string | null = null

export function establecerToken(token: string | null) {
  tokenSesion = token
}

/** URL del servidor para usar donde no se pueden mandar headers (<img>, links de descarga, WebSocket). */
export function urlApi(ruta: string) {
  const url = `${BASE}${ruta}`
  return tokenSesion ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(tokenSesion)}` : url
}
let idioma: 'es' | 'en' = 'es'

/** Idioma en que el servidor devuelve los mensajes y responde la IA. */
export function establecerIdioma(nuevo: 'es' | 'en') {
  idioma = nuevo
}

const MENSAJES = {
  es: {
    sinConexion: 'No se pudo conectar con el servidor. Revisá tu conexión.',
    servidor: 'El servidor tuvo un problema. Probá de nuevo en un rato.',
    cortado: 'Se cortó la conexión antes de terminar la respuesta. Probá de nuevo.',
    error: 'Algo salió mal',
  },
  en: {
    sinConexion: "Couldn't connect to the server. Check your connection.",
    servidor: 'The server had a problem. Try again in a little while.',
    cortado: 'The connection dropped before the answer finished. Please try again.',
    error: 'Something went wrong',
  },
}

/** Lo que hay que hacer si el servidor dice que la sesión no es válida (volver al login). */
export function cuandoSePierdaLaSesion(fn: () => void) {
  alPerderSesion = fn
}

async function llamar(ruta: string, opciones: RequestInit): Promise<Response> {
  let respuesta: Response
  try {
    const headers: Record<string, string> = { 'X-Idioma': idioma, ...(opciones.headers as Record<string, string> | undefined) }
    if (tokenSesion) headers.Authorization = `Bearer ${tokenSesion}`
    respuesta = await fetch(`${BASE}${ruta}`, { credentials: 'same-origin', ...opciones, headers })
  } catch {
    throw new Error(MENSAJES[idioma].sinConexion)
  }
  if (respuesta.status === 401 && !ruta.startsWith('/auth/')) alPerderSesion()
  if (!respuesta.ok) throw new Error(await mensajeDeLaRespuesta(respuesta))
  return respuesta
}

async function mensajeDeLaRespuesta(respuesta: Response): Promise<string> {
  try {
    const datos = await respuesta.json()
    if (typeof datos.detail === 'string') return datos.detail
  } catch {
    // la respuesta no era JSON
  }
  if (respuesta.status >= 500) return MENSAJES[idioma].servidor
  return `Error ${respuesta.status}`
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const respuesta = await llamar(ruta, opciones)
  if (respuesta.status === 204) return undefined as T
  return respuesta.json() as Promise<T>
}

function conJson(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

/** Lee una respuesta Server-Sent Events y devuelve cada evento con su nombre y sus datos (JSON). */
async function* leerEventos(respuesta: Response): AsyncGenerator<{ evento: string; datos: unknown }> {
  const lector = respuesta.body!.getReader()
  const decodificador = new TextDecoder()
  let pendiente = ''
  while (true) {
    const { done, value } = await lector.read()
    if (done) return
    pendiente += decodificador.decode(value, { stream: true })
    let fin: number
    while ((fin = pendiente.indexOf('\n\n')) >= 0) {
      const bloque = pendiente.slice(0, fin)
      pendiente = pendiente.slice(fin + 2)
      let evento = 'message'
      let datos = ''
      for (const linea of bloque.split('\n')) {
        if (linea.startsWith('event: ')) evento = linea.slice(7)
        else if (linea.startsWith('data: ')) datos += linea.slice(6)
      }
      yield { evento, datos: JSON.parse(datos) }
    }
  }
}

export const api = {
  estado: () => pedir<Estado>('/estado'),

  yo: () => pedir<Usuario | null>('/auth/yo'),
  registrarse: (nombre: string, email: string, password: string) =>
    pedir<Usuario>('/auth/registro', conJson('POST', { nombre, email, password })),
  entrar: (email: string, password: string) => pedir<Usuario>('/auth/login', conJson('POST', { email, password })),
  entrarComoInvitado: () => pedir<Usuario>('/auth/invitado', { method: 'POST' }),
  guardarCuenta: (nombre: string, email: string, password: string) =>
    pedir<Usuario>('/auth/convertir', conJson('POST', { nombre, email, password })),
  salir: () => pedir<void>('/auth/logout', { method: 'POST' }),
  cambiarNombre: (nombre: string) => pedir<Usuario>('/auth/perfil', conJson('PUT', { nombre })),

  materias: () => pedir<Materia[]>('/materias'),
  crearMateria: (nombre: string) => pedir<Materia>('/materias', conJson('POST', { nombre })),
  renombrarMateria: (id: number, nombre: string) => pedir<Materia>(`/materias/${id}`, conJson('PUT', { nombre })),
  borrarMateria: (id: number) => pedir<void>(`/materias/${id}`, { method: 'DELETE' }),

  documentos: (materiaId: number) => pedir<Documento[]>(`/materias/${materiaId}/documentos`),
  subirDocumento: (materiaId: number, archivo: File) => {
    const formulario = new FormData()
    formulario.append('archivo', archivo)
    return pedir<Documento | SubidaPendiente>(`/materias/${materiaId}/documentos`, { method: 'POST', body: formulario })
  },
  procesando: (materiaId: number) => pedir<SubidaPendiente[]>(`/materias/${materiaId}/documentos/procesando`),
  documento: (id: number) => pedir<DocumentoDetalle>(`/documentos/${id}`),
  borrarDocumento: (id: number) => pedir<void>(`/documentos/${id}`, { method: 'DELETE' }),
  resumir: (id: number) => pedir<DocumentoDetalle>(`/documentos/${id}/resumen`, { method: 'POST' }),
  generarFlashcards: (id: number, cantidad: number) => pedir<Flashcard[]>(`/documentos/${id}/flashcards`, conJson('POST', { cantidad })),

  chat: (materiaId: number) => pedir<Mensaje[]>(`/materias/${materiaId}/chat`),
  /** Pregunta y va llamando a `alEscribir` con el texto acumulado mientras la IA responde. */
  preguntar: async (materiaId: number, pregunta: string, alEscribir: (texto: string) => void): Promise<Mensaje> => {
    const respuesta = await llamar(`/materias/${materiaId}/chat/en-vivo`, conJson('POST', { pregunta }))
    let texto = ''
    for await (const { evento, datos } of leerEventos(respuesta)) {
      if (evento === 'texto') {
        texto += datos as string
        alEscribir(texto)
      } else if (evento === 'fin') {
        return datos as Mensaje
      } else if (evento === 'error') {
        throw new Error((datos as { detail: string }).detail)
      }
    }
    throw new Error(MENSAJES[idioma].cortado)
  },
  borrarChat: (materiaId: number) => pedir<void>(`/materias/${materiaId}/chat`, { method: 'DELETE' }),

  flashcards: (materiaId: number) => pedir<Flashcard[]>(`/materias/${materiaId}/flashcards`),
  pendientes: (materiaId: number) => pedir<Flashcard[]>(`/materias/${materiaId}/flashcards/pendientes`),
  urlExportarFlashcards: (materiaId: number) => urlApi(`/materias/${materiaId}/flashcards/exportar`),
  crearFlashcard: (materiaId: number, frente: string, dorso: string) =>
    pedir<Flashcard>(`/materias/${materiaId}/flashcards`, conJson('POST', { frente, dorso })),
  editarFlashcard: (id: number, frente: string, dorso: string) => pedir<Flashcard>(`/flashcards/${id}`, conJson('PUT', { frente, dorso })),
  repasar: (id: number, calidad: number) => pedir<Flashcard>(`/flashcards/${id}/repaso`, conJson('POST', { calidad })),
  borrarFlashcard: (id: number) => pedir<void>(`/flashcards/${id}`, { method: 'DELETE' }),

  salas: () => pedir<Sala[]>('/salas'),
  crearSala: (nombre: string) => pedir<Sala>('/salas', conJson('POST', { nombre })),
  sala: (codigo: string) => pedir<SalaDetalle>(`/salas/${encodeURIComponent(codigo)}`),
  salaPersonal: () => pedir<Sala>('/salas/personal', { method: 'POST' }),
  archivosSala: (codigo: string) => pedir<ArchivoSala[]>(`/salas/${encodeURIComponent(codigo)}/archivos`),
  subirArchivoSala: (codigo: string, archivo: File) => {
    const formulario = new FormData()
    formulario.append('archivo', archivo)
    return pedir<ArchivoSala>(`/salas/${encodeURIComponent(codigo)}/archivos`, { method: 'POST', body: formulario })
  },
  urlArchivoSala: (codigo: string, id: number) => urlApi(`/salas/${encodeURIComponent(codigo)}/archivos/${id}`),
  borrarArchivoSala: (codigo: string, id: number) =>
    pedir<void>(`/salas/${encodeURIComponent(codigo)}/archivos/${id}`, { method: 'DELETE' }),
  /** Arma una trivia para toda la sala con hasta 3 archivos; la invitación llega por la sala en vivo. */
  crearTrivia: (
    codigo: string,
    tema: string,
    archivos: File[],
    opciones: { modo: string; dificultad: string; cantidad: number; rival: number | null },
  ) => {
    const formulario = new FormData()
    formulario.append('tema', tema)
    formulario.append('modo', opciones.modo)
    formulario.append('dificultad', opciones.dificultad)
    formulario.append('cantidad', String(opciones.cantidad))
    if (opciones.rival !== null) formulario.append('rival', String(opciones.rival))
    for (const archivo of archivos) formulario.append('archivos', archivo)
    return pedir<void>(`/salas/${encodeURIComponent(codigo)}/trivia`, { method: 'POST', body: formulario })
  },
  tablero: (codigo: string) => pedir<ItemTablero[]>(`/salas/${encodeURIComponent(codigo)}/tablero`),
  agregarAlTablero: (codigo: string, tipo: 'meta' | 'nota', texto: string) =>
    pedir<ItemTablero>(`/salas/${encodeURIComponent(codigo)}/tablero`, conJson('POST', { tipo, texto })),
  tildarMeta: (codigo: string, id: number, hecho: boolean) =>
    pedir<ItemTablero>(`/salas/${encodeURIComponent(codigo)}/tablero/${id}`, conJson('PATCH', { hecho })),
  borrarDelTablero: (codigo: string, id: number) => pedir<void>(`/salas/${encodeURIComponent(codigo)}/tablero/${id}`, { method: 'DELETE' }),
  archivoSalaAMateria: (codigo: string, id: number, materiaId: number) =>
    pedir<Documento | SubidaPendiente>(
      `/salas/${encodeURIComponent(codigo)}/archivos/${id}/a-materia`,
      conJson('POST', { materia_id: materiaId }),
    ),
  imagenesPizarra: (codigo: string) =>
    pedir<{ id: string; mimeType: string; dataURL: string; created: number }[]>(`/salas/${encodeURIComponent(codigo)}/imagenes`),
  urlTiempoReal: (codigo: string) =>
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${urlApi(`/salas/${encodeURIComponent(codigo)}/ws`)}`,

  rincon: () => pedir<Rincon>('/rincon'),
  logros: () => pedir<Logro[]>('/rincon/logros'),
  insignias: (usuarioId: number) => pedir<{ clave: string; emoji: string }[]>(`/rincon/insignias/${usuarioId}`),
  comprar: (articulo: string) => pedir<Rincon>('/rincon/comprar', conJson('POST', { articulo })),
  cambiarApariencia: (apariencia: Apariencia) => pedir<Rincon>('/rincon/apariencia', conJson('PUT', apariencia)),
  subirFoto: (imagen: string) => pedir<Rincon>('/rincon/foto', conJson('PUT', { imagen })),
  quitarFoto: () => pedir<Rincon>('/rincon/foto', { method: 'DELETE' }),
  cambiarPerfil: (perfil: { color_apodo?: string; descripcion?: string }) => pedir<Rincon>('/rincon/perfil', conJson('PUT', perfil)),
  subirFotoMascota: (imagen: string) => pedir<Rincon>('/rincon/foto-mascota', conJson('PUT', { imagen })),

  entrarConDiscord: (code: string) =>
    pedir<{ access_token: string; sesion: string; usuario: Usuario }>('/discord/token', conJson('POST', { code })),
  salaDeDiscord: (instancia: string, nombre?: string) => pedir<Sala>('/discord/sala', conJson('POST', { instancia, nombre })),

  conceptos: (materiaId: number, tema: string | null) =>
    pedir<Concepto[]>(`/materias/${materiaId}/conceptos`, conJson('POST', { tema, cantidad: 10 })),
  quiz: (materiaId: number, tema: string, cantidad: number) =>
    pedir<{ preguntas: Pregunta[] }>(`/materias/${materiaId}/quiz`, conJson('POST', { tema: tema.trim() || null, cantidad })),
}

export function mensajeDeError(e: unknown): string {
  return e instanceof Error ? e.message : MENSAJES[idioma].error
}
