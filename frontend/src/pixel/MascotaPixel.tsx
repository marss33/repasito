import { urlApi } from '../api'
import { useId } from 'react'
import type { Apariencia } from '../types'
import { ACCESORIOS_CABEZA, ACCESORIOS_CUELLO, MASCOTAS, PALETA_BASE, PLANTILLAS } from './mascotas'
import { Sprite } from './Sprite'

type AparienciaMascota = Pick<Apariencia, 'mascota' | 'cabeza' | 'cara' | 'cuello'>

/** Medidas de una mascota (para encuadrarla). */
export function medidasMascota(id: string) {
  if (id === 'mascota-foto') return { ancho: 16, alto: 16 }
  const m = MASCOTAS[id] ?? MASCOTAS['gato-naranja']
  const mapa = PLANTILLAS[m.plantilla].mapa
  return { ancho: Math.max(...mapa.map((f) => f.length)), alto: mapa.length }
}

/** Una mascota pixel dentro de un SVG. (x, y) es el centro de abajo (donde apoya las patas). */
export function MascotaPixel({
  apariencia,
  x,
  y,
  demora = 0,
  foto,
}: {
  apariencia: AparienciaMascota
  x: number
  y: number
  demora?: number
  foto?: string
}) {
  if (apariencia.mascota === 'mascota-foto') return <MascotaFoto x={x} y={y} foto={foto} apariencia={apariencia} />
  const m = MASCOTAS[apariencia.mascota] ?? MASCOTAS['gato-naranja']
  const p = PLANTILLAS[m.plantilla]
  const ancho = p.mapa[0].length
  const centro = p.centro ?? Math.floor(ancho / 2)
  const x0 = Math.round(x - centro)
  const y0 = y - p.mapa.length
  const paleta = { ...PALETA_BASE, ...m.paleta }
  // Rayas, manchas, puntas y colas: se pintan sobre la plantilla (nunca sobre el contorno)
  const mapa = m.extra
    ? p.mapa.map((fila, j) => {
        const letras = [...fila]
        for (const [cx, cy, letra] of m.extra!) {
          if (cy !== j || letras[cx] === 'o') continue
          while (letras.length <= cx) letras.push('.')
          letras[cx] = letra
        }
        return letras.join('')
      })
    : p.mapa
  const [filaOjos, izq, der] = p.ojos
  return (
    <g className="respira-pixel" style={{ animationDelay: `${-demora * 0.7}s` }}>
      <Sprite mapa={mapa} paleta={paleta} x={x0} y={y0} />
      {/* parpadeo: un instante se tapan los ojos con el pelaje */}
      <g className="parpadeo-pixel" style={{ animationDelay: `${-demora * 1.3}s` }}>
        {[izq, der].map((cx) => (
          <g key={cx}>
            <rect x={x0 + cx} y={y0 + filaOjos} width={2} height={2} fill={paleta.b} />
            <rect x={x0 + cx} y={y0 + filaOjos + 1} width={2} height={1} fill={paleta.o} />
          </g>
        ))}
      </g>
      <Accesorios apariencia={apariencia} x0={x0} y0={y0} centro={p.accesorios ?? centro} plantilla={p} />
    </g>
  )
}

function Accesorios({
  apariencia,
  x0,
  y0,
  centro,
  plantilla,
}: {
  apariencia: AparienciaMascota
  x0: number
  y0: number
  centro: number
  plantilla: (typeof PLANTILLAS)[string]
}) {
  const [filaOjos, izq, der] = plantilla.ojos
  const cuello = apariencia.cuello ? ACCESORIOS_CUELLO[apariencia.cuello] : null
  const cabeza = apariencia.cabeza ? ACCESORIOS_CABEZA[apariencia.cabeza] : null
  const ojoY = y0 + filaOjos
  return (
    <>
      {cuello && (
        <Sprite
          mapa={cuello.mapa}
          paleta={cuello.paleta}
          x={x0 + centro - Math.floor(cuello.mapa[0].length / 2)}
          y={y0 + plantilla.cuello}
        />
      )}
      {apariencia.cara === 'anteojos' &&
        [izq, der].map((cx) => (
          <g key={cx} fill="#3b2417">
            <rect x={x0 + cx - 1} y={ojoY - 1} width={4} height={1} />
            <rect x={x0 + cx - 1} y={ojoY + 2} width={4} height={1} />
            <rect x={x0 + cx - 1} y={ojoY} width={1} height={2} />
            <rect x={x0 + cx + 2} y={ojoY} width={1} height={2} />
          </g>
        ))}
      {apariencia.cara === 'lentes-sol' &&
        [izq, der].map((cx) => (
          <g key={cx}>
            <rect x={x0 + cx - 1} y={ojoY - 1} width={4} height={3} fill="#2a2a34" />
            <rect x={x0 + cx} y={ojoY - 1} width={1} height={1} fill="#8a8aa0" />
          </g>
        ))}
      {(apariencia.cara === 'anteojos' || apariencia.cara === 'lentes-sol') && (
        <rect x={x0 + izq + 2} y={ojoY} width={Math.max(0, der - izq - 3)} height={1} fill="#3b2417" />
      )}
      {apariencia.cara === 'lentes-corazon' &&
        [izq, der].map((cx) => <Sprite key={cx} mapa={['p.p', 'ppp', '.p.']} paleta={{ p: '#f04a8a' }} x={x0 + cx - 1} y={ojoY - 1} />)}
      {cabeza && (
        <Sprite
          mapa={cabeza.mapa}
          paleta={cabeza.paleta}
          x={x0 + centro - Math.floor(cabeza.mapa[0].length / 2) + (cabeza.dx ?? 0)}
          y={y0 + plantilla.cabeza - cabeza.mapa.length + 2}
        />
      )}
    </>
  )
}

/** La mascota personalizada: la foto que subió el usuario, en un marquito de madera. */
function MascotaFoto({ x, y, foto, apariencia }: { x: number; y: number; foto?: string; apariencia: AparienciaMascota }) {
  const id = useId()
  const x0 = Math.round(x - 8)
  const y0 = y - 16
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <rect x={x0 + 2} y={y0 + 2} width={12} height={12} />
        </clipPath>
      </defs>
      <rect x={x0} y={y0} width={16} height={16} fill="#3b2417" />
      <rect x={x0 + 1} y={y0 + 1} width={14} height={14} fill="#b07a4f" />
      <rect x={x0 + 2} y={y0 + 2} width={12} height={12} fill="#f6e7c8" />
      {foto && (
        <image
          href={foto}
          x={x0 + 2}
          y={y0 + 2}
          width={12}
          height={12}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${id})`}
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      <Accesorios
        apariencia={{ ...apariencia, cara: null }}
        x0={x0}
        y0={y0}
        centro={8}
        plantilla={{ mapa: [], ojos: [6, 4, 10], cabeza: 1, cuello: 15 }}
      />
    </g>
  )
}

/** Una mascota sola, en su propio SVG (tienda, editor). */
export function MascotaPixelSuelta({ apariencia, foto, className }: { apariencia: AparienciaMascota; foto?: string; className?: string }) {
  const { ancho, alto } = medidasMascota(apariencia.mascota)
  const lado = Math.max(ancho, alto) + 8
  return (
    <svg
      viewBox={`${-lado / 2} ${-lado + 2} ${lado} ${lado}`}
      className={`escena escena-pixel ${className ?? 'block h-full w-full'}`}
      shapeRendering="crispEdges"
    >
      <MascotaPixel apariencia={apariencia} x={0} y={0} foto={foto} />
    </svg>
  )
}

/** La URL de la foto de la mascota personalizada de alguien, si tiene. */
export function fotoDeMascota(usuarioId: number, apariencia: Pick<Apariencia, 'mascota' | 'foto_mascota'>) {
  return apariencia.mascota === 'mascota-foto' && apariencia.foto_mascota
    ? urlApi(`/rincon/foto-mascota/${usuarioId}?v=${apariencia.foto_mascota}`)
    : undefined
}
