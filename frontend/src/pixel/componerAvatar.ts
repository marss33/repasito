import { useEffect, useState } from 'react'
import type { Apariencia } from '../types'
import piezas from './piezas_avatar.json'

/* Avatar pixel armado con piezas de LPC (ver scripts/armar_avatar_pixel.py y CREDITOS_ARTE.md).
 * Las piezas vienen en un "atlas" (una sola imagen); acá se apilan en orden y cada una se tiñe con su
 * color libre (piel, pelo, ropa…) conservando las luces y sombras del pixel art. */

export type Pose = 'sit' | 'idle'
type Silueta = keyof typeof piezas.siluetas

interface Atlas {
  imagen: HTMLImageElement
  lado: number
  marcos: Record<string, [number, number]>
}

let atlasPrometido: Promise<Atlas> | null = null

function cargarAtlas(): Promise<Atlas> {
  if (!atlasPrometido) {
    const base = `${import.meta.env.BASE_URL}pixel/`
    atlasPrometido = Promise.all([
      fetch(`${base}avatar.json`).then((r) => r.json() as Promise<{ lado: number; marcos: Record<string, [number, number]> }>),
      new Promise<HTMLImageElement>((resolver, rechazar) => {
        const img = new Image()
        img.onload = () => resolver(img)
        img.onerror = rechazar
        img.src = `${base}avatar.png`
      }),
    ]).then(([indice, imagen]) => ({ imagen, lado: indice.lado, marcos: indice.marcos }))
    atlasPrometido.catch(() => {
      atlasPrometido = null
    })
  }
  return atlasPrometido
}

// --- Colores ---

function hexARgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbAHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function hslARgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const canal = (t: number) => {
    t = (t + 1) % 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255]
}

const esContorno = (r: number, g: number, b: number) => r < 60 && g < 50 && b < 60

/** Tiñe una pieza con un color: cada píxel conserva qué tan claro u oscuro era respecto del resto. */
function teñir(datos: ImageData, color: string) {
  const p = datos.data
  const luces: number[] = []
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] && !esContorno(p[i], p[i + 1], p[i + 2])) luces.push((0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255)
  }
  if (!luces.length) return
  luces.sort((a, b) => a - b)
  const media = luces[Math.floor(luces.length / 2)]
  const [h, s, l] = rgbAHsl(...hexARgb(color))
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3] || esContorno(p[i], p[i + 1], p[i + 2])) continue
    const luz = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255
    const nueva = Math.max(0.03, Math.min(0.97, l + (luz - media) * 0.9))
    const [r, g, b] = hslARgb(h, s, nueva)
    p[i] = r
    p[i + 1] = g
    p[i + 2] = b
  }
}

// --- Qué piezas lleva cada apariencia ---

type Pieza = string | { ruta: string; color: string | null }

interface Capa {
  ruta: string
  color: string | null // la clave del color libre (piel, pelo…) o null
}

function idLpc(id: string | null | undefined, prefijo: string) {
  return id && id.startsWith(prefijo) ? id.slice(prefijo.length) : null
}

function rutaDePieza(
  grupo: { piezas: Record<string, Pieza>; _color?: string },
  id: string | null,
  s: (typeof piezas.siluetas)[Silueta],
): Capa | null {
  if (!id || !(id in grupo.piezas)) return null
  const pieza = grupo.piezas[id]
  const ruta = typeof pieza === 'string' ? pieza : pieza.ruta
  const color = typeof pieza === 'string' ? (grupo._color ?? null) : pieza.color
  return { ruta: ruta.replace('{torso}', s.torso).replace('{piernas}', s.piernas).replace('{cuello}', s.cuello), color }
}

export type AparienciaPixel = Partial<Apariencia>

/** Las capas de abajo hacia arriba. */
export function capasDe(a: AparienciaPixel): Capa[] {
  const silueta: Silueta = a.silueta && a.silueta in piezas.siluetas ? (a.silueta as Silueta) : 'a'
  const s = piezas.siluetas[silueta]
  const pelo = idLpc(a.peinado, 'pelo-')?.replace(/-/g, '_')
  const conCapas = !!pelo && piezas.peinado.con_capas.includes(pelo)
  const peinado = pelo && (conCapas || piezas.peinado.lista.includes(pelo)) ? pelo : piezas.peinado._gratis[0]
  const rutaPelo = piezas.peinado._ruta.replace('{id}', peinado)
  const ropa = rutaDePieza(piezas.ropa, idLpc(a.ropa, 'ropa-'), s) ?? rutaDePieza(piezas.ropa, 'buzo', s)
  const abajo = rutaDePieza(piezas.abajo, idLpc(a.abajo, 'abajo-'), s) ?? rutaDePieza(piezas.abajo, 'pantalon', s)
  const calzado = rutaDePieza(piezas.calzado, idLpc(a.calzado, 'calzado-'), s) ?? rutaDePieza(piezas.calzado, 'zapatillas', s)
  const trajes: Record<string, string> = piezas.trajes
  const capaTraje = a.traje && trajes[a.traje] ? { ruta: trajes[a.traje].replace('{torso}', s.torso), color: 'color_abajo' } : null
  return [
    // el pelo largo cae por detrás del cuerpo
    conCapas ? { ruta: `${rutaPelo}/bg`, color: 'pelo' } : null,
    { ruta: s.cuerpo, color: 'piel' },
    calzado,
    abajo,
    ropa,
    capaTraje, // jardinero o tiradores, encima de la ropa
    rutaDePieza(piezas.adorno, idLpc(a.adorno, 'adorno-'), s),
    { ruta: s.cabeza, color: 'piel' },
    // los ojos no son una pieza: se dibujan encima de la cabeza (ver dibujarCara)
    { ruta: conCapas ? `${rutaPelo}/fg` : rutaPelo, color: 'pelo' },
    rutaDePieza(piezas.lentes, idLpc(a.lentes, 'anteojos-'), s),
    rutaDePieza(piezas.sombrero, idLpc(a.sombrero, 'gorro-'), s),
  ].filter((c): c is Capa => !!c)
}

export const COLORES_POR_DEFECTO: Record<string, string> = {
  piel: '#f1c8a8',
  pelo: '#6b4226',
  ojos: '#2e86c1',
  color_ropa: '#7fb3a6',
  color_abajo: '#3b4a6b',
  color_calzado: '#5a3825',
  color_accesorio: '#e88aa8',
}

const cache = new Map<string, string>()

/** Arma el avatar y lo devuelve como imagen (data URL de 64×64). */
export async function dibujarAvatar(a: AparienciaPixel, pose: Pose = 'sit'): Promise<string> {
  const capas = capasDe(a)
  const colores = Object.fromEntries(
    Object.keys(COLORES_POR_DEFECTO).map((k) => [k, (a as Record<string, string>)[k] || COLORES_POR_DEFECTO[k]]),
  )
  const cara = [a.ojos_forma ?? 'redondos', !!a.pestanas, a.rubor !== false, !!a.pecas]
  const clave = JSON.stringify([pose, capas, colores, cara])
  const guardada = cache.get(clave)
  if (guardada) return guardada

  const atlas = await cargarAtlas()
  const L = atlas.lado
  const lienzo = document.createElement('canvas')
  lienzo.width = lienzo.height = L
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })!
  const capa = document.createElement('canvas')
  capa.width = capa.height = L
  const cctx = capa.getContext('2d', { willReadFrequently: true })!
  const cabeza = piezas.siluetas[(a.silueta && a.silueta in piezas.siluetas ? a.silueta : 'a') as Silueta].cabeza

  for (const c of capas) {
    // Algunas piezas no existen en talla delgada (thin): se usa la de la silueta 1, que calza igual
    const alternativa = c.ruta.replace(/\/thin$/, '/female')
    const marco =
      atlas.marcos[`${c.ruta}|${pose}`] ??
      atlas.marcos[`${c.ruta}|idle`] ??
      atlas.marcos[`${alternativa}|${pose}`] ??
      atlas.marcos[`${alternativa}|idle`]
    if (!marco) continue
    cctx.clearRect(0, 0, L, L)
    cctx.drawImage(atlas.imagen, marco[0], marco[1], L, L, 0, 0, L, L)
    const datos = cctx.getImageData(0, 0, L, L)
    if (c.color) teñir(datos, colores[c.color] ?? COLORES_POR_DEFECTO[c.color] ?? '#888888')
    cctx.putImageData(datos, 0, 0)
    ctx.drawImage(capa, 0, 0)
    // Ojos, pestañas, rubor y pecas van sobre la cabeza y debajo del pelo
    if (c.ruta === cabeza) dibujarCara(ctx, a, pose, colores)
  }
  const url = lienzo.toDataURL()
  cache.set(clave, url)
  return url
}

// --- La cara, dibujada a mano ---
// Cada ojo mide 4×4. Letras: s piel · k contorno · w blanco · i iris · d pupila · b ojera.
// Se dibuja el ojo izquierdo (la columna 0 es el rabito de afuera) y el derecho es su espejo.
export const FORMAS_DE_OJOS: Record<string, { mapa: string[]; parpado: number }> = {
  redondos: { mapa: ['skks', 'kwdk', 'kidk', 'skks'], parpado: 0 },
  almendrados: { mapa: ['ssss', 'skkk', 'kwdi', 'sskk'], parpado: 1 },
  cansados: { mapa: ['ssss', 'kkkk', 'sdis', 'sbbs'], parpado: 1 },
  cuadrados: { mapa: ['kkkk', 'widw', 'wddw', 'kkkk'], parpado: 0 },
}

// Dónde está la cara dentro del cuadro de 64×64 (igual para las dos siluetas)
const OJO_X = 26 // primera columna del ojo izquierdo; el derecho es 63 - x
const OJO_Y: Record<Pose, number> = { idle: 28, sit: 26 }

function rgb([r, g, b]: [number, number, number]) {
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`
}

function cambiarLuz(hex: string, dl: number, ds = 0) {
  const [h, s, l] = rgbAHsl(...hexARgb(hex))
  return rgb(hslARgb(h, Math.max(0, Math.min(1, s + ds)), Math.max(0.04, Math.min(0.96, l + dl))))
}

function dibujarCara(ctx: CanvasRenderingContext2D, a: AparienciaPixel, pose: Pose, colores: Record<string, string>) {
  const y0 = OJO_Y[pose]
  // El color de la piel ya teñida, tomado del medio de la cara
  const [r, g, b] = ctx.getImageData(31, y0 + 2, 1, 1).data
  const piel = `rgb(${r}, ${g}, ${b})`
  const forma = FORMAS_DE_OJOS[a.ojos_forma ?? 'redondos'] ?? FORMAS_DE_OJOS.redondos
  const paleta: Record<string, string> = {
    s: piel,
    k: '#2a1a20',
    w: '#f7f4f0',
    i: colores.ojos,
    d: cambiarLuz(colores.ojos, -0.28),
    b: cambiarLuz(`#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`, -0.1),
  }
  const punto = (x: number, y: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(x, y, 1, 1)
    ctx.fillRect(63 - x, y, 1, 1)
  }
  // Se borran los ojos que trae la cabeza (y la fila de arriba, donde algunas tienen brillo)
  for (let y = y0 - 1; y < y0 + 4; y++) for (let x = OJO_X - 1; x < OJO_X + 4; x++) punto(x, y, piel)
  forma.mapa.forEach((fila, j) => [...fila].forEach((letra, i) => punto(OJO_X + i, y0 + j, paleta[letra])))
  if (a.pestanas) {
    // Párpado más marcado y dos pelitos hacia arriba, del lado de afuera (los costados los tapa el pelo)
    const lid = y0 + forma.parpado
    for (let i = 0; i < 4; i++) punto(OJO_X + i, lid, paleta.k)
    punto(OJO_X, lid - 1, paleta.k)
    punto(OJO_X + 2, lid - 1, paleta.k)
  }
  // Mejillas: siempre en el mismo lugar, debajo de los ojos, sea cual sea la forma
  const yMejilla = y0 + 4
  if (a.rubor !== false) {
    ctx.fillStyle = 'rgba(240, 100, 120, 0.6)'
    ctx.fillRect(OJO_X, yMejilla, 2, 1)
    ctx.fillRect(63 - OJO_X - 1, yMejilla, 2, 1)
  }
  if (a.pecas) {
    const peca = cambiarLuz(`#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`, -0.28, 0.12)
    punto(OJO_X + 2, yMejilla, peca)
    punto(OJO_X + 4, yMejilla, peca)
    punto(OJO_X + 3, yMejilla + 1, peca)
  }
}

/** Hook: la imagen del avatar (null mientras se arma). */
export function useAvatarPixel(a: AparienciaPixel | null | undefined, pose: Pose = 'sit') {
  const [url, setUrl] = useState<string | null>(null)
  const clave = a ? JSON.stringify(a) : ''
  useEffect(() => {
    if (!a) return
    let vivo = true
    dibujarAvatar(a, pose).then((u) => vivo && setUrl(u))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, pose])
  return url
}
