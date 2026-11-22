import type { CSSProperties } from 'react'

/** Un dibujo pixel escrito como texto: cada letra es un color de la paleta y '.' es transparente.
 * Los píxeles seguidos del mismo color se juntan en un solo rectángulo. */
export function Sprite({
  mapa,
  paleta,
  x = 0,
  y = 0,
  espejo = false,
  className,
  style,
}: {
  mapa: string[]
  paleta: Record<string, string>
  x?: number
  y?: number
  espejo?: boolean
  className?: string
  style?: CSSProperties
}) {
  const ancho = Math.max(...mapa.map((f) => f.length))
  const rects = []
  for (let j = 0; j < mapa.length; j++) {
    const fila = espejo ? [...mapa[j].padEnd(ancho, '.')].reverse().join('') : mapa[j]
    let i = 0
    while (i < fila.length) {
      const letra = fila[i]
      let fin = i + 1
      while (fin < fila.length && fila[fin] === letra) fin++
      const color = paleta[letra]
      if (letra !== '.' && color) rects.push(<rect key={`${j}-${i}`} x={x + i} y={y + j} width={fin - i} height={1} fill={color} />)
      i = fin
    }
  }
  return (
    <g className={className} style={style}>
      {rects}
    </g>
  )
}
