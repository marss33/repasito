export interface Estado {
  ia_configurada: boolean
  ocr_disponible: boolean
  limite_diario: number
  max_documentos: number
  max_archivo_mb: number
  max_paginas_escaneadas: number
  discord_client_id: string | null
  solo_discord?: boolean // en producción la app se usa solo desde Discord
}

export interface Usuario {
  id: number
  nombre: string
  email: string
  es_invitado: boolean
  usos_hoy: number
  limite_diario: number
  monedas: number
  foto: number // versión de la foto de perfil (0 = no tiene)
}

export interface Materia {
  id: number
  nombre: string
  documentos: number
  flashcards: number
  pendientes: number
}

export type TipoDocumento = 'pdf' | 'word' | 'presentacion' | 'planilla' | 'texto' | 'imagen'

export interface Documento {
  id: number
  nombre: string
  tipo: TipoDocumento
  paginas: number
  fragmentos: number
  tiene_resumen: boolean
  creado: string
  monedas_ganadas?: number
}

/** Un apunte que el servidor sigue procesando (fotos, escaneos): aparece solo cuando termina. */
export interface SubidaPendiente {
  id: string
  nombre: string
  estado: 'procesando' | 'listo' | 'error'
  error: string | null
  monedas_ganadas: number
}

export function esPendiente(r: Documento | SubidaPendiente): r is SubidaPendiente {
  return 'estado' in r
}

export interface DocumentoDetalle extends Documento {
  resumen: string | null
}

export interface Fuente {
  n: number
  documento: string
  ubicacion: string
  cita: string
}

export interface Mensaje {
  id: number
  rol: 'user' | 'assistant'
  texto: string
  fuentes: Fuente[]
  creado: string
}

export interface Flashcard {
  id: number
  documento_id: number | null
  frente: string
  dorso: string
  intervalo: number
  repeticiones: number
  proxima: string
}

export interface Sala {
  codigo: string
  nombre: string
  personas: number
  personal?: boolean
}

export interface MensajeSala {
  id: number
  usuario_id: number | null
  nombre: string
  texto: string
  creado: string
  reacciones?: Record<string, number[]> // emoji -> ids de quienes reaccionaron
  encuesta?: { opciones: string[]; votos: number[][] } | null
}

export interface Logro {
  clave: string
  emoji: string
  actual: number
  meta: number
  monedas: number
  logrado: boolean
}

export interface Concepto {
  termino: string
  pista: string
}

export interface ItemTablero {
  id: number
  tipo: 'meta' | 'nota'
  texto: string
  hecho: boolean
  hecho_por: string | null
  por: string
  usuario_id: number | null
  creado: string
}

export interface SalaDetalle extends Sala {
  mensajes: MensajeSala[]
  creador_id: number | null
}

export interface Pregunta {
  enunciado: string
  opciones: string[]
  correcta: number
  explicacion: string
}

export type TipoArticulo =
  | 'peinado'
  | 'ropa'
  | 'abajo'
  | 'calzado'
  | 'sombrero'
  | 'lentes'
  | 'adorno'
  | 'traje'
  | 'mascota'
  | 'cabeza'
  | 'cara'
  | 'cuello'
  | 'decoracion'

export interface Articulo {
  id: string
  tipo: TipoArticulo
  precio: number
}

export interface Apariencia {
  mascota: string
  nombre: string
  cabeza?: string | null
  cara?: string | null
  cuello?: string | null
  decoracion: string[]
  foto?: number
  foto_mascota?: number // versión de la foto de la mascota personalizada
  // Avatar: lo que se compra
  peinado: string
  ropa: string
  sombrero?: string | null
  lentes?: string | null
  // Avatar: colores libres
  piel: string
  pelo: string
  ojos: string
  labios: string
  unas: string
  color_ropa: string
  escena: 'escritorio' | 'chimenea'
  // Avatar pixel
  silueta?: 'a' | 'b' | 'c'
  abajo?: string
  calzado?: string
  adorno?: string | null
  color_abajo?: string
  color_calzado?: string
  color_accesorio?: string
  // Facciones (gratis)
  ojos_forma: 'redondos' | 'almendrados' | 'cansados' | 'cuadrados'
  pestanas: boolean
  rubor: boolean
  pecas: boolean
  traje?: string | null // ropa en conjunto (ver Rincon.trajes)
  color_apodo?: string | null // perfil: color del apodo
  descripcion?: string | null // perfil: qué estudia o cómo se siente
}

export interface Rincon {
  monedas: number
  foto_mascota: number
  comprados: string[]
  habilitados: string[] // lo que puede usar: comprado, gratis o incluido en un traje suyo
  trajes: Record<
    string,
    { piezas: Partial<Record<'ropa' | 'abajo' | 'calzado' | 'adorno', string>>; colores: Record<string, string>; capa?: string }
  >
  apariencia: Apariencia
  foto: number
  catalogo: Articulo[]
  ganado_hoy: { archivos: number; salas: number }
  topes: { archivos: number; salas: number }
  reglas: { por_archivo: number; por_minuto_de_pomodoro: number }
}

export interface ArchivoSala {
  id: number
  nombre: string
  mime: string
  tamano: number
  por: string
  usuario_id: number | null
  creado: string
}
