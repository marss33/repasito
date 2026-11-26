import { createContext, useContext, useEffect, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import type { Apariencia } from '../../types'
import type { EstadoPomodoro } from '../../useSala'
import { AvatarPixelSvg } from '../../pixel/AvatarPixel'
import { Sprite } from '../../pixel/Sprite'
import { fotoDeMascota, MascotaPixel, medidasMascota } from '../../pixel/MascotaPixel'
import { TEMAS } from './Tematicas'

/* Las salas en pixel art, estilo granja cozy: todo se dibuja con rectángulos sobre una grilla chica
 * (cada unidad del viewBox es un píxel) y el SVG se agranda sin suavizar. */

export type Ambiente = 'medianoche' | 'amanecer' | 'dia' | 'cafe' | 'lluvia' | 'nieve'
/** El orden en que cambia el clima al tocar una ventana. */
export const CLIMAS: Ambiente[] = ['medianoche', 'amanecer', 'dia', 'cafe', 'lluvia', 'nieve']
export function siguienteClima(actual: Ambiente): Ambiente {
  return CLIMAS[(CLIMAS.indexOf(actual) + 1) % CLIMAS.length]
}
export type EscenaSolo = 'escritorio' | 'chimenea'
export type EscenaGrupo = 'biblioteca' | 'aula'

export interface Persona {
  id: number
  nombre: string
  apariencia: Apariencia
}

// Paleta cálida (madera, crema y sombras marrones en vez de negro)
export const C = {
  contorno: '#3b2417',
  maderaOscura: '#6b4128',
  madera: '#8a5a3b',
  maderaClara: '#b07a4f',
  maderaLuz: '#d29e68',
  crema: '#f6e7c8',
  papel: '#fbf3df',
  sombra: 'rgba(43, 24, 16, 0.28)',
}

// En las escenas, (x, y) del avatar es el borde de abajo del cuadro de 64×64. El asiento queda 20 px más arriba.
const ASIENTO = 20

type PropsR = { x: number; y: number; w: number; h: number; c: string; o?: number; className?: string; style?: CSSProperties }

export function R({ x, y, w, h, c, o, className, style }: PropsR) {
  return <rect x={x} y={y} width={w} height={h} fill={c} opacity={o} className={className} style={style} />
}

/** Un círculo hecho de filas de píxeles. */
export function Disco({
  cx,
  cy,
  r,
  c,
  o,
  aplastado = 1,
}: {
  cx: number
  cy: number
  r: number
  c: string
  o?: number
  aplastado?: number
}) {
  const filas = []
  const alto = Math.max(1, Math.round(r * aplastado))
  for (let dy = -alto; dy < alto; dy++) {
    const t = (dy + 0.5) / alto
    const media = Math.round(r * Math.sqrt(Math.max(0, 1 - t * t)))
    if (media > 0) filas.push(<rect key={dy} x={cx - media} y={cy + dy} width={media * 2} height={1} />)
  }
  return (
    <g fill={c} opacity={o}>
      {filas}
    </g>
  )
}

/** Luz cálida: varios discos muy transparentes, uno dentro de otro. */
function Brillo({ cx, cy, r, c = '#ffd27a', fuerza = 0.07 }: { cx: number; cy: number; r: number; c?: string; fuerza?: number }) {
  return (
    <g className="brasa" style={{ mixBlendMode: 'screen' }}>
      {[1, 0.72, 0.46].map((k) => (
        <Disco key={k} cx={cx} cy={cy} r={Math.round(r * k)} c={c} o={fuerza} />
      ))}
    </g>
  )
}

function Lienzo({
  ancho,
  alto,
  etiqueta,
  cubrir = false,
  children,
}: {
  ancho: number
  alto: number
  etiqueta: string
  cubrir?: boolean // llenar todo el contenedor (recortando los bordes), para usarla de fondo
  children: ReactNode
}) {
  return (
    <svg
      viewBox={`0 0 ${ancho} ${alto}`}
      className="escena escena-pixel block h-full w-full"
      shapeRendering="crispEdges"
      preserveAspectRatio={cubrir ? 'xMidYMid slice' : undefined}
      role="group"
      aria-label={etiqueta}
    >
      {children}
    </svg>
  )
}

// --- Paredes y pisos ---

function Empapelado({ ancho, alto, base, raya, motivo }: { ancho: number; alto: number; base: string; raya: string; motivo?: string }) {
  const n = Math.ceil(ancho / 8)
  return (
    <g>
      <R x={0} y={0} w={ancho} h={alto} c={base} />
      {Array.from({ length: n }, (_, i) => (
        <R key={i} x={i * 8 + 3} y={0} w={2} h={alto} c={raya} />
      ))}
      {motivo &&
        Array.from({ length: n }, (_, i) =>
          Array.from({ length: Math.ceil(alto / 10) }, (_, j) => (
            <R key={`${i}-${j}`} x={i * 8 + 7} y={j * 10 + (i % 2) * 5 + 2} w={1} h={1} c={motivo} />
          )),
        )}
    </g>
  )
}

function PisoDeMadera({ y, ancho, alto }: { y: number; ancho: number; alto: number }) {
  const filas = Math.ceil(alto / 4)
  return (
    <g>
      <R x={0} y={y} w={ancho} h={alto} c="#8a5a3b" />
      {Array.from({ length: filas }, (_, j) => (
        <g key={j}>
          <R x={0} y={y + j * 4} w={ancho} h={1} c="#6b4128" />
          <R x={0} y={y + j * 4 + 1} w={ancho} h={1} c="#9a6a45" />
          {Array.from({ length: Math.ceil(ancho / 24) + 1 }, (_, i) => (
            <R key={i} x={i * 24 - (j % 2) * 12} y={y + j * 4} w={1} h={4} c="#6b4128" />
          ))}
        </g>
      ))}
    </g>
  )
}

function Zocalo({ y, ancho }: { y: number; ancho: number }) {
  return (
    <g>
      <R x={0} y={y} w={ancho} h={1} c={C.maderaLuz} />
      <R x={0} y={y + 1} w={ancho} h={3} c={C.madera} />
      <R x={0} y={y + 4} w={ancho} h={1} c={C.contorno} />
    </g>
  )
}

// --- Muebles y objetos ---

const CIELOS: Record<Ambiente, string[]> = {
  medianoche: ['#1b1f4a', '#26306a', '#34428a', '#4a5aa8'],
  lluvia: ['#3d4a5c', '#4a596e', '#586a80', '#687b92'],
  cafe: ['#f3a65a', '#f28a6a', '#c86a8a', '#7a5aa0'],
  dia: ['#5aa8e8', '#78bcf0', '#9ad0f6', '#c2e4fa'],
  amanecer: ['#4a4a8a', '#9a7ab8', '#f2a08a', '#ffd8a0'],
  nieve: ['#8494b0', '#98a8c2', '#b2bfd4', '#cdd6e4'],
}
const ARBOLES: Record<Ambiente, string> = {
  medianoche: '#16243a',
  lluvia: '#2f3b45',
  cafe: '#5a3a6a',
  dia: '#3f7a4a',
  amanecer: '#4a3a5a',
  nieve: '#4a5a6a',
}

/** Una ventana con el cielo según el clima de la sala. Si se puede tocar, tocarla cambia el clima. */
export function Ventana({
  x,
  y,
  ancho,
  alto,
  ambiente,
  onClima,
  etiquetaClima,
  cortinas = true,
  paneles = 2,
  marco = C.madera,
}: {
  x: number
  y: number
  ancho: number
  alto: number
  ambiente: Ambiente
  onClima?: () => void
  etiquetaClima?: string
  cortinas?: boolean
  paneles?: number // divisiones verticales del vidrio
  marco?: string
}) {
  const dibujo = (
    <VentanaDibujo x={x} y={y} ancho={ancho} alto={alto} ambiente={ambiente} cortinas={cortinas} paneles={paneles} marco={marco} />
  )
  return onClima ? (
    <BotonPixel etiqueta={etiquetaClima ?? ''} onClick={onClima}>
      {dibujo}
    </BotonPixel>
  ) : (
    dibujo
  )
}

function VentanaDibujo({
  x,
  y,
  ancho,
  alto,
  ambiente,
  cortinas,
  paneles,
  marco,
}: {
  x: number
  y: number
  ancho: number
  alto: number
  ambiente: Ambiente
  cortinas: boolean
  paneles: number
  marco: string
}) {
  const cielo = CIELOS[ambiente]
  const banda = Math.ceil(alto / cielo.length)
  const estrellas = [
    [0.14, 0.14],
    [0.32, 0.3],
    [0.5, 0.1],
    [0.66, 0.34],
    [0.84, 0.18],
    [0.24, 0.52],
  ]
  const arboles = Array.from({ length: Math.ceil(ancho / 6) }, (_, i) => 3 + ((i * 7) % 5))
  return (
    <g>
      {/* marco */}
      <R x={x - 3} y={y - 3} w={ancho + 6} h={alto + 6} c={C.contorno} />
      <R x={x - 2} y={y - 2} w={ancho + 4} h={alto + 4} c={marco} />
      <R x={x - 2} y={y - 2} w={ancho + 4} h={1} c="#ffffff" o={0.25} />
      <svg x={x} y={y} width={ancho} height={alto} overflow="hidden">
        {cielo.map((col, i) => (
          <R key={col} x={0} y={i * banda} w={ancho} h={banda + 1} c={col} />
        ))}
        {ambiente === 'medianoche' && (
          <>
            {estrellas.map(([ex, ey], i) => (
              <R
                key={i}
                x={Math.round(ex * ancho)}
                y={Math.round(ey * alto)}
                w={1}
                h={1}
                c="#fff6c4"
                className="titila"
                style={{ animationDelay: `${-i * 0.7}s` }}
              />
            ))}
            <Disco cx={Math.round(ancho * 0.76)} cy={Math.round(alto * 0.26)} r={4} c="#fff1b8" />
            <Disco cx={Math.round(ancho * 0.76) - 2} cy={Math.round(alto * 0.26) - 1} r={3} c={cielo[0]} />
          </>
        )}
        {ambiente === 'cafe' && <Disco cx={Math.round(ancho * 0.3)} cy={Math.round(alto * 0.7)} r={5} c="#ffe08a" />}
        {ambiente === 'amanecer' && (
          <>
            <Disco cx={Math.round(ancho * 0.28)} cy={Math.round(alto * 0.86)} r={5} c="#ffd890" />
            <R x={0} y={Math.round(alto * 0.6)} w={ancho} h={1} c="#ffe0b0" o={0.6} />
          </>
        )}
        {ambiente === 'dia' && (
          <>
            <Disco cx={Math.round(ancho * 0.78)} cy={Math.round(alto * 0.24)} r={4} c="#fff1a0" />
            {[
              [0.12, 0.2],
              [0.46, 0.36],
            ].map(([nx, ny], i) => (
              <g key={i} fill="#ffffff" opacity={0.9}>
                <rect x={Math.round(nx * ancho)} y={Math.round(ny * alto)} width={9} height={2} />
                <rect x={Math.round(nx * ancho) + 2} y={Math.round(ny * alto) - 1} width={4} height={1} />
              </g>
            ))}
          </>
        )}
        {/* copas de árboles a lo lejos */}
        <g fill={ARBOLES[ambiente]}>
          {arboles.map((h, i) => (
            <g key={i}>
              <rect x={i * 6} y={alto - h - 2} width={6} height={h + 2} />
              <rect x={i * 6 + 1} y={alto - h - 3} width={4} height={1} />
            </g>
          ))}
        </g>
        {ambiente === 'lluvia' && (
          <g className="lluvia-pixel" fill="#c9d6e6" opacity={0.7}>
            {Array.from({ length: Math.ceil(ancho / 4) }, (_, i) => (
              <rect key={i} x={(i * 13) % ancho} y={(i * 17) % alto} width={1} height={3} />
            ))}
          </g>
        )}
        {ambiente === 'nieve' && (
          <>
            <g fill="#ffffff">
              {arboles.map((h, i) => (
                <rect key={i} x={i * 6 + 1} y={alto - h - 3} width={4} height={1} />
              ))}
              <rect x={0} y={alto - 2} width={ancho} height={2} />
            </g>
            <g className="nieve-pixel" fill="#ffffff" opacity={0.9}>
              {Array.from({ length: Math.ceil(ancho / 5) }, (_, i) => (
                <rect key={i} x={(i * 11) % ancho} y={(i * 7) % alto} width={1} height={1} />
              ))}
            </g>
          </>
        )}
      </svg>
      {/* parteluces */}
      {Array.from({ length: paneles - 1 }, (_, i) => (
        <R key={i} x={x + Math.round(((i + 1) * ancho) / paneles) - 1} y={y} w={2} h={alto} c={marco} />
      ))}
      <R x={x} y={y + Math.floor(alto / 2) - 1} w={ancho} h={2} c={marco} />
      {/* reflejo */}
      <R x={x + 2} y={y + 2} w={1} h={4} c="#ffffff" o={0.35} />
      <R x={x + 3} y={y + 2} w={2} h={1} c="#ffffff" o={0.35} />
      {/* alféizar y cortinas */}
      <R x={x - 5} y={y + alto + 3} w={ancho + 10} h={2} c={C.maderaClara} />
      <R x={x - 5} y={y + alto + 5} w={ancho + 10} h={1} c={C.contorno} />
      {cortinas && (
        <>
          <Cortina x={x - 6} y={y - 5} alto={alto + 8} />
          <Cortina x={x + ancho + 2} y={y - 5} alto={alto + 8} espejo />
          <R x={x - 8} y={y - 6} w={ancho + 16} h={2} c={C.maderaOscura} />
        </>
      )}
    </g>
  )
}

function Cortina({ x, y, alto, espejo = false }: { x: number; y: number; alto: number; espejo?: boolean }) {
  const ancho = 4
  return (
    <g>
      <R x={x} y={y} w={ancho} h={alto} c="#c25b56" />
      <R x={espejo ? x + ancho - 1 : x} y={y} w={1} h={alto} c="#8e3b3b" />
      <R x={espejo ? x : x + ancho - 1} y={y} w={1} h={alto} c="#e07f72" />
      <R x={x} y={y + Math.round(alto * 0.55)} w={ancho} h={1} c="#f2c35b" />
    </g>
  )
}

const LOMOS = ['#c2553a', '#e0a43a', '#4f8a5b', '#3f6aa0', '#8a5aa8', '#d97a9a', '#3d8f8a', '#e8d27a']

export function Estante({ x, y, ancho, semilla = 0 }: { x: number; y: number; ancho: number; semilla?: number }) {
  const libros = []
  let cursor = x + 1
  for (let i = 0; cursor < x + ancho - 3; i++) {
    const k = i + semilla
    const w = 2 + (k % 3 === 0 ? 1 : 0)
    const h = 6 + ((k * 5) % 4)
    const color = LOMOS[(k * 3) % LOMOS.length]
    libros.push(
      <g key={i}>
        <R x={cursor} y={y - h} w={w} h={h} c={color} />
        <R x={cursor} y={y - h + 2} w={w} h={1} c="#000000" o={0.2} />
        <R x={cursor} y={y - h} w={1} h={h} c="#ffffff" o={0.18} />
      </g>,
    )
    cursor += w + (k % 7 === 5 ? 3 : 0)
  }
  return (
    <g>
      {libros}
      <R x={x - 1} y={y} w={ancho + 2} h={2} c={C.maderaClara} />
      <R x={x - 1} y={y + 2} w={ancho + 2} h={1} c={C.contorno} />
      <R x={x + 1} y={y + 3} w={2} h={2} c={C.maderaOscura} />
      <R x={x + ancho - 3} y={y + 3} w={2} h={2} c={C.maderaOscura} />
    </g>
  )
}

/** Biblioteca de pared completa, con varios estantes. */
export function Biblioteca({ x, y, ancho, alto, semilla = 0 }: { x: number; y: number; ancho: number; alto: number; semilla?: number }) {
  const estantes = Math.floor((alto - 4) / 11)
  return (
    <g>
      <R x={x} y={y} w={ancho} h={alto} c={C.contorno} />
      <R x={x + 1} y={y + 1} w={ancho - 2} h={alto - 2} c={C.maderaOscura} />
      <R x={x + 2} y={y + 2} w={ancho - 4} h={alto - 4} c="#4a2c1c" />
      {Array.from({ length: estantes }, (_, i) => (
        <Estante key={i} x={x + 2} y={y + 12 + i * 11} ancho={ancho - 4} semilla={semilla + i * 4} />
      ))}
      <R x={x} y={y} w={ancho} h={2} c={C.madera} />
      <R x={x} y={y} w={ancho} h={1} c={C.maderaLuz} />
    </g>
  )
}

export function Lampara({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Brillo cx={x + 4} cy={y - 14} r={28} />
      <R x={x - 3} y={y - 1} w={7} h={1} c={C.contorno} />
      <R x={x - 2} y={y - 2} w={5} h={1} c="#4a4a5a" />
      <R x={x} y={y - 12} w={1} h={10} c="#4a4a5a" />
      {/* pantalla */}
      <R x={x - 3} y={y - 16} w={9} h={1} c="#3f7a5a" />
      <R x={x - 4} y={y - 15} w={11} h={3} c="#4f8a5b" />
      <R x={x - 4} y={y - 15} w={11} h={1} c="#6fae7a" />
      <R x={x - 2} y={y - 12} w={7} h={1} c="#fff3b0" />
    </g>
  )
}

export function LamparaColgante({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Brillo cx={x} cy={y + 8} r={24} />
      <R x={x} y={0} w={1} h={y} c={C.contorno} />
      <R x={x - 3} y={y} w={7} h={1} c="#c9893a" />
      <R x={x - 4} y={y + 1} w={9} h={3} c="#e0a43a" />
      <R x={x - 4} y={y + 1} w={9} h={1} c="#f2c35b" />
      <R x={x - 2} y={y + 4} w={5} h={1} c="#fff3b0" />
    </g>
  )
}

export function Taza({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <g className="vapor-pixel" fill="#ffffff" opacity={0.6}>
        <rect x={x - 1} y={y - 9} width={1} height={2} />
        <rect x={x} y={y - 11} width={1} height={2} style={{ animationDelay: '-0.8s' }} />
        <rect x={x + 1} y={y - 8} width={1} height={2} style={{ animationDelay: '-1.6s' }} />
      </g>
      <R x={x - 3} y={y - 6} w={6} h={6} c="#e07f9a" />
      <R x={x - 3} y={y - 6} w={6} h={1} c="#6b3a2a" />
      <R x={x - 3} y={y - 5} w={1} h={5} c="#f2a7b8" />
      <R x={x + 3} y={y - 5} w={2} h={1} c="#e07f9a" />
      <R x={x + 4} y={y - 4} w={1} h={2} c="#e07f9a" />
      <R x={x + 3} y={y - 2} w={2} h={1} c="#e07f9a" />
      <R x={x - 3} y={y - 1} w={6} h={1} c="#b8566e" />
    </g>
  )
}

/** Un mate de calabaza con su bombilla. */
function MateDeco({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <R x={x + 1} y={y - 10} w={1} h={1} c="#dcdfe6" />
      <R x={x} y={y - 9} w={1} h={3} c="#dcdfe6" />
      <R x={x - 2} y={y - 7} w={5} h={1} c="#c8c8d0" />
      <R x={x - 2} y={y - 6} w={5} h={1} c="#6a9a3a" />
      <R x={x - 3} y={y - 5} w={7} h={4} c="#8a5a2a" />
      <R x={x - 3} y={y - 5} w={1} h={3} c="#b07a4f" />
      <R x={x - 2} y={y - 1} w={5} h={1} c="#6b4128" />
      <R x={x - 1} y={y - 1} w={3} h={1} c="#c8c8d0" />
    </g>
  )
}

/** Un vaso de matcha latte, verde arriba y con leche abajo, con su sorbete. */
function Matcha({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <R x={x + 1} y={y - 11} w={1} h={4} c="#f2a7b8" />
      <R x={x - 2} y={y - 8} w={5} h={1} c="#dcecdc" />
      <R x={x - 2} y={y - 7} w={5} h={3} c="#7fb86a" />
      <R x={x - 2} y={y - 4} w={5} h={3} c="#eef2e2" />
      <R x={x - 2} y={y - 7} w={1} h={6} c="#ffffff" o={0.5} />
      <R x={x - 2} y={y - 1} w={5} h={1} c="#b8c8b8" />
    </g>
  )
}

/** Una manzana roja con su hojita. */
function Manzana({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <R x={x} y={y - 7} w={1} h={2} c="#6b4128" />
      <R x={x + 1} y={y - 7} w={2} h={1} c="#6a9a3a" />
      <R x={x - 2} y={y - 5} w={5} h={4} c="#d8404a" />
      <R x={x - 2} y={y - 5} w={1} h={2} c="#f07a7a" />
      <R x={x - 1} y={y - 1} w={3} h={1} c="#a82a34" />
    </g>
  )
}

/** Un cactus en maceta de barro. */
function Cactus({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <R x={x - 1} y={y - 11} w={3} h={7} c="#4f8a5b" />
      <R x={x - 1} y={y - 11} w={1} h={7} c="#7ab86a" />
      <R x={x - 3} y={y - 9} w={1} h={3} c="#4f8a5b" />
      <R x={x - 3} y={y - 7} w={2} h={1} c="#4f8a5b" />
      <R x={x + 3} y={y - 8} w={1} h={2} c="#4f8a5b" />
      <R x={x + 2} y={y - 7} w={2} h={1} c="#4f8a5b" />
      <R x={x} y={y - 12} w={1} h={1} c="#f472b6" />
      <R x={x - 3} y={y - 4} w={7} h={4} c="#c0663a" />
      <R x={x - 3} y={y - 4} w={7} h={1} c="#d8844f" />
    </g>
  )
}

/** Un vaso con lápices de colores. */
function Lapices({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <R x={x - 2} y={y - 10} w={1} h={5} c="#e0502a" />
      <R x={x} y={y - 11} w={1} h={6} c="#3f6aa0" />
      <R x={x + 2} y={y - 9} w={1} h={4} c="#f2c35b" />
      <R x={x - 2} y={y - 11} w={1} h={1} c="#3a2a1a" />
      <R x={x} y={y - 12} w={1} h={1} c="#3a2a1a" />
      <R x={x + 2} y={y - 10} w={1} h={1} c="#3a2a1a" />
      <R x={x - 3} y={y - 5} w={7} h={5} c="#7a8aa0" />
      <R x={x - 3} y={y - 5} w={1} h={5} c="#a0b0c4" />
    </g>
  )
}

/** Un reloj de arena con la arena cayendo. */
function RelojDeArena({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <R x={x - 3} y={y - 10} w={7} h={1} c="#8a5a2a" />
      <R x={x - 3} y={y - 1} w={7} h={1} c="#8a5a2a" />
      <R x={x - 2} y={y - 9} w={5} h={2} c="#dcecf2" o={0.8} />
      <R x={x - 1} y={y - 7} w={3} h={1} c="#dcecf2" o={0.8} />
      <R x={x} y={y - 6} w={1} h={2} c="#f2c35b" />
      <R x={x - 1} y={y - 4} w={3} h={1} c="#dcecf2" o={0.8} />
      <R x={x - 2} y={y - 3} w={5} h={2} c="#f2c35b" />
      <R x={x - 1} y={y - 9} w={3} h={1} c="#f2c35b" />
    </g>
  )
}

/** Una vela encendida en su platito. */
function Vela({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <g className="vapor-pixel">
        <R x={x} y={y - 11} w={1} h={2} c="#fde047" />
      </g>
      <R x={x} y={y - 9} w={1} h={1} c="#f59e0b" />
      <R x={x - 1} y={y - 8} w={3} h={6} c="#f6f0ea" />
      <R x={x - 1} y={y - 8} w={1} h={6} c="#ffffff" />
      <R x={x - 3} y={y - 2} w={7} h={2} c="#c8a05a" />
    </g>
  )
}

const OBJETOS_DE_MESA: Record<string, (props: { x: number; y: number }) => ReactNode> = {
  taza: Taza,
  'mate-escritorio': MateDeco,
  matcha: Matcha,
  globo: Globo,
  planta: Planta,
  manzana: Manzana,
  cactus: Cactus,
  lapices: Lapices,
  'reloj-arena': RelojDeArena,
  vela: Vela,
}

/** Lo que cada persona tiene en su lugar de la mesa, en las salas grupales (hasta dos cosas chicas). */
function MesaDe({ p, x, y, lugar = 2 }: { p: Persona; x: number; y: number; lugar?: number }) {
  const deco = p.apariencia.decoracion ?? []
  const chicos = Object.keys(OBJETOS_DE_MESA).filter((id) => deco.includes(id))
  const objetos = deco.includes('libros') && chicos.length < lugar ? [...chicos.slice(0, lugar - 1), 'libros'] : chicos.slice(0, lugar)
  return (
    <>
      {objetos.map((id, i) => {
        const ox = x - i * 7
        if (id === 'libros') return <PilaDeLibros key={id} x={ox - 2} y={y} />
        const Objeto = OBJETOS_DE_MESA[id]
        return <Objeto key={id} x={ox} y={y} />
      })}
    </>
  )
}

export function PilaDeLibros({ x, y }: { x: number; y: number }) {
  const libros = [
    [-6, 12, '#3f6aa0'],
    [-5, 10, '#e0a43a'],
    [-6, 11, '#4f8a5b'],
  ] as const
  return (
    <g>
      {libros.map(([dx, w, c], i) => (
        <g key={i}>
          <R x={x + dx} y={y - (i + 1) * 3} w={w} h={3} c={c} />
          <R x={x + dx + 1} y={y - (i + 1) * 3 + 1} w={w - 2} h={1} c={C.papel} o={0.7} />
          <R x={x + dx} y={y - (i + 1) * 3 + 2} w={w} h={1} c="#000" o={0.2} />
        </g>
      ))}
    </g>
  )
}

export function Globo({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <R x={x - 3} y={y - 1} w={7} h={1} c={C.maderaOscura} />
      <R x={x} y={y - 3} w={1} h={2} c={C.maderaOscura} />
      <Disco cx={x} cy={y - 8} r={5} c="#4a90c8" />
      <R x={x - 3} y={y - 11} w={3} h={2} c="#5aa86a" />
      <R x={x + 1} y={y - 8} w={3} h={3} c="#5aa86a" />
      <R x={x - 2} y={y - 6} w={2} h={1} c="#5aa86a" />
      <R x={x - 3} y={y - 11} w={1} h={1} c="#ffffff" o={0.5} />
      <R x={x + 5} y={y - 11} w={1} h={7} c="#c9893a" />
    </g>
  )
}

export function Planta({ x, y, grande = false }: { x: number; y: number; grande?: boolean }) {
  const k = grande ? 2 : 1
  const hojas = [
    [-3, -7],
    [2, -8],
    [-5, -4],
    [4, -5],
    [-1, -10],
    [0, -5],
  ]
  return (
    <g>
      {hojas.map(([hx, hy], i) => (
        <g key={i}>
          <R x={x + hx * k} y={y - 5 + hy * k} w={3 * k} h={2 * k} c={i % 2 ? '#4f8a5b' : '#6fae6a'} />
          <R x={x + hx * k} y={y - 5 + hy * k} w={k} h={k} c="#9fd08a" />
        </g>
      ))}
      <R x={x - 3 * k} y={y - 5} w={7 * k} h={5} c="#c2553a" />
      <R x={x - 3 * k} y={y - 5} w={7 * k} h={1} c="#e07f5a" />
      <R x={x - 3 * k} y={y - 1} w={7 * k} h={1} c="#8e3b2b" />
    </g>
  )
}

export function PlantaColgante({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <R x={x + 2} y={0} w={1} h={y - 4} c={C.contorno} />
      <R x={x - 1} y={y - 4} w={7} h={4} c="#c2553a" />
      <R x={x - 1} y={y - 4} w={7} h={1} c="#e07f5a" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <R key={i} x={x - 2 + (i % 3) * 3 + (i > 3 ? 1 : 0)} y={y + i * 2} w={2} h={2} c={i % 2 ? '#4f8a5b' : '#6fae6a'} />
      ))}
    </g>
  )
}

const FOCOS = ['#ffd84a', '#ff8ab0', '#7ac4ff', '#8ae08a', '#ffa64a']

export function Luces({ x1, x2, y, caida = 4 }: { x1: number; x2: number; y: number; caida?: number }) {
  const pasos = Math.floor((x2 - x1) / 2)
  const cable = []
  const focos = []
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos
    const px = x1 + i * 2
    const py = Math.round(y + caida * 4 * t * (1 - t))
    cable.push(<rect key={i} x={px} y={py} width={2} height={1} />)
    if (i % 5 === 2)
      focos.push(
        <g key={i} className="titila" style={{ animationDelay: `${-i * 0.3}s` }}>
          <rect x={px - 1} y={py} width={3} height={3} fill={FOCOS[((i / 5) % FOCOS.length) | 0]} opacity={0.25} />
          <rect x={px} y={py + 1} width={1} height={2} fill={FOCOS[((i / 5) % FOCOS.length) | 0]} />
        </g>,
      )
  }
  return (
    <g>
      <g fill={C.contorno}>{cable}</g>
      {focos}
    </g>
  )
}

function Cuaderno({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <R x={x - 8} y={y} w={16} h={4} c={C.papel} />
      <R x={x} y={y} w={1} h={4} c="#d8c8a8" />
      <R x={x - 6} y={y + 1} w={5} h={1} c="#a8b8d8" />
      <R x={x + 2} y={y + 1} w={5} h={1} c="#a8b8d8" />
      <R x={x - 6} y={y + 2} w={4} h={1} c="#a8b8d8" />
      <R x={x - 8} y={y + 4} w={16} h={1} c="#c9b48a" />
      {/* lápiz */}
      <R x={x + 5} y={y + 2} w={5} h={1} c="#f2c35b" />
      <R x={x + 10} y={y + 2} w={1} h={1} c={C.contorno} />
    </g>
  )
}

/** Respaldo de una silla de madera (va detrás de la persona). */
function Silla({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <R x={x - 11} y={y - 12} w={22} h={2} c={C.maderaClara} />
      <R x={x - 11} y={y - 12} w={22} h={1} c={C.maderaLuz} />
      <R x={x - 11} y={y - 10} w={2} h={10} c={C.madera} />
      <R x={x + 9} y={y - 10} w={2} h={10} c={C.madera} />
      <R x={x - 6} y={y - 10} w={1} h={10} c={C.maderaOscura} />
      <R x={x + 5} y={y - 10} w={1} h={10} c={C.maderaOscura} />
    </g>
  )
}

/** Una mesa vista de frente y un poco desde arriba: (y) es el borde de atrás de la tabla. */
function Mesa({ x, y, ancho, alto, cajones = 0 }: { x: number; y: number; ancho: number; alto: number; cajones?: number }) {
  return (
    <g>
      <R x={x} y={y} w={ancho} h={6} c={C.maderaClara} />
      <R x={x} y={y} w={ancho} h={1} c={C.maderaLuz} />
      {Array.from({ length: Math.floor(ancho / 30) }, (_, i) => (
        <R key={i} x={x + 14 + i * 30} y={y + 2} w={8} h={1} c={C.madera} o={0.6} />
      ))}
      <R x={x} y={y + 6} w={ancho} h={2} c={C.madera} />
      <R x={x} y={y + 8} w={ancho} h={1} c={C.contorno} />
      <R x={x + 2} y={y + 9} w={ancho - 4} h={alto - 9} c={C.maderaOscura} />
      <R x={x + 2} y={y + 9} w={ancho - 4} h={1} c="#000" o={0.25} />
      {Array.from({ length: cajones }, (_, i) => {
        const w = Math.floor((ancho - 8) / cajones) - 2
        const cx = x + 5 + i * (w + 2)
        return (
          <g key={i}>
            <R x={cx} y={y + 11} w={w} h={7} c={C.madera} />
            <R x={cx} y={y + 11} w={w} h={1} c={C.maderaClara} />
            <R x={cx + Math.floor(w / 2) - 1} y={y + 14} w={3} h={1} c="#e0b45a" />
          </g>
        )
      })}
    </g>
  )
}

function Cartel({ x, y, nombre, color }: { x: number; y: number; nombre: string; color?: string | null }) {
  const texto = nombre.length > 12 ? `${nombre.slice(0, 11)}…` : nombre
  const ancho = Math.max(18, texto.length * 4 + 6)
  return (
    <g>
      <R x={x - ancho / 2 + 1} y={y} w={ancho - 2} h={8} c={C.crema} />
      <R x={x - ancho / 2} y={y + 1} w={ancho} h={6} c={C.crema} />
      <R x={x - ancho / 2 + 1} y={y + 7} w={ancho - 2} h={1} c="#c9a878" />
      <text
        x={x}
        y={y + 6}
        textAnchor="middle"
        fontSize={6}
        fill={color || C.contorno}
        fontFamily="'Pixelify Sans', monospace"
        shapeRendering="auto"
      >
        {texto}
      </text>
    </g>
  )
}

/** Si la sala deja tocar a las personas (para ver su miniperfil), qué hacer al tocar a alguien. */
const AlTocarPersona = createContext<((id: number) => void) | null>(null)

function Sentado({ p, x, piso }: { p: Persona; x: number; piso: number }) {
  const alTocar = useContext(AlTocarPersona)
  const dibujo = (() => {
    return (
      <g className="respira-pixel" style={{ animationDelay: `${-(p.id % 5) * 0.6}s` }}>
        <AvatarPixelSvg a={p.apariencia} x={x} y={piso + ASIENTO} />
      </g>
    )
  })()
  return alTocar ? (
    <BotonPixel etiqueta={p.nombre} onClick={() => alTocar(p.id)}>
      {dibujo}
    </BotonPixel>
  ) : (
    dibujo
  )
}

const PALETA_FUEGO = { r: '#c8402a', o: '#f0782a', y: '#ffb43a', w: '#fff0a0' }
const LLAMAS = [
  [
    '......o.......',
    '.....oo...o...',
    '.....oyo..oo..',
    '....oyyo.oyo..',
    '..o.oyyoooyo..',
    '..ooyyyyoyyo.o',
    '.ooyywyyyyyooo',
    '.oyyywwyyyyyo.',
    'ooyywwwwyyyyoo',
    'oyyywwwwwyyyyo',
    'ryyywwwwwwyyyr',
    'rryyywwwwyyyrr',
    '.rrrryyyyyrrr.',
  ],
  [
    '.......o......',
    '...o...oo.....',
    '..oo..oyo.....',
    '..oyo.oyyo....',
    '..oyoooyyo.o..',
    'o.oyyoyyyyoo..',
    'oooyyyyywyyoo.',
    '.oyyyyywwyyyo.',
    'ooyyyywwwwyyoo',
    'oyyyywwwwwyyyo',
    'ryyywwwwwwyyyr',
    'rryyywwwwyyyrr',
    '.rrrryyyyyrrr.',
  ],
]

export function Fuego({ x, y }: { x: number; y: number }) {
  // Dos cuadros de llama que se alternan, como en una animación de sprites
  return (
    <g>
      <Brillo cx={x} cy={y - 6} r={40} c="#ffa04a" fuerza={0.08} />
      {LLAMAS.map((mapa, i) => (
        <Sprite key={i} mapa={mapa} paleta={PALETA_FUEGO} x={x - 7} y={y - 15} className={`cuadro-${i}`} />
      ))}
      <R x={x - 9} y={y - 2} w={18} h={2} c="#5a3420" />
      <R x={x - 8} y={y - 1} w={16} h={1} c="#3b2417" />
      <R x={x - 5} y={y - 2} w={2} h={1} c="#ffa04a" />
      <R x={x + 3} y={y - 2} w={2} h={1} c="#ffa04a" />
    </g>
  )
}

export function Alfombra({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  return (
    <g>
      <Disco cx={cx} cy={cy} r={rx} aplastado={ry / rx} c="#8e3b3b" />
      <Disco cx={cx} cy={cy} r={rx - 3} aplastado={(ry - 1) / (rx - 3)} c="#c25b56" />
      <Disco cx={cx} cy={cy} r={rx - 6} aplastado={(ry - 2) / (rx - 6)} c="#8e3b3b" />
      <Disco cx={cx} cy={cy} r={rx - 8} aplastado={(ry - 2.5) / (rx - 8)} c="#d98a5a" />
    </g>
  )
}

/** El tono de luz del ambiente sobre toda la escena. */
const TINTES: Record<Ambiente, [string, number]> = {
  medianoche: ['#1a1a4a', 0.14],
  lluvia: ['#2a3a5a', 0.14],
  cafe: ['#ff9a4a', 0.08],
  dia: ['#fff6d8', 0.04],
  amanecer: ['#ffb8a0', 0.07],
  nieve: ['#c8d8f0', 0.08],
}

function Ambientacion({ ancho, alto, ambiente }: { ancho: number; alto: number; ambiente: Ambiente }) {
  const [color, fuerza] = TINTES[ambiente] ?? TINTES.medianoche
  return <R x={0} y={0} w={ancho} h={alto} c={color} o={fuerza} />
}

function MascotaDe({ p, x, y, haciaLaDerecha = false }: { p: Persona; x: number; y: number; haciaLaDerecha?: boolean }) {
  // Las mascotas anchas (el mate con el termo) se corren para no taparle el brazo a nadie
  const extra = haciaLaDerecha ? Math.max(0, Math.round((medidasMascota(p.apariencia.mascota).ancho - 16) / 2)) : 0
  return <MascotaPixel apariencia={p.apariencia} x={x + extra} y={y} demora={p.id % 6} foto={fotoDeMascota(p.id, p.apariencia)} />
}

// --- Escenas para estudiar solo (128×80) ---

/** En el escritorio de su cuarto. */
export function EscenaEscritorio({
  persona,
  ambiente = 'medianoche',
  onClima,
  etiquetaClima,
}: {
  persona: Persona
  ambiente?: Ambiente
  onClima?: () => void
  etiquetaClima?: string
}) {
  const deco = persona.apariencia.decoracion
  const mesa = 54
  return (
    <Lienzo ancho={128} alto={80} etiqueta={persona.nombre}>
      <Empapelado ancho={128} alto={mesa} base="#5e7f7a" raya="#557570" motivo="#7a9a8a" />
      <Zocalo y={mesa - 4} ancho={128} />
      <Ventana x={10} y={10} ancho={30} alto={24} ambiente={ambiente} onClima={onClima} etiquetaClima={etiquetaClima} />
      <Estante x={88} y={22} ancho={32} semilla={2} />
      <Estante x={92} y={36} ancho={26} semilla={9} />
      {deco.includes('planta') && <PlantaColgante x={76} y={18} />}
      {deco.includes('luces') && <Luces x1={2} x2={126} y={2} caida={4} />}
      <Silla x={64} y={mesa} />
      <Sentado p={persona} x={64} piso={mesa} />
      <Mesa x={4} y={mesa} ancho={120} alto={26} cajones={3} />
      <Lampara x={12} y={mesa + 3} />
      {deco.includes('libros') && <PilaDeLibros x={27} y={mesa + 4} />}
      {deco.includes('taza') && <Taza x={39} y={mesa + 4} />}
      {deco.includes('mate-escritorio') && <MateDeco x={48} y={mesa + 4} />}
      {deco.includes('matcha') && <Matcha x={105} y={mesa + 4} />}
      {deco.includes('globo') && <Globo x={115} y={mesa + 4} />}
      {deco.includes('cactus') && <Cactus x={21} y={mesa + 4} />}
      {deco.includes('manzana') && <Manzana x={56} y={mesa + 4} />}
      {deco.includes('reloj-arena') && <RelojDeArena x={74} y={mesa + 4} />}
      {deco.includes('vela') && <Vela x={98} y={mesa + 4} />}
      {deco.includes('lapices') && <Lapices x={121} y={mesa + 4} />}
      <Cuaderno x={64} y={mesa + 1} />
      <MascotaDe p={persona} x={88} y={mesa + 5} />
      <Ambientacion ancho={128} alto={80} ambiente={ambiente} />
    </Lienzo>
  )
}

/** Leyendo en un sillón, al lado de la chimenea. */
export function EscenaChimenea({ persona, ambiente = 'medianoche' }: { persona: Persona; ambiente?: Ambiente }) {
  const deco = persona.apariencia.decoracion
  const piso = 58
  return (
    <Lienzo ancho={128} alto={80} etiqueta={persona.nombre}>
      <Empapelado ancho={128} alto={piso} base="#7a4a45" raya="#6e413d" motivo="#a06a5a" />
      <Zocalo y={piso - 4} ancho={128} />
      <PisoDeMadera y={piso} ancho={128} alto={22} />
      <Ventana x={88} y={10} ancho={28} alto={24} ambiente={ambiente} />
      {/* Chimenea de piedra */}
      <R x={4} y={20} w={46} h={3} c={C.maderaClara} />
      <R x={4} y={20} w={46} h={1} c={C.maderaLuz} />
      <R x={4} y={23} w={46} h={1} c={C.contorno} />
      <R x={6} y={24} w={42} h={piso - 24} c="#9a8a80" />
      {Array.from({ length: 8 }, (_, j) =>
        Array.from({ length: 6 }, (_, i) => <R key={`${i}-${j}`} x={6 + i * 8 - (j % 2) * 4} y={24 + j * 4} w={1} h={4} c="#7a6a62" />),
      )}
      {Array.from({ length: 8 }, (_, j) => (
        <R key={j} x={6} y={24 + j * 4} w={42} h={1} c="#7a6a62" />
      ))}
      <R x={13} y={34} w={28} h={piso - 34} c={C.contorno} />
      <R x={14} y={35} w={26} h={piso - 35} c="#1e120c" />
      <Fuego x={27} y={piso} />
      {/* Velas en la repisa */}
      {[10, 44].map((vx) => (
        <g key={vx}>
          <R x={vx} y={14} w={2} h={6} c={C.crema} />
          <R x={vx} y={12} w={2} h={2} c="#ffc84a" className="titila" />
        </g>
      ))}
      {deco.includes('libros') && <PilaDeLibros x={23} y={20} />}
      {deco.includes('globo') && <Globo x={34} y={20} />}
      {deco.includes('luces') && <Luces x1={4} x2={50} y={23} caida={3} />}
      {deco.includes('planta') && <Planta x={120} y={piso + 6} grande />}
      <Alfombra cx={60} cy={70} rx={34} ry={7} />
      {/* Mesita con la taza */}
      {['taza', 'mate-escritorio', 'matcha'].some((d) => deco.includes(d)) && (
        <g>
          <R x={95} y={56} w={22} h={2} c={C.maderaClara} />
          <R x={95} y={58} w={22} h={1} c={C.contorno} />
          <R x={97} y={59} w={2} h={9} c={C.maderaOscura} />
          <R x={113} y={59} w={2} h={9} c={C.maderaOscura} />
          {deco.includes('taza') && <Taza x={99} y={56} />}
          {deco.includes('mate-escritorio') && <MateDeco x={106} y={56} />}
          {deco.includes('matcha') && <Matcha x={113} y={56} />}
        </g>
      )}
      {/* Sillón */}
      <g>
        <R x={65} y={40} w={26} h={22} c="#3f6a8a" />
        <R x={66} y={40} w={24} h={1} c="#6a9ac0" />
        <R x={64} y={41} w={1} h={21} c={C.contorno} />
        <R x={91} y={41} w={1} h={21} c={C.contorno} />
      </g>
      <Sentado p={persona} x={78} piso={55} />
      <g>
        <R x={61} y={52} w={5} h={12} c="#4f7aa0" />
        <R x={61} y={52} w={5} h={1} c="#7aaad0" />
        <R x={90} y={52} w={5} h={12} c="#4f7aa0" />
        <R x={90} y={52} w={5} h={1} c="#7aaad0" />
        <R x={63} y={64} w={30} h={2} c="#2f5070" />
        <R x={64} y={66} w={2} h={2} c={C.maderaOscura} />
        <R x={90} y={66} w={2} h={2} c={C.maderaOscura} />
      </g>
      <MascotaDe p={persona} x={44} y={72} />
      <Ambientacion ancho={128} alto={80} ambiente={ambiente} />
    </Lienzo>
  )
}

// --- El reloj y la radio de las salas grupales (se tocan para abrir el pomodoro y la radio) ---

export interface ControlesSala {
  pomodoro: EstadoPomodoro
  ahoraServidor: () => number
  sonando: boolean
  onReloj: () => void
  onRadio: () => void
  etiquetaReloj: string
  etiquetaRadio: string
  onClima: () => void
  etiquetaClima: string
  onPersona?: (id: number) => void // tocar a alguien abre su miniperfil
}

const DIGITOS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
}

export function tiempoRestante(pomodoro: EstadoPomodoro, ahoraServidor: () => number) {
  const restante = pomodoro.corriendo && pomodoro.fin ? pomodoro.fin - ahoraServidor() : pomodoro.restante
  const s = Math.max(0, Math.round(restante))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Un botón dentro del dibujo: se puede tocar o elegir con el teclado. */
function BotonPixel({ etiqueta, onClick, children }: { etiqueta: string; onClick: () => void; children: ReactNode }) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={etiqueta}
      className="pixel-clic"
      onClick={onClick}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <title>{etiqueta}</title>
      {children}
    </g>
  )
}

/** Reloj digital de madera con los números del pomodoro (23×11). (x, y) es la esquina de arriba a la izquierda. */
function RelojPixel({ x, y, c }: { x: number; y: number; c: ControlesSala }) {
  const [, refrescar] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => refrescar((n) => n + 1), 500)
    return () => window.clearInterval(id)
  }, [])
  const texto = tiempoRestante(c.pomodoro, c.ahoraServidor).replace(':', '')
  const encendido = c.pomodoro.fase === 'descanso' ? '#9be08a' : '#ffc45a'
  const color = c.pomodoro.corriendo ? encendido : '#a89a78'
  return (
    <BotonPixel etiqueta={c.etiquetaReloj} onClick={c.onReloj}>
      <R x={x} y={y} w={23} h={11} c={C.contorno} />
      <R x={x + 1} y={y + 1} w={21} h={9} c={C.madera} />
      <R x={x + 1} y={y + 1} w={21} h={1} c={C.maderaLuz} />
      <R x={x + 2} y={y + 2} w={19} h={7} c="#1e2420" />
      {[...texto].map((d, i) => (
        <g key={i} fill={color}>
          {DIGITOS[d].flatMap((fila, j) =>
            [...fila].map((b, k) =>
              b === '1' ? <rect key={`${j}-${k}`} x={x + 3 + i * 4 + (i >= 2 ? 2 : 0) + k} y={y + 3 + j} width={1} height={1} /> : null,
            ),
          )}
        </g>
      ))}
      <g fill={color} className={c.pomodoro.corriendo ? 'titila' : undefined}>
        <rect x={x + 11} y={y + 4} width={1} height={1} />
        <rect x={x + 11} y={y + 6} width={1} height={1} />
      </g>
    </BotonPixel>
  )
}

/** Radio retro de madera (20×13); si suena, salen notitas. (x, y) es la esquina de abajo a la izquierda. */
function RadioPixel({ x, y, c }: { x: number; y: number; c: ControlesSala }) {
  const top = y - 11
  return (
    <BotonPixel etiqueta={c.etiquetaRadio} onClick={c.onRadio}>
      {/* antena */}
      <R x={x + 15} y={top - 4} w={1} h={1} c="#c8c8d0" />
      <R x={x + 14} y={top - 3} w={1} h={1} c="#c8c8d0" />
      <R x={x + 13} y={top - 2} w={1} h={1} c="#c8c8d0" />
      <R x={x + 12} y={top - 1} w={1} h={1} c="#c8c8d0" />
      <R x={x} y={top} w={20} h={11} c={C.contorno} />
      <R x={x + 1} y={top + 1} w={18} h={9} c="#c25b56" />
      <R x={x + 1} y={top + 1} w={18} h={1} c="#e07f72" />
      {/* parlante */}
      <R x={x + 2} y={top + 3} w={8} h={6} c="#f6e7c8" />
      {[0, 1, 2].map((j) => [0, 1, 2, 3].map((k) => <R key={`${j}-${k}`} x={x + 3 + k * 2} y={top + 4 + j * 2} w={1} h={1} c="#b07a4f" />))}
      {/* dial y perillas */}
      <R x={x + 12} y={top + 3} w={6} h={3} c="#f6e7c8" />
      <R x={x + 14} y={top + 3} w={1} h={3} c="#c25b56" />
      <R x={x + 12} y={top + 7} w={2} h={2} c="#f2c35b" />
      <R x={x + 16} y={top + 7} w={2} h={2} c="#f2c35b" />
      <R x={x + 2} y={y - 1} w={3} h={1} c={C.contorno} />
      <R x={x + 15} y={y - 1} w={3} h={1} c={C.contorno} />
      {c.sonando && (
        <g className="nota-pixel" fill="#fff3b0">
          <g>
            <rect x={x + 21} y={top + 1} width={1} height={4} />
            <rect x={x + 22} y={top + 1} width={2} height={1} />
            <rect x={x + 20} y={top + 4} width={1} height={1} />
          </g>
          <g style={{ animationDelay: '-1.1s' }}>
            <rect x={x - 3} y={top + 2} width={1} height={3} />
            <rect x={x - 4} y={top + 4} width={1} height={1} />
          </g>
        </g>
      )}
    </BotonPixel>
  )
}

// --- Escenas para estudiar en grupo (320×100) ---

const MAX_SENTADOS = 6
const ANCHO_GRUPO = 320
const ALTO_GRUPO = 100

function ubicaciones(n: number) {
  const espacio = Math.min(46, 280 / Math.max(1, n))
  const inicio = ANCHO_GRUPO / 2 - (espacio * (n - 1)) / 2
  return { espacio, xs: Array.from({ length: n }, (_, i) => Math.round(inicio + i * espacio)) }
}

function Resto({ n, y }: { n: number; y: number }) {
  if (n <= 0) return null
  return (
    <g>
      <R x={ANCHO_GRUPO - 20} y={y} w={14} h={9} c={C.crema} />
      <text
        x={ANCHO_GRUPO - 13}
        y={y + 7}
        textAnchor="middle"
        fontSize={7}
        fill={C.contorno}
        fontFamily="'Pixelify Sans', monospace"
        shapeRendering="auto"
      >
        +{n}
      </text>
    </g>
  )
}

/** La biblioteca: todos leyendo en una mesa larga, con sus mascotas. */
export function EscenaBiblioteca({
  personas,
  ambiente = 'medianoche',
  controles,
  cubrir,
}: {
  personas: Persona[]
  ambiente?: Ambiente
  controles?: ControlesSala
  cubrir?: boolean
}) {
  const sentados = personas.slice(0, MAX_SENTADOS)
  const { espacio, xs } = ubicaciones(sentados.length)
  const mesa = 70
  return (
    <Lienzo ancho={ANCHO_GRUPO} alto={ALTO_GRUPO} etiqueta={personas.map((p) => p.nombre).join(', ')} cubrir={cubrir}>
      <Empapelado ancho={ANCHO_GRUPO} alto={mesa} base="#5a3a2a" raya="#523426" />
      <Biblioteca x={4} y={15} ancho={116} alto={51} semilla={1} />
      <Biblioteca x={200} y={15} ancho={116} alto={51} semilla={7} />
      <Ventana
        x={140}
        y={19}
        ancho={40}
        alto={26}
        ambiente={ambiente}
        onClima={controles?.onClima}
        etiquetaClima={controles?.etiquetaClima}
      />
      <Planta x={214} y={15} />
      <Zocalo y={mesa - 4} ancho={ANCHO_GRUPO} />
      <PisoDeMadera y={mesa + 18} ancho={ANCHO_GRUPO} alto={12} />
      <LamparaColgante x={70} y={14} />
      <LamparaColgante x={250} y={14} />
      {controles && (
        <>
          <RelojPixel x={149} y={1} c={controles} />
          <RadioPixel x={96} y={15} c={controles} />
        </>
      )}
      {sentados.map((p, i) => (
        <g key={p.id}>
          <Silla x={xs[i]} y={mesa} />
          <Sentado p={p} x={xs[i]} piso={mesa} />
          {p.apariencia.decoracion?.includes('luces') && <Luces x1={xs[i] - 14} x2={xs[i] + 14} y={mesa - 42} caida={3} />}
        </g>
      ))}
      <Mesa x={6} y={mesa} ancho={ANCHO_GRUPO - 12} alto={20} />
      <Lampara x={14} y={mesa + 3} />
      <Planta x={306} y={mesa + 5} />
      {sentados.map((p, i) => (
        <g key={p.id}>
          <R x={xs[i] - 6} y={mesa + 1} w={12} h={3} c={C.papel} />
          <R x={xs[i]} y={mesa + 1} w={1} h={3} c="#d8c8a8" />
          <MesaDe p={p} x={xs[i] - 12} y={mesa + 5} lugar={espacio >= 40 ? 2 : 1} />
          <MascotaDe p={p} x={Math.round(xs[i] + espacio * 0.36)} y={mesa + 5} haciaLaDerecha />
          <Cartel x={xs[i]} y={mesa + 10} nombre={p.nombre} color={p.apariencia.color_apodo} />
        </g>
      ))}
      <Resto n={personas.length - sentados.length} y={mesa - 14} />
      <Ambientacion ancho={ANCHO_GRUPO} alto={ALTO_GRUPO} ambiente={ambiente} />
    </Lienzo>
  )
}

/** El aula: cada uno en su banco, con el pizarrón adelante. */
export function EscenaAula({
  personas,
  ambiente = 'medianoche',
  controles,
  cubrir,
}: {
  personas: Persona[]
  ambiente?: Ambiente
  controles?: ControlesSala
  cubrir?: boolean
}) {
  const sentados = personas.slice(0, MAX_SENTADOS)
  const { espacio, xs } = ubicaciones(sentados.length)
  const banco = 72
  const ancho = Math.min(34, Math.floor(espacio) - 4)
  return (
    <Lienzo ancho={ANCHO_GRUPO} alto={ALTO_GRUPO} etiqueta={personas.map((p) => p.nombre).join(', ')} cubrir={cubrir}>
      <Empapelado ancho={ANCHO_GRUPO} alto={banco + 4} base="#8aa88a" raya="#82a082" />
      <R x={0} y={50} w={ANCHO_GRUPO} h={22} c="#a8865a" />
      <R x={0} y={50} w={ANCHO_GRUPO} h={1} c="#c9a878" />
      <Zocalo y={banco - 4} ancho={ANCHO_GRUPO} />
      {/* piso de baldosas */}
      <R x={0} y={banco} w={ANCHO_GRUPO} h={ALTO_GRUPO - banco} c="#c9b48a" />
      {Array.from({ length: ANCHO_GRUPO / 8 }, (_, i) =>
        Array.from(
          { length: 4 },
          (_, j) => (i + j) % 2 === 0 && <R key={`${i}-${j}`} x={i * 8} y={banco + j * 7} w={8} h={7} c="#b8a078" />,
        ),
      )}
      <Ventana
        x={14}
        y={12}
        ancho={34}
        alto={26}
        ambiente={ambiente}
        onClima={controles?.onClima}
        etiquetaClima={controles?.etiquetaClima}
      />
      <Ventana
        x={272}
        y={12}
        ancho={34}
        alto={26}
        ambiente={ambiente}
        onClima={controles?.onClima}
        etiquetaClima={controles?.etiquetaClima}
      />
      {/* Pizarrón */}
      <R x={84} y={4} w={152} h={40} c={C.contorno} />
      <R x={85} y={5} w={150} h={38} c={C.madera} />
      <R x={87} y={7} w={146} h={34} c="#2f5a46" />
      <R x={87} y={7} w={146} h={1} c="#3f6a56" />
      <g fill="#eef2e6" opacity={0.85} fontFamily="'Pixelify Sans', monospace" shapeRendering="auto">
        <text x={93} y={19} fontSize={9}>
          Repasito
        </text>
        <text x={93} y={33} fontSize={7}>
          ∫ x dx = x²/2
        </text>
        <text x={170} y={19} fontSize={7}>
          E = mc²
        </text>
        <text x={170} y={33} fontSize={7}>
          a² + b² = c²
        </text>
      </g>
      <R x={84} y={44} w={152} h={2} c={C.maderaClara} />
      <R x={84} y={46} w={152} h={1} c={C.contorno} />
      <R x={196} y={42} w={6} h={2} c="#f6f6ee" />
      <R x={206} y={42} w={5} h={2} c="#f2a7b8" />
      {controles && (
        <>
          <RelojPixel x={58} y={8} c={controles} />
          <R x={238} y={30} w={24} h={2} c={C.maderaClara} />
          <R x={238} y={32} w={24} h={1} c={C.contorno} />
          <R x={240} y={33} w={2} h={3} c={C.maderaOscura} />
          <R x={258} y={33} w={2} h={3} c={C.maderaOscura} />
          <RadioPixel x={240} y={30} c={controles} />
        </>
      )}
      {sentados.map((p, i) => (
        <g key={p.id}>
          <Silla x={xs[i]} y={banco} />
          <Sentado p={p} x={xs[i]} piso={banco} />
          {p.apariencia.decoracion?.includes('luces') && <Luces x1={xs[i] - 14} x2={xs[i] + 14} y={banco - 42} caida={3} />}
        </g>
      ))}
      {sentados.map((p, i) => (
        <g key={p.id}>
          <Mesa x={xs[i] - ancho / 2} y={banco} ancho={ancho} alto={13} />
          <R x={xs[i] - ancho / 2 + 2} y={banco + 13} w={1} h={ALTO_GRUPO - banco - 13} c="#5a5a6a" />
          <R x={xs[i] + ancho / 2 - 3} y={banco + 13} w={1} h={ALTO_GRUPO - banco - 13} c="#5a5a6a" />
          <R x={xs[i] - 5} y={banco + 1} w={10} h={3} c={C.papel} />
          <MesaDe p={p} x={xs[i] - ancho / 2 + 5} y={banco + 4} lugar={1} />
          <MascotaDe p={p} x={xs[i] + ancho / 2 - 4} y={banco + 4} haciaLaDerecha />
          <Cartel x={xs[i]} y={banco + 16} nombre={p.nombre} color={p.apariencia.color_apodo} />
        </g>
      ))}
      <Resto n={personas.length - sentados.length} y={banco - 14} />
      <Ambientacion ancho={ANCHO_GRUPO} alto={ALTO_GRUPO} ambiente={ambiente} />
    </Lienzo>
  )
}

// --- Lo común a las mesas largas: la gente sentada y lo que cada uno tiene adelante ---

type PropsEscenaGrupo = { personas: Persona[]; ambiente?: Ambiente; controles?: ControlesSala; cubrir?: boolean }

function GenteSentada({ sentados, xs, mesa }: { sentados: Persona[]; xs: number[]; mesa: number }) {
  return (
    <>
      {sentados.map((p, i) => (
        <g key={p.id}>
          <Silla x={xs[i]} y={mesa} />
          <Sentado p={p} x={xs[i]} piso={mesa} />
          {p.apariencia.decoracion?.includes('luces') && <Luces x1={xs[i] - 14} x2={xs[i] + 14} y={mesa - 42} caida={3} />}
        </g>
      ))}
    </>
  )
}

function CosasEnLaMesa({ sentados, xs, espacio, mesa }: { sentados: Persona[]; xs: number[]; espacio: number; mesa: number }) {
  return (
    <>
      {sentados.map((p, i) => (
        <g key={p.id}>
          <R x={xs[i] - 6} y={mesa + 1} w={12} h={3} c={C.papel} />
          <R x={xs[i]} y={mesa + 1} w={1} h={3} c="#d8c8a8" />
          <MesaDe p={p} x={xs[i] - 12} y={mesa + 5} lugar={espacio >= 40 ? 2 : 1} />
          <MascotaDe p={p} x={Math.round(xs[i] + espacio * 0.36)} y={mesa + 5} haciaLaDerecha />
          <Cartel x={xs[i]} y={mesa + 10} nombre={p.nombre} color={p.apariencia.color_apodo} />
        </g>
      ))}
    </>
  )
}

export function Ladrillos({ x, y, ancho, alto }: { x: number; y: number; ancho: number; alto: number }) {
  return (
    <g>
      <R x={x} y={y} w={ancho} h={alto} c="#a8584a" />
      {Array.from({ length: Math.ceil(alto / 4) }, (_, j) => (
        <g key={j}>
          <R x={x} y={y + j * 4} w={ancho} h={1} c="#d8b8a0" o={0.55} />
          {Array.from({ length: Math.ceil(ancho / 10) + 1 }, (_, i) => (
            <R key={i} x={x + i * 10 - (j % 2) * 5} y={y + j * 4} w={1} h={4} c="#d8b8a0" o={0.55} />
          ))}
        </g>
      ))}
    </g>
  )
}

/** La cafetería: barra con la cafetera atrás, pizarrita con el menú y ventanales a la calle. */
export function EscenaCafeteria({ personas, ambiente = 'medianoche', controles, cubrir }: PropsEscenaGrupo) {
  const sentados = personas.slice(0, MAX_SENTADOS)
  const { espacio, xs } = ubicaciones(sentados.length)
  const mesa = 70
  const toque = { onClima: controles?.onClima, etiquetaClima: controles?.etiquetaClima }
  return (
    <Lienzo ancho={ANCHO_GRUPO} alto={ALTO_GRUPO} etiqueta={personas.map((p) => p.nombre).join(', ')} cubrir={cubrir}>
      <Empapelado ancho={ANCHO_GRUPO} alto={mesa} base="#ead6b4" raya="#e2cca6" />
      <Ladrillos x={0} y={46} ancho={ANCHO_GRUPO} alto={20} />
      <Ventana x={12} y={12} ancho={58} alto={30} ambiente={ambiente} paneles={3} cortinas={false} {...toque} />
      <Ventana x={250} y={12} ancho={58} alto={30} ambiente={ambiente} paneles={3} cortinas={false} {...toque} />
      {/* toldo a rayas sobre las ventanas */}
      {[10, 248].map((tx) => (
        <g key={tx}>
          {Array.from({ length: 8 }, (_, i) => (
            <R key={i} x={tx + i * 8} y={6} w={8} h={4} c={i % 2 ? '#f6e7c8' : '#4f8a5b'} />
          ))}
          <R x={tx} y={10} w={64} h={1} c={C.contorno} />
        </g>
      ))}
      {/* pizarrita con el menú */}
      <R x={126} y={4} w={68} h={24} c={C.contorno} />
      <R x={127} y={5} w={66} h={22} c={C.madera} />
      <R x={129} y={7} w={62} h={18} c="#2f3a34" />
      <g fill="#eef2e6" opacity={0.85} fontFamily="'Pixelify Sans', monospace" shapeRendering="auto">
        <text x={133} y={15} fontSize={6}>
          Café · Té · Mate
        </text>
        <text x={133} y={23} fontSize={5}>
          Matcha latte ♡
        </text>
      </g>
      {/* barra con la cafetera */}
      <R x={104} y={40} w={112} h={26} c={C.madera} />
      <R x={104} y={40} w={112} h={2} c={C.maderaLuz} />
      <R x={104} y={42} w={112} h={1} c={C.contorno} />
      <R x={118} y={28} w={18} h={12} c="#b8bcc8" />
      <R x={118} y={28} w={18} h={2} c="#dcdfe6" />
      <R x={121} y={33} w={4} h={4} c={C.contorno} />
      <R x={129} y={33} w={4} h={4} c={C.contorno} />
      <Taza x={150} y={40} />
      <Taza x={160} y={40} />
      <R x={172} y={32} w={28} h={8} c="#e8f2f6" o={0.7} />
      <R x={175} y={35} w={5} h={4} c="#e0a43a" />
      <R x={183} y={35} w={5} h={4} c="#c2553a" />
      <R x={191} y={35} w={5} h={4} c="#f2a7b8" />
      <PlantaColgante x={90} y={16} />
      <PlantaColgante x={228} y={18} />
      <Planta x={10} y={66} grande />
      <Zocalo y={mesa - 4} ancho={ANCHO_GRUPO} />
      <PisoDeMadera y={mesa + 18} ancho={ANCHO_GRUPO} alto={12} />
      {controles && (
        <>
          <RelojPixel x={96} y={2} c={controles} />
          <RadioPixel x={200} y={40} c={controles} />
        </>
      )}
      <GenteSentada sentados={sentados} xs={xs} mesa={mesa} />
      <Mesa x={6} y={mesa} ancho={ANCHO_GRUPO - 12} alto={20} />
      <CosasEnLaMesa sentados={sentados} xs={xs} espacio={espacio} mesa={mesa} />
      <Resto n={personas.length - sentados.length} y={mesa - 14} />
      <Ambientacion ancho={ANCHO_GRUPO} alto={ALTO_GRUPO} ambiente={ambiente} />
    </Lienzo>
  )
}

/** El invernadero: una pared entera de vidrio, plantas por todos lados y un banco con macetas. */
export function EscenaInvernadero({ personas, ambiente = 'medianoche', controles, cubrir }: PropsEscenaGrupo) {
  const sentados = personas.slice(0, MAX_SENTADOS)
  const { espacio, xs } = ubicaciones(sentados.length)
  const mesa = 70
  return (
    <Lienzo ancho={ANCHO_GRUPO} alto={ALTO_GRUPO} etiqueta={personas.map((p) => p.nombre).join(', ')} cubrir={cubrir}>
      <R x={0} y={0} w={ANCHO_GRUPO} h={mesa} c="#d8e4dc" />
      <Ventana
        x={6}
        y={6}
        ancho={308}
        alto={50}
        ambiente={ambiente}
        paneles={10}
        cortinas={false}
        marco="#eef2f0"
        onClima={controles?.onClima}
        etiquetaClima={controles?.etiquetaClima}
      />
      {/* banco de macetas contra el vidrio */}
      <R x={0} y={58} w={ANCHO_GRUPO} h={3} c={C.maderaClara} />
      <R x={0} y={61} w={ANCHO_GRUPO} h={1} c={C.contorno} />
      <R x={0} y={62} w={ANCHO_GRUPO} h={8} c="#8aa08a" />
      {[22, 58, 96, 230, 266, 300].map((px, i) => (
        <Planta key={px} x={px} y={58} grande={i % 2 === 0} />
      ))}
      {[40, 80, 120, 160, 200, 240, 280].map((px) => (
        <PlantaColgante key={px} x={px} y={10 + (px % 3) * 3} />
      ))}
      {/* flores */}
      {[140, 150, 176, 186].map((fx, i) => (
        <g key={fx}>
          <R x={fx} y={52} w={1} h={6} c="#4f8a5b" />
          <R x={fx - 1} y={50} w={3} h={3} c={['#f472b6', '#fde047', '#f2a7b8', '#e07f72'][i]} />
        </g>
      ))}
      <PisoDeMadera y={mesa + 18} ancho={ANCHO_GRUPO} alto={12} />
      {controles && (
        <>
          <R x={159} y={0} w={1} h={2} c={C.contorno} />
          <RelojPixel x={149} y={2} c={controles} />
          <RadioPixel x={196} y={58} c={controles} />
        </>
      )}
      <GenteSentada sentados={sentados} xs={xs} mesa={mesa} />
      <Mesa x={6} y={mesa} ancho={ANCHO_GRUPO - 12} alto={20} />
      <CosasEnLaMesa sentados={sentados} xs={xs} espacio={espacio} mesa={mesa} />
      <Resto n={personas.length - sentados.length} y={mesa - 14} />
      <Ambientacion ancho={ANCHO_GRUPO} alto={ALTO_GRUPO} ambiente={ambiente} />
    </Lienzo>
  )
}

/** La cabaña: paredes de troncos, una chimenea de piedra y ventanitas a los costados. */
export function EscenaCabana({ personas, ambiente = 'medianoche', controles, cubrir }: PropsEscenaGrupo) {
  const sentados = personas.slice(0, MAX_SENTADOS)
  const { espacio, xs } = ubicaciones(sentados.length)
  const mesa = 70
  const toque = { onClima: controles?.onClima, etiquetaClima: controles?.etiquetaClima }
  return (
    <Lienzo ancho={ANCHO_GRUPO} alto={ALTO_GRUPO} etiqueta={personas.map((p) => p.nombre).join(', ')} cubrir={cubrir}>
      {/* troncos */}
      {Array.from({ length: 12 }, (_, j) => (
        <g key={j}>
          <R x={0} y={j * 6} w={ANCHO_GRUPO} h={6} c={j % 2 ? '#7a4a2e' : '#8a5a3b'} />
          <R x={0} y={j * 6} w={ANCHO_GRUPO} h={1} c="#a8744a" />
          <R x={0} y={j * 6 + 5} w={ANCHO_GRUPO} h={1} c="#4a2c1c" />
        </g>
      ))}
      <Ventana x={28} y={14} ancho={34} alto={26} ambiente={ambiente} {...toque} />
      <Ventana x={258} y={14} ancho={34} alto={26} ambiente={ambiente} {...toque} />
      {/* chimenea de piedra */}
      <R x={124} y={0} w={72} h={mesa} c="#9a8a80" />
      {Array.from({ length: 12 }, (_, j) => (
        <g key={j}>
          <R x={124} y={j * 6} w={72} h={1} c="#7a6a62" />
          {Array.from({ length: 6 }, (_, i) => (
            <R key={i} x={124 + i * 12 + (j % 2) * 6} y={j * 6} w={1} h={6} c="#7a6a62" />
          ))}
        </g>
      ))}
      <R x={118} y={24} w={84} h={3} c={C.maderaClara} />
      <R x={118} y={24} w={84} h={1} c={C.maderaLuz} />
      <R x={118} y={27} w={84} h={1} c={C.contorno} />
      <R x={138} y={38} w={44} h={mesa - 38} c={C.contorno} />
      <R x={139} y={39} w={42} h={mesa - 39} c="#1e120c" />
      <Fuego x={160} y={mesa - 1} />
      {[128, 190].map((vx) => (
        <g key={vx}>
          <R x={vx} y={18} w={2} h={6} c={C.crema} />
          <R x={vx} y={16} w={2} h={2} c="#ffc84a" className="titila" />
        </g>
      ))}
      <PilaDeLibros x={142} y={24} />
      <Planta x={100} y={66} grande />
      <Planta x={222} y={66} grande />
      <Luces x1={4} x2={116} y={4} caida={4} />
      <Luces x1={204} x2={316} y={4} caida={4} />
      <PisoDeMadera y={mesa + 18} ancho={ANCHO_GRUPO} alto={12} />
      {controles && (
        <>
          <RelojPixel x={149} y={2} c={controles} />
          <RadioPixel x={172} y={24} c={controles} />
        </>
      )}
      <GenteSentada sentados={sentados} xs={xs} mesa={mesa} />
      <Mesa x={6} y={mesa} ancho={ANCHO_GRUPO - 12} alto={20} />
      <CosasEnLaMesa sentados={sentados} xs={xs} espacio={espacio} mesa={mesa} />
      <Resto n={personas.length - sentados.length} y={mesa - 14} />
      <Ambientacion ancho={ANCHO_GRUPO} alto={ALTO_GRUPO} ambiente={ambiente} />
    </Lienzo>
  )
}

/** Un fondo temático: la sala de siempre (ventanas, reloj, radio y la mesa con todos) y su decoración. */
export interface Tema {
  pared: [base: string, raya: string, motivo?: string]
  piso?: string // color de baldosas (si no hay, piso de madera)
  ventanas?: { x: number; y: number; ancho: number; alto: number; paneles?: number; cortinas?: boolean; marco?: string }[]
  radio?: [x: number, y: number] // dónde va la radio (abajo a la izquierda); si no, en un estante a la derecha
  decoracion: () => ReactNode
}

const VENTANAS_DE_SIEMPRE: NonNullable<Tema['ventanas']> = [
  { x: 14, y: 12, ancho: 34, alto: 26 },
  { x: 272, y: 12, ancho: 34, alto: 26 },
]

export function EscenaTematica({ tema, personas, ambiente = 'medianoche', controles, cubrir }: PropsEscenaGrupo & { tema: Tema }) {
  const sentados = personas.slice(0, MAX_SENTADOS)
  const { espacio, xs } = ubicaciones(sentados.length)
  const mesa = 70
  const [base, raya, motivo] = tema.pared
  return (
    <Lienzo ancho={ANCHO_GRUPO} alto={ALTO_GRUPO} etiqueta={personas.map((p) => p.nombre).join(', ')} cubrir={cubrir}>
      <Empapelado ancho={ANCHO_GRUPO} alto={mesa} base={base} raya={raya} motivo={motivo} />
      <Zocalo y={mesa - 4} ancho={ANCHO_GRUPO} />
      {tema.piso ? (
        <>
          <R x={0} y={mesa + 18} w={ANCHO_GRUPO} h={12} c={tema.piso} />
          {Array.from({ length: ANCHO_GRUPO / 8 }, (_, i) => (
            <R key={i} x={i * 8 + (i % 2) * 0} y={mesa + 18 + (i % 2) * 6} w={8} h={6} c="#000000" o={0.08} />
          ))}
        </>
      ) : (
        <PisoDeMadera y={mesa + 18} ancho={ANCHO_GRUPO} alto={12} />
      )}
      {(tema.ventanas ?? VENTANAS_DE_SIEMPRE).map((v) => (
        <Ventana key={`${v.x}-${v.y}`} {...v} ambiente={ambiente} onClima={controles?.onClima} etiquetaClima={controles?.etiquetaClima} />
      ))}
      {tema.decoracion()}
      {controles && (
        <>
          <RelojPixel x={149} y={2} c={controles} />
          {tema.radio ? (
            <RadioPixel x={tema.radio[0]} y={tema.radio[1]} c={controles} />
          ) : (
            <>
              <R x={238} y={30} w={24} h={2} c={C.maderaClara} />
              <R x={238} y={32} w={24} h={1} c={C.contorno} />
              <RadioPixel x={240} y={30} c={controles} />
            </>
          )}
        </>
      )}
      <GenteSentada sentados={sentados} xs={xs} mesa={mesa} />
      <Mesa x={6} y={mesa} ancho={ANCHO_GRUPO - 12} alto={20} />
      <CosasEnLaMesa sentados={sentados} xs={xs} espacio={espacio} mesa={mesa} />
      <Resto n={personas.length - sentados.length} y={mesa - 14} />
      <Ambientacion ancho={ANCHO_GRUPO} alto={ALTO_GRUPO} ambiente={ambiente} />
    </Lienzo>
  )
}

/** Los lugares para estudiar en grupo, en el orden del selector (los temáticos están en Tematicas.tsx). */
export const ESCENAS_DE_GRUPO = [
  'biblioteca',
  'aula',
  'cafeteria',
  'invernadero',
  'cabana',
  'cine',
  'ingenieria',
  'sistemas',
  'economia',
  'laboratorio',
  'observatorio',
  'arte',
  'mistica',
  'kawaii',
  'gotica',
  'juridico',
  'medicina',
  'odontologia',
  'letras',
  'musica',
  'arquitectura',
  'psicologia',
  'cocina',
] as const

/** Elige la escena según su nombre. */
export function EscenaDeGrupo({
  escena,
  personas,
  ambiente,
  controles,
  cubrir,
}: {
  escena: string
  personas: Persona[]
  ambiente: Ambiente
  controles?: ControlesSala
  cubrir?: boolean
}) {
  const props = { personas, ambiente, controles, cubrir }
  const tema = TEMAS[escena]
  const Lugar =
    { aula: EscenaAula, cafeteria: EscenaCafeteria, invernadero: EscenaInvernadero, cabana: EscenaCabana }[escena] ?? EscenaBiblioteca
  return (
    <AlTocarPersona.Provider value={controles?.onPersona ?? null}>
      {tema ? <EscenaTematica tema={tema} {...props} /> : <Lugar {...props} />}
    </AlTocarPersona.Provider>
  )
}

/** Para estudiar solo hay un solo lugar: el escritorio. */
export function EscenaSola({
  persona,
  ambiente,
  onClima,
  etiquetaClima,
}: {
  persona: Persona
  ambiente: Ambiente
  onClima?: () => void
  etiquetaClima?: string
}) {
  return <EscenaEscritorio persona={persona} ambiente={ambiente} onClima={onClima} etiquetaClima={etiquetaClima} />
}

/** Un objeto del escritorio suelto, para mostrarlo en la tienda. */
export function VistaDecoracion({ id }: { id: string }) {
  return (
    <svg viewBox="-12 -22 24 24" className="escena escena-pixel block h-full w-full" shapeRendering="crispEdges">
      {id === 'taza' && <Taza x={0} y={-2} />}
      {id === 'libros' && <PilaDeLibros x={0} y={-4} />}
      {id === 'globo' && <Globo x={-1} y={-3} />}
      {id === 'planta' && (
        <g transform="translate(0 -4)">
          <Planta x={0} y={0} />
        </g>
      )}
      {id === 'luces' && <Luces x1={-12} x2={12} y={-18} caida={6} />}
      {id === 'mate-escritorio' && (
        <g transform="translate(0 -3) scale(1.4)">
          <MateDeco x={0} y={0} />
        </g>
      )}
      {id === 'matcha' && (
        <g transform="translate(0 -3) scale(1.4)">
          <Matcha x={0} y={0} />
        </g>
      )}
      {(['manzana', 'cactus', 'lapices', 'reloj-arena', 'vela'] as const).map((otro) => {
        const Objeto = OBJETOS_DE_MESA[otro]
        return id === otro ? (
          <g key={otro} transform="translate(0 -3) scale(1.4)">
            <Objeto x={0} y={0} />
          </g>
        ) : null
      })}
    </svg>
  )
}
