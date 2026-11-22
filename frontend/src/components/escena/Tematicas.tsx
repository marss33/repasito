import type { ReactNode } from 'react'
import { C, Disco, Globo, Luces, PilaDeLibros, Planta, PlantaColgante, R, Taza, type Tema } from './Escena'

/* Fondos temáticos para estudiar en grupo, pensados para distintas carreras y estilos.
 * Todos comparten la sala de siempre (ventanas, reloj, radio y la mesa larga) y cambian la decoración:
 * un cuadro grande en el medio de la pared (x 84–236, y 14–46) y cosas a los costados.
 * Ojo: este archivo y Escena.tsx se importan entre sí; acá solo se usan sus piezas al dibujar. */

const PIXEL = "'Pixelify Sans', monospace"

function Marco({ x, y, w, h, fondo, marco }: { x: number; y: number; w: number; h: number; fondo: string; marco?: string }) {
  return (
    <>
      <R x={x} y={y} w={w} h={h} c={C.contorno} />
      <R x={x + 1} y={y + 1} w={w - 2} h={h - 2} c={marco ?? C.madera} />
      <R x={x + 2} y={y + 2} w={w - 4} h={h - 4} c={fondo} />
    </>
  )
}

function Texto({
  x,
  y,
  children,
  tam = 6,
  color = C.contorno,
}: {
  x: number
  y: number
  children: ReactNode
  tam?: number
  color?: string
}) {
  return (
    <text x={x} y={y} fontSize={tam} fill={color} fontFamily={PIXEL} shapeRendering="auto">
      {children}
    </text>
  )
}

function Banderines({ x1, x2, y, colores }: { x1: number; x2: number; y: number; colores: string[] }) {
  const n = Math.floor((x2 - x1) / 8)
  return (
    <g>
      <R x={x1} y={y} w={x2 - x1} h={1} c={C.contorno} />
      {Array.from({ length: n }, (_, i) => (
        <g key={i} fill={colores[i % colores.length]}>
          <rect x={x1 + i * 8 + 1} y={y + 1} width={5} height={2} />
          <rect x={x1 + i * 8 + 2} y={y + 3} width={3} height={1} />
          <rect x={x1 + i * 8 + 3} y={y + 4} width={1} height={1} />
        </g>
      ))}
    </g>
  )
}

/** Un mueble bajo contra la pared, para apoyar cosas a los costados. */
function Mueble({ x, w, y = 52 }: { x: number; w: number; y?: number }) {
  return (
    <>
      <R x={x} y={y} w={w} h={2} c={C.maderaClara} />
      <R x={x} y={y + 2} w={w} h={1} c={C.contorno} />
      <R x={x + 1} y={y + 3} w={w - 2} h={66 - y - 3} c={C.madera} />
      <R x={x + 3} y={y + 6} w={w - 6} h={1} c={C.maderaOscura} />
    </>
  )
}

function Frasco({ x, y, liquido }: { x: number; y: number; liquido: string }) {
  return (
    <g>
      <R x={x + 1} y={y - 9} w={2} h={3} c="#dfe8ec" />
      <R x={x} y={y - 6} w={4} h={6} c="#dfe8ec" o={0.85} />
      <R x={x} y={y - 4} w={4} h={4} c={liquido} />
      <R x={x} y={y - 6} w={1} h={5} c="#ffffff" o={0.5} />
    </g>
  )
}

function Vela({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <R x={x} y={y - 6} w={2} h={6} c={C.crema} />
      <R x={x} y={y - 8} w={2} h={2} c="#ffc84a" className="titila" />
    </g>
  )
}

export const TEMAS: Record<string, Tema> = {
  cine: {
    pared: ['#3a1a2a', '#341626'],
    decoracion: () => (
      <>
        {/* pantalla con telón */}
        <R x={80} y={12} w={160} h={38} c="#6a1a24" />
        <Marco x={92} y={14} w={136} h={32} fondo="#f2ead8" marco="#2a1a1a" />
        <R x={94} y={16} w={132} h={10} c="#9ad0f6" />
        <R x={94} y={26} w={132} h={10} c="#c2e4fa" />
        <R x={110} y={30} w={30} h={14} c="#4f8a5b" />
        <R x={130} y={26} w={40} h={18} c="#3f7a4a" />
        <R x={180} y={32} w={36} h={12} c="#4f8a5b" />
        <Disco cx={200} cy={22} r={4} c="#fff1a0" />
        {[80, 228].map((tx) => (
          <g key={tx}>
            {[0, 3, 6, 9].map((d) => (
              <R key={d} x={tx + d} y={12} w={1} h={38} c="#8e2a34" />
            ))}
          </g>
        ))}
        {/* pochoclos */}
        <R x={58} y={56} w={10} h={10} c="#ffffff" />
        {[0, 4, 8].map((d) => (
          <R key={d} x={58 + d} y={56} w={2} h={10} c="#d8404a" />
        ))}
        {[0, 2, 4, 6, 8].map((d) => (
          <R key={d} x={58 + d} y={53 + (d % 4 === 0 ? 0 : 1)} w={2} h={3} c="#ffe08a" />
        ))}
        <Marco x={270} y={44} w={18} h={22} fondo="#2f3a64" marco="#d4a020" />
        <Texto x={273} y={57} tam={5} color="#ffe08a">
          ★
        </Texto>
        <Marco x={292} y={44} w={18} h={22} fondo="#8e2a34" marco="#d4a020" />
        <Texto x={295} y={57} tam={5} color="#fff3b0">
          ♪
        </Texto>
      </>
    ),
  },

  ingenieria: {
    pared: ['#5a6a74', '#52626c'],
    piso: '#6a7480',
    decoracion: () => (
      <>
        {/* plano */}
        <Marco x={84} y={14} w={150} h={32} fondo="#2f5a8a" marco="#c8ccd4" />
        {Array.from({ length: 9 }, (_, i) => (
          <R key={i} x={88 + i * 16} y={16} w={1} h={28} c="#ffffff" o={0.15} />
        ))}
        <R x={96} y={22} w={50} h={1} c="#ffffff" />
        <R x={96} y={22} w={1} h={18} c="#ffffff" />
        <R x={146} y={22} w={1} h={18} c="#ffffff" />
        <R x={96} y={40} w={50} h={1} c="#ffffff" />
        <R x={110} y={30} w={22} h={1} c="#ffffff" />
        <Disco cx={190} cy={30} r={9} c="#ffffff" />
        <Disco cx={190} cy={30} r={8} c="#2f5a8a" />
        <Disco cx={190} cy={30} r={3} c="#ffffff" />
        <Texto x={160} y={43} tam={5} color="#ffffff">
          PLANO A-1
        </Texto>
        {/* engranaje grande y casco */}
        <Disco cx={66} cy={50} r={8} c="#8a8f9a" />
        {[0, 1, 2, 3].map((i) => (
          <R key={i} x={i % 2 ? 57 : 64} y={i % 2 ? 48 : 40} w={i % 2 ? 18 : 4} h={i % 2 ? 4 : 20} c="#8a8f9a" />
        ))}
        <Disco cx={66} cy={50} r={3} c="#52626c" />
        <Mueble x={266} w={46} />
        <R x={276} y={46} w={14} h={6} c="#f2c35b" />
        <R x={274} y={51} w={18} h={1} c="#d4a020" />
        <R x={296} y={48} w={10} h={2} c="#c8ccd4" />
        <R x={304} y={46} w={3} h={6} c="#c8ccd4" />
      </>
    ),
  },

  sistemas: {
    pared: ['#2a3040', '#262c3a'],
    piso: '#3a4252',
    decoracion: () => (
      <>
        {/* tres pantallas con código */}
        {[96, 136, 176].map((mx, i) => (
          <g key={mx}>
            <Marco x={mx} y={16} w={36} h={24} fondo="#141a24" marco="#4a5060" />
            {Array.from({ length: 6 }, (_, j) => (
              <R
                key={j}
                x={mx + 4 + (j % 3) * 2}
                y={20 + j * 3}
                w={8 + ((j * 7 + i * 3) % 16)}
                h={1}
                c={['#8ae08a', '#7ac4ff', '#ffb43a', '#d98aff'][(j + i) % 4]}
              />
            ))}
            <R x={mx + 16} y={40} w={4} h={4} c="#4a5060" />
          </g>
        ))}
        <R x={188} y={33} w={2} h={2} c="#8ae08a" className="titila" />
        {/* servidor con lucecitas */}
        <R x={54} y={28} w={22} h={38} c={C.contorno} />
        <R x={55} y={29} w={20} h={36} c="#3a4050" />
        {Array.from({ length: 6 }, (_, j) => (
          <g key={j}>
            <R x={57} y={31 + j * 6} w={16} h={4} c="#2a2f3a" />
            <R
              x={59}
              y={32 + j * 6}
              w={1}
              h={1}
              c={j % 2 ? '#8ae08a' : '#7ac4ff'}
              className="titila"
              style={{ animationDelay: `${-j * 0.4}s` }}
            />
          </g>
        ))}
        {/* post-its */}
        {[
          [262, 44, '#ffe08a'],
          [272, 48, '#f2a7b8'],
          [282, 44, '#8ae08a'],
        ].map(([x, y, c]) => (
          <R key={x as number} x={x as number} y={y as number} w={7} h={7} c={c as string} />
        ))}
        <Planta x={300} y={66} />
      </>
    ),
  },

  economia: {
    pared: ['#e8e0cc', '#e0d8c2'],
    decoracion: () => (
      <>
        {/* gráfico que sube */}
        <Marco x={84} y={14} w={150} h={32} fondo="#fbf7ec" marco="#5a4a42" />
        <R x={92} y={18} w={1} h={24} c={C.contorno} />
        <R x={92} y={42} w={136} h={1} c={C.contorno} />
        {[38, 36, 37, 33, 34, 30, 31, 27, 24, 26, 22, 20].map((alto, i) => (
          <R key={i} x={95 + i * 11} y={alto} w={11} h={2} c={i === 9 ? '#d8404a' : '#4f8a5b'} />
        ))}
        <Texto x={196} y={24} tam={5} color="#4f8a5b">
          ▲ +12%
        </Texto>
        {/* pilas de monedas */}
        {[56, 64, 72].map((cx, i) => (
          <g key={cx}>
            {Array.from({ length: 3 + i }, (_, j) => (
              <g key={j}>
                <R x={cx} y={64 - j * 2} w={7} h={2} c="#e0a43a" />
                <R x={cx} y={64 - j * 2} w={7} h={1} c="#f2c35b" />
              </g>
            ))}
          </g>
        ))}
        {/* calculadora */}
        <Mueble x={266} w={46} />
        <R x={278} y={42} w={14} h={10} c="#3a3f4a" />
        <R x={280} y={43} w={10} h={3} c="#a8c8a0" />
        {[0, 1, 2].map((i) => (
          <R key={i} x={280 + i * 4} y={47} w={2} h={3} c="#dcdfe6" />
        ))}
        <Planta x={302} y={52} />
      </>
    ),
  },

  laboratorio: {
    pared: ['#dfeae6', '#d6e2de'],
    piso: '#c8d8d2',
    decoracion: () => (
      <>
        {/* tabla periódica */}
        <Marco x={84} y={14} w={72} h={30} fondo="#fbfbf6" marco="#4a5a62" />
        {Array.from({ length: 5 }, (_, j) =>
          Array.from({ length: 11 }, (_, i) =>
            (j > 0 || i === 0 || i === 10) && (j < 2 ? i < 2 || i > 7 : true) ? (
              <R
                key={`${i}-${j}`}
                x={88 + i * 6}
                y={18 + j * 5}
                w={5}
                h={4}
                c={['#f2a7b8', '#ffe08a', '#a8d8f0', '#b8e0a8', '#d8c0f0'][(i + j) % 5]}
              />
            ) : null,
          ),
        )}
        {/* estante con frascos */}
        <R x={162} y={40} w={70} h={2} c={C.maderaClara} />
        <R x={162} y={42} w={70} h={1} c={C.contorno} />
        {['#7fd06a', '#f07fa8', '#6ab8f0', '#f2c35b', '#a878e0', '#7fd06a'].map((liq, i) => (
          <Frasco key={i} x={166 + i * 11} y={40} liquido={liq} />
        ))}
        {/* microscopio */}
        <R x={58} y={64} w={14} h={2} c="#3a3f4a" />
        <R x={66} y={50} w={3} h={14} c="#3a3f4a" />
        <R x={60} y={46} w={4} h={10} c="#dcdfe6" />
        <R x={59} y={56} w={9} h={2} c="#3a3f4a" />
        <Mueble x={266} w={46} />
        <Frasco x={276} y={52} liquido="#6ab8f0" />
        <Frasco x={286} y={52} liquido="#f07fa8" />
        <Frasco x={296} y={52} liquido="#7fd06a" />
      </>
    ),
  },

  observatorio: {
    pared: ['#1e2440', '#1a2038', '#5a6aa0'],
    piso: '#2a3050',
    decoracion: () => (
      <>
        {/* mapa de estrellas */}
        <Marco x={84} y={14} w={150} h={32} fondo="#141a34" marco="#8a7a5a" />
        {[
          [100, 22],
          [112, 30],
          [126, 24],
          [140, 34],
          [170, 20],
          [184, 28],
          [200, 22],
          [214, 36],
        ].map(([x, y], i, todos) => (
          <g key={i}>
            {i > 0 && i !== 4 && (
              <R
                x={Math.min(x, todos[i - 1][0])}
                y={Math.min(y, todos[i - 1][1])}
                w={Math.abs(x - todos[i - 1][0]) || 1}
                h={1}
                c="#5a6aa0"
                o={0.6}
              />
            )}
            <R x={x} y={y} w={2} h={2} c="#fff6c4" className="titila" style={{ animationDelay: `${-i * 0.5}s` }} />
          </g>
        ))}
        <Disco cx={150} cy={38} r={4} c="#e0a43a" />
        <R x={144} y={38} w={12} h={1} c="#f6e7c8" />
        {/* telescopio */}
        <R x={60} y={64} w={14} h={2} c="#3a3f4a" />
        <R x={62} y={54} w={1} h={10} c="#3a3f4a" />
        <R x={71} y={54} w={1} h={10} c="#3a3f4a" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <R key={i} x={56 + i * 3} y={52 - i * 3} w={5} h={4} c="#c8ccd4" />
        ))}
        <Mueble x={266} w={46} />
        <Globo x={288} y={52} />
      </>
    ),
  },

  arte: {
    pared: ['#f0e6d6', '#e8dccb'],
    decoracion: () => (
      <>
        <Banderines x1={84} x2={236} y={13} colores={['#e07f72', '#f2c35b', '#7fb3a6', '#8a5aa8']} />
        {/* cuadros */}
        <Marco x={92} y={20} w={40} h={26} fondo="#f6e7c8" marco="#d4a020" />
        <R x={96} y={24} w={16} h={18} c="#3f6aa0" />
        <R x={112} y={30} w={16} h={12} c="#e07f72" />
        <Disco cx={122} cy={27} r={3} c="#f2c35b" />
        <Marco x={140} y={22} w={36} h={22} fondo="#2f3a34" marco="#8a5a3b" />
        <Disco cx={158} cy={33} r={7} c="#f2a7b8" />
        <Disco cx={158} cy={33} r={3} c="#ffe08a" />
        <Marco x={184} y={20} w={44} h={26} fondo="#fbf3df" marco="#d4a020" />
        {[0, 1, 2, 3].map((i) => (
          <R key={i} x={188 + i * 9} y={26 + (i % 2) * 6} w={8} h={12 - (i % 2) * 6} c={['#c25b56', '#4f8a5b', '#e0a43a', '#6a5ab0'][i]} />
        ))}
        {/* atril con lienzo */}
        <R x={60} y={40} w={2} h={26} c={C.maderaOscura} />
        <R x={72} y={40} w={2} h={26} c={C.maderaOscura} />
        <Marco x={54} y={36} w={26} h={20} fondo="#ffffff" marco="#b07a4f" />
        <R x={58} y={42} w={10} h={6} c="#7fb3a6" />
        <R x={64} y={46} w={12} h={6} c="#f2a7b8" />
        {/* manchas de pintura y frasco de pinceles */}
        {[
          [262, 44, '#e07f72'],
          [300, 46, '#3f6aa0'],
        ].map(([x, y, c]) => (
          <Disco key={x as number} cx={x as number} cy={y as number} r={2} c={c as string} />
        ))}
        <Mueble x={266} w={46} />
        <R x={280} y={44} w={8} h={8} c="#a8d8f0" o={0.8} />
        {[0, 2, 4, 6].map((d) => (
          <R key={d} x={281 + d} y={38 - (d % 4)} w={1} h={8} c={['#c25b56', '#f2c35b', '#4f8a5b', '#6a5ab0'][d / 2]} />
        ))}
      </>
    ),
  },

  mistica: {
    pared: ['#3a2a4a', '#342644', '#6a5a9a'],
    piso: '#2a2036',
    decoracion: () => (
      <>
        <Banderines x1={84} x2={236} y={13} colores={['#d8c0f0', '#f2c35b']} />
        {/* luna y estrellas */}
        <Disco cx={110} cy={28} r={7} c="#fff1b8" />
        <Disco cx={113} cy={26} r={6} c="#3a2a4a" />
        {[
          [130, 22],
          [200, 24],
          [214, 32],
          [96, 40],
        ].map(([x, y], i) => (
          <R key={i} x={x} y={y} w={2} h={2} c="#fff6c4" className="titila" style={{ animationDelay: `${-i * 0.6}s` }} />
        ))}
        {/* estante de pociones y libros de hechizos */}
        <R x={140} y={40} w={92} h={2} c={C.maderaClara} />
        <R x={140} y={42} w={92} h={1} c={C.contorno} />
        {['#a878e0', '#7fd06a', '#f07fa8', '#6ab8f0'].map((liq, i) => (
          <Frasco key={i} x={144 + i * 10} y={40} liquido={liq} />
        ))}
        {['#6a3a8a', '#2f5a46', '#8e2a34'].map((c, i) => (
          <R key={i} x={188 + i * 5} y={30} w={4} h={10} c={c} />
        ))}
        {/* bola de cristal */}
        <Disco cx={220} cy={34} r={5} c="#b8a0f0" o={0.9} />
        <R x={218} y={31} w={2} h={2} c="#ffffff" o={0.7} />
        <R x={215} y={38} w={10} h={2} c="#d4a020" />
        {/* caldero con burbujas */}
        <Disco cx={66} cy={60} r={8} aplastado={0.7} c="#2a2a30" />
        <R x={58} y={54} w={16} h={2} c="#3a3a44" />
        <R x={60} y={53} w={12} h={2} c="#7fd06a" />
        {[0, 1, 2].map((i) => (
          <R key={i} x={62 + i * 4} y={48 - i} w={2} h={2} c="#9fe08a" className="vapor-pixel" style={{ animationDelay: `${-i * 0.7}s` }} />
        ))}
        <Mueble x={266} w={46} />
        <Vela x={274} y={52} />
        <Vela x={286} y={52} />
        <Vela x={298} y={52} />
        <PlantaColgante x={250} y={16} />
      </>
    ),
  },

  kawaii: {
    pared: ['#f8d8e4', '#f4cad8', '#ffffff'],
    piso: '#f2b8cc',
    decoracion: () => (
      <>
        <Luces x1={84} x2={236} y={13} caida={4} />
        {/* arcoíris y nubes */}
        {['#f28a9a', '#f2c35b', '#9ad08a', '#8ac0f0', '#c8a0f0'].map((c, i) => (
          <g key={c}>
            <Disco cx={160} cy={46} r={26 - i * 3} aplastado={0.8} c={c} />
          </g>
        ))}
        <Disco cx={160} cy={46} r={11} aplastado={0.8} c="#f8d8e4" />
        <R x={128} y={44} w={64} h={4} c="#f8d8e4" />
        {[
          [124, 40],
          [186, 40],
        ].map(([x, y]) => (
          <g key={x} fill="#ffffff">
            <rect x={x} y={y} width={14} height={5} />
            <rect x={x + 3} y={y - 2} width={7} height={2} />
          </g>
        ))}
        {/* corazones */}
        {[
          [100, 22],
          [212, 20],
          [96, 34],
          [222, 34],
        ].map(([x, y], i) => (
          <g key={i} fill="#f472b6">
            <rect x={x} y={y} width={2} height={1} />
            <rect x={x + 3} y={y} width={2} height={1} />
            <rect x={x} y={y + 1} width={5} height={1} />
            <rect x={x + 1} y={y + 2} width={3} height={1} />
            <rect x={x + 2} y={y + 3} width={1} height={1} />
          </g>
        ))}
        {/* peluches: conejito y osito */}
        <Mueble x={52} w={30} />
        <R x={58} y={42} w={2} h={6} c="#ffffff" />
        <R x={62} y={42} w={2} h={6} c="#ffffff" />
        <Disco cx={61} cy={49} r={4} c="#ffffff" />
        <R x={59} y={48} w={1} h={1} c={C.contorno} />
        <R x={62} y={48} w={1} h={1} c={C.contorno} />
        <Disco cx={73} cy={48} r={4} c="#d8a878" />
        <Disco cx={70} cy={44} r={1} c="#d8a878" />
        <Disco cx={76} cy={44} r={1} c="#d8a878" />
        <R x={71} y={47} w={1} h={1} c={C.contorno} />
        <R x={74} y={47} w={1} h={1} c={C.contorno} />
        {/* moño gigante */}
        <g fill="#f472b6">
          <rect x={276} y={46} width={8} height={7} />
          <rect x={290} y={46} width={8} height={7} />
          <rect x={284} y={48} width={6} height={4} />
          <rect x={283} y={52} width={3} height={6} />
          <rect x={288} y={52} width={3} height={6} />
        </g>
      </>
    ),
  },

  gotica: {
    pared: ['#241a26', '#20161f', '#4a3a4a'],
    piso: '#1a141c',
    decoracion: () => (
      <>
        {/* vitral en arco */}
        <Disco cx={160} cy={24} r={18} c="#4a3a4a" />
        <R x={142} y={24} w={36} h={22} c="#4a3a4a" />
        <Disco cx={160} cy={24} r={16} c="#6a2a4a" />
        <R x={144} y={24} w={32} h={20} c="#6a2a4a" />
        {[
          [148, 26, '#8e2a34'],
          [160, 26, '#3f3a8a'],
          [148, 36, '#3f6a6a'],
          [160, 36, '#8a5a2a'],
        ].map(([x, y, c]) => (
          <R key={`${x}-${y}`} x={x as number} y={y as number} w={11} h={9} c={c as string} />
        ))}
        <R x={159} y={12} w={2} h={34} c="#2a1a24" />
        <R x={144} y={35} w={32} h={1} c="#2a1a24" />
        {/* candelabros */}
        {[96, 214].map((cx) => (
          <g key={cx}>
            <R x={cx - 1} y={30} w={2} h={16} c="#8a7a5a" />
            <R x={cx - 7} y={30} w={14} h={2} c="#8a7a5a" />
            <Vela x={cx - 7} y={30} />
            <Vela x={cx - 1} y={30} />
            <Vela x={cx + 5} y={30} />
          </g>
        ))}
        {/* rosas en un florero */}
        <Mueble x={266} w={46} />
        <R x={286} y={44} w={6} h={8} c="#2a2a34" />
        {[
          [284, 40],
          [289, 38],
          [293, 41],
        ].map(([x, y]) => (
          <g key={x}>
            <R x={x + 1} y={y + 2} w={1} h={4} c="#2f5a46" />
            <R x={x} y={y} w={3} h={3} c="#8e2a34" />
          </g>
        ))}
        <Marco x={54} y={36} w={22} h={28} fondo="#3a2a3a" marco="#8a7a5a" />
        <Disco cx={65} cy={48} r={5} c="#c8c0d0" o={0.5} />
      </>
    ),
  },

  juridico: {
    pared: ['#e8dcc4', '#e0d2b8'],
    decoracion: () => (
      <>
        {/* biblioteca de códigos */}
        <Marco x={84} y={14} w={150} h={32} fondo="#4a2c1c" />
        {[0, 1].map((fila) => (
          <g key={fila}>
            {Array.from({ length: 24 }, (_, i) => (
              <g key={i}>
                <R x={88 + i * 6} y={18 + fila * 14} w={5} h={11} c={['#6a1a24', '#2a3a5a', '#2f4a36'][(i + fila) % 3]} />
                <R x={89 + i * 6} y={20 + fila * 14} w={3} h={1} c="#d4a020" />
              </g>
            ))}
            <R x={86} y={29 + fila * 14} w={146} h={2} c={C.maderaClara} />
          </g>
        ))}
        {/* balanza */}
        <R x={60} y={64} w={14} h={2} c="#b8902a" />
        <R x={66} y={44} w={2} h={20} c="#d4a020" />
        <R x={56} y={44} w={22} h={1} c="#d4a020" />
        <R x={54} y={50} w={8} h={2} c="#d4a020" />
        <R x={72} y={48} w={8} h={2} c="#d4a020" />
        <R x={57} y={45} w={1} h={5} c="#d4a020" />
        <R x={76} y={45} w={1} h={3} c="#d4a020" />
        {/* martillo y diploma */}
        <Mueble x={266} w={46} />
        <R x={276} y={48} w={12} h={4} c={C.maderaOscura} />
        <R x={286} y={46} w={2} h={8} c={C.madera} />
        <Marco x={294} y={40} w={18} h={12} fondo="#fbf3df" marco="#d4a020" />
        <R x={298} y={44} w={10} h={1} c="#5a4a42" />
        <R x={298} y={47} w={8} h={1} c="#5a4a42" />
      </>
    ),
  },

  medicina: {
    pared: ['#e6f2f0', '#dceae8'],
    piso: '#cfe0dc',
    decoracion: () => (
      <>
        {/* afiche del corazón */}
        <Marco x={96} y={16} w={44} h={28} fondo="#fbfbf6" marco="#4a8a8a" />
        <g fill="#d8404a">
          <rect x={110} y={22} width={6} height={3} />
          <rect x={120} y={22} width={6} height={3} />
          <rect x={108} y={25} width={20} height={6} />
          <rect x={110} y={31} width={16} height={3} />
          <rect x={113} y={34} width={10} height={3} />
          <rect x={116} y={37} width={4} height={2} />
        </g>
        {/* cartel de la vista */}
        <Marco x={180} y={16} w={40} h={28} fondo="#ffffff" marco="#4a8a8a" />
        <Texto x={194} y={25} tam={7}>
          E
        </Texto>
        <Texto x={190} y={33} tam={5}>
          F P
        </Texto>
        <Texto x={188} y={40} tam={4}>
          T O Z
        </Texto>
        {/* cruz y botiquín */}
        <R x={60} y={38} w={14} h={4} c="#3aa86a" />
        <R x={65} y={33} w={4} h={14} c="#3aa86a" />
        <Mueble x={266} w={46} />
        <R x={278} y={42} w={18} h={10} c="#ffffff" />
        <R x={278} y={42} w={18} h={2} c="#d8404a" />
        <R x={285} y={45} w={4} h={6} c="#d8404a" />
        <R x={283} y={47} w={8} h={2} c="#d8404a" />
        {/* estetoscopio colgado */}
        <R x={258} y={40} w={1} h={10} c="#3a3f4a" />
        <Disco cx={258} cy={51} r={2} c="#c8ccd4" />
      </>
    ),
  },

  odontologia: {
    pared: ['#e8f4f8', '#ddeef2'],
    piso: '#d0e4ea',
    decoracion: () => (
      <>
        {/* afiche de la muela */}
        <Marco x={96} y={16} w={44} h={28} fondo="#8ac8f0" marco="#4a7a9a" />
        <g fill="#ffffff">
          <rect x={108} y={21} width={20} height={10} />
          <rect x={110} y={20} width={6} height={1} />
          <rect x={120} y={20} width={6} height={1} />
          <rect x={109} y={31} width={6} height={8} />
          <rect x={121} y={31} width={6} height={8} />
        </g>
        <R x={113} y={25} w={2} h={2} c={C.contorno} />
        <R x={121} y={25} w={2} h={2} c={C.contorno} />
        <R x={116} y={28} w={4} h={1} c="#f472b6" />
        {/* cómo cepillarse */}
        <Marco x={180} y={16} w={40} h={28} fondo="#fbfbf6" marco="#4a7a9a" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <R x={186} y={22 + i * 7} w={18} h={2} c="#7ac4ff" />
            <R x={204} y={21 + i * 7} w={5} h={4} c="#ffffff" />
            <R x={204} y={21 + i * 7} w={5} h={1} c="#8ae08a" />
          </g>
        ))}
        {/* lámpara de dentista */}
        <R x={66} y={30} w={2} h={36} c="#c8ccd4" />
        <R x={58} y={30} w={10} h={2} c="#c8ccd4" />
        <Disco cx={58} cy={34} r={4} c="#e8eef0" />
        <Disco cx={58} cy={34} r={2} c="#fff6c4" />
        {/* vaso con cepillos */}
        <Mueble x={266} w={46} />
        <R x={282} y={44} w={8} h={8} c="#8ac8f0" />
        {['#f472b6', '#7fd06a', '#f2c35b'].map((c, i) => (
          <g key={c}>
            <R x={283 + i * 2} y={36} w={1} h={8} c={c} />
            <R x={283 + i * 2} y={35} w={2} h={2} c="#ffffff" />
          </g>
        ))}
      </>
    ),
  },

  letras: {
    pared: ['#ead8c0', '#e2ceb4'],
    decoracion: () => (
      <>
        {/* cita en un pergamino */}
        <Marco x={84} y={14} w={150} h={26} fondo="#fbf3df" marco="#8a5a3b" />
        <Texto x={92} y={25} tam={7}>
          «Había una vez…»
        </Texto>
        <Texto x={150} y={35} tam={5} color="#8a5a3b">
          — tu próxima historia
        </Texto>
        {/* máquina de escribir */}
        <R x={54} y={56} w={24} h={10} c="#3a3f4a" />
        <R x={56} y={52} w={20} h={4} c="#2a2a34" />
        <R x={58} y={46} w={16} h={6} c="#fbf3df" />
        {[0, 1, 2, 3, 4].map((i) => (
          <R key={i} x={57 + i * 4} y={59} w={2} h={2} c="#dcdfe6" />
        ))}
        {/* libros apilados, pluma y tintero */}
        <Mueble x={266} w={46} />
        <PilaDeLibros x={282} y={52} />
        <R x={296} y={48} w={6} h={4} c="#2a2a34" />
        <R x={300} y={40} w={1} h={8} c="#f6e7c8" />
        <R x={301} y={38} w={2} h={4} c="#ffffff" />
        <Taza x={308} y={52} />
      </>
    ),
  },

  musica: {
    pared: ['#3a2a24', '#34261f'],
    decoracion: () => (
      <>
        {/* pentagrama con notas */}
        <Marco x={84} y={14} w={150} h={28} fondo="#fbf3df" marco="#8a5a3b" />
        {[0, 1, 2, 3, 4].map((i) => (
          <R key={i} x={90} y={20 + i * 4} w={138} h={1} c="#5a4a42" />
        ))}
        {[
          [102, 30],
          [116, 26],
          [130, 22],
          [150, 28],
          [168, 24],
          [186, 32],
          [204, 26],
        ].map(([x, y], i) => (
          <g key={i}>
            <R x={x} y={y} w={4} h={3} c={C.contorno} />
            <R x={x + 3} y={y - 8} w={1} h={9} c={C.contorno} />
          </g>
        ))}
        {/* guitarra */}
        <Disco cx={64} cy={58} r={7} c="#c8803a" />
        <Disco cx={64} cy={50} r={5} c="#c8803a" />
        <Disco cx={64} cy={57} r={2} c="#3a2418" />
        <R x={63} y={30} w={3} h={20} c={C.maderaOscura} />
        <R x={62} y={28} w={5} h={4} c={C.maderaOscura} />
        {/* piano */}
        <R x={264} y={40} w={48} h={26} c="#2a1a18" />
        <R x={266} y={48} w={44} h={6} c="#ffffff" />
        {Array.from({ length: 8 }, (_, i) => (
          <R key={i} x={268 + i * 5 + (i > 2 ? 2 : 0)} y={48} w={2} h={4} c="#2a1a18" />
        ))}
        <R x={264} y={40} w={48} h={1} c="#5a3a34" />
      </>
    ),
  },

  arquitectura: {
    pared: ['#d8d8d0', '#d0d0c8'],
    piso: '#b8b8b0',
    decoracion: () => (
      <>
        {/* bocetos de edificios sobre papel cuadriculado */}
        <Marco x={84} y={14} w={150} h={32} fondo="#f4f6f8" marco="#5a5a62" />
        {Array.from({ length: 12 }, (_, i) => (
          <R key={i} x={88 + i * 12} y={16} w={1} h={28} c="#a8c0d8" o={0.5} />
        ))}
        <g fill="#3f6aa0">
          <rect x={100} y={26} width={1} height={16} />
          <rect x={124} y={26} width={1} height={16} />
          <rect x={100} y={26} width={25} height={1} />
          <rect x={100} y={42} width={25} height={1} />
          <rect x={102} y={22} width={21} height={1} />
          <rect x={110} y={34} width={5} height={8} />
          <rect x={150} y={20} width={1} height={22} />
          <rect x={166} y={20} width={1} height={22} />
          <rect x={150} y={20} width={17} height={1} />
          <rect x={180} y={30} width={40} height={1} />
          <rect x={180} y={30} width={1} height={12} />
          <rect x={220} y={30} width={1} height={12} />
          <rect x={200} y={24} width={1} height={6} />
        </g>
        {/* maquetas */}
        <Mueble x={52} w={30} />
        <R x={56} y={42} w={8} h={10} c="#fbfbf6" />
        <R x={66} y={38} w={6} h={14} c="#e8e0cc" />
        <R x={74} y={46} w={6} h={6} c="#fbfbf6" />
        <R x={57} y={44} w={2} h={2} c="#a8c0d8" />
        {/* planos enrollados */}
        <Mueble x={266} w={46} />
        {[0, 1, 2].map((i) => (
          <R key={i} x={278 + i * 6} y={38} w={4} h={14} c={['#8ac0f0', '#fbfbf6', '#e8e0cc'][i]} />
        ))}
      </>
    ),
  },

  psicologia: {
    pared: ['#e6dccf', '#ded2c4'],
    decoracion: () => (
      <>
        {/* paisaje tranquilo */}
        <Marco x={92} y={16} w={60} h={28} fondo="#a8d8f0" marco="#b07a4f" />
        <R x={94} y={32} w={56} h={10} c="#7fb86a" />
        <Disco cx={136} cy={24} r={4} c="#fff1a0" />
        <R x={100} y={28} w={14} h={4} c="#5a9a5a" />
        {/* afiche "respirá" */}
        <Marco x={170} y={16} w={56} h={28} fondo="#f8e8f0" marco="#b07a4f" />
        <Texto x={178} y={28} tam={6} color="#8a5aa8">
          respirá
        </Texto>
        <Texto x={178} y={38} tam={5} color="#8a5aa8">
          un paso a la vez
        </Texto>
        <Planta x={66} y={66} grande />
        {/* sillón y pañuelitos */}
        <R x={266} y={48} w={44} h={18} c="#7fb3a6" />
        <R x={266} y={44} w={44} h={6} c="#8fc3b6" />
        <R x={262} y={50} w={6} h={16} c="#6a9a8e" />
        <R x={308} y={50} w={6} h={16} c="#6a9a8e" />
        <R x={280} y={46} w={10} h={6} c="#f2a7b8" />
      </>
    ),
  },

  cocina: {
    pared: ['#f2ead8', '#ece2ce'],
    piso: '#c8b48a',
    decoracion: () => (
      <>
        {/* azulejos */}
        <R x={84} y={14} w={150} h={36} c="#ffffff" />
        {Array.from({ length: 19 }, (_, i) =>
          Array.from({ length: 5 }, (_, j) =>
            (i + j) % 2 === 0 ? <R key={`${i}-${j}`} x={84 + i * 8} y={14 + j * 7} w={8} h={7} c="#a8d8e0" o={0.7} /> : null,
          ),
        )}
        {/* utensilios colgados */}
        <R x={92} y={18} w={134} h={1} c="#5a5a62" />
        {[
          [100, '#c8ccd4', 10],
          [116, C.madera, 12],
          [132, '#c8ccd4', 9],
          [148, '#d8404a', 12],
        ].map(([x, c, h]) => (
          <R key={x as number} x={x as number} y={19} w={2} h={h as number} c={c as string} />
        ))}
        {/* estante con frascos */}
        <R x={162} y={36} w={68} h={2} c={C.maderaClara} />
        {['#f2c35b', '#c25b56', '#7fb86a', '#e8d4b0', '#8a5a3b'].map((liq, i) => (
          <Frasco key={i} x={166 + i * 12} y={36} liquido={liq} />
        ))}
        {/* horno */}
        <R x={52} y={40} w={28} h={26} c="#dcdfe6" />
        <R x={56} y={48} w={20} h={12} c="#3a3f4a" />
        <R x={58} y={50} w={16} h={8} c="#ffb43a" o={0.5} />
        {[0, 1, 2].map((i) => (
          <R key={i} x={57 + i * 8} y={43} w={3} h={3} c="#3a3f4a" />
        ))}
        {/* frutera */}
        <Mueble x={266} w={46} />
        <R x={278} y={48} w={20} h={4} c={C.maderaOscura} />
        <Disco cx={283} cy={46} r={3} c="#d8404a" />
        <Disco cx={290} cy={46} r={3} c="#f2c35b" />
        <Disco cx={287} cy={43} r={2} c="#7fb86a" />
      </>
    ),
  },
}
