import { useAvatarPixel, type AparienciaPixel, type Pose } from './componerAvatar'

const nitido = { imageRendering: 'pixelated' as const }

/** El avatar pixel como imagen suelta (64×64 por la escala). */
export function AvatarPixel({
  a,
  pose = 'sit',
  escala = 3,
  className,
}: {
  a: AparienciaPixel
  pose?: Pose
  escala?: number
  className?: string
}) {
  const url = useAvatarPixel(a, pose)
  const lado = 64 * escala
  return url ? (
    <img src={url} width={lado} height={lado} alt="" draggable={false} className={className} style={nitido} />
  ) : (
    <span className={`inline-block ${className ?? ''}`} style={{ width: lado, height: lado }} />
  )
}

/** El avatar pixel dentro de un SVG: (x, y) es el centro de los pies; ocupa 64×64 por la escala. */
export function AvatarPixelSvg({
  a,
  x,
  y,
  escala = 1,
  pose = 'sit',
}: {
  a: AparienciaPixel
  x: number
  y: number
  escala?: number
  pose?: Pose
}) {
  const url = useAvatarPixel(a, pose)
  if (!url) return null
  const lado = 64 * escala
  return <image href={url} x={x - lado / 2} y={y - lado} width={lado} height={lado} style={nitido} />
}
