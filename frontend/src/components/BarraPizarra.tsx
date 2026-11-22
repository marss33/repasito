import { CaptureUpdateAction, exportToBlob, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  ChevronDown,
  Circle,
  Diamond,
  Download,
  Eraser,
  Grid3x3,
  Hand,
  ImagePlus,
  Minus,
  MousePointer2,
  MoveRight,
  PaintBucket,
  Pencil,
  Pointer,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useIdioma } from '../i18n'

type Herramienta = 'selection' | 'hand' | 'freedraw' | 'eraser' | 'text' | 'image' | 'laser'
type Forma = 'rectangle' | 'diamond' | 'ellipse' | 'arrow' | 'line'

const FORMAS: { tipo: Forma; icono: LucideIcon }[] = [
  { tipo: 'rectangle', icono: Square },
  { tipo: 'ellipse', icono: Circle },
  { tipo: 'diamond', icono: Diamond },
  { tipo: 'arrow', icono: MoveRight },
  { tipo: 'line', icono: Minus },
]

// Dos filas de colores, como en Paint
const PALETA = [
  '#1e1e1e',
  '#868e96',
  '#e03131',
  '#f76707',
  '#f59f00',
  '#2f9e44',
  '#1971c2',
  '#6741d9',
  '#c2255c',
  '#ffffff',
  '#ced4da',
  '#ffc9c9',
  '#ffd8a8',
  '#ffec99',
  '#b2f2bb',
  '#a5d8ff',
  '#d0bfff',
  '#fcc2d7',
]

/** Lo que la barra necesita saber del estado de la pizarra (se actualiza en cada cambio). */
export interface EstadoBarra {
  herramienta: string
  trazo: string
  relleno: string
  grosor: number
  estiloRelleno: string
  contorno: string
  letra: number
  zoom: number
  cuadricula: boolean
}

export function leerEstadoBarra(a: AppState): EstadoBarra {
  return {
    herramienta: a.activeTool.type,
    trazo: a.currentItemStrokeColor,
    relleno: a.currentItemBackgroundColor,
    grosor: a.currentItemStrokeWidth,
    estiloRelleno: a.currentItemFillStyle,
    contorno: a.currentItemStrokeStyle,
    letra: a.currentItemFontSize,
    zoom: a.zoom.value,
    cuadricula: a.gridModeEnabled,
  }
}

/** Panel de herramientas arriba de la pizarra, al estilo de Paint. */
export default function BarraPizarra({ api, estado }: { api: ExcalidrawImperativeAPI; estado: EstadoBarra }) {
  const { t } = useIdioma()
  const b = t.pizarra
  const [colorActivo, setColorActivo] = useState<'trazo' | 'relleno'>('trazo')
  const [ultimaForma, setUltimaForma] = useState<Forma>('rectangle')
  const formaActual = FORMAS.find((f) => f.tipo === estado.herramienta)
  const IconoForma = (formaActual ?? FORMAS.find((f) => f.tipo === ultimaForma)!).icono

  function usar(tipo: Herramienta | Forma) {
    api.setActiveTool({ type: tipo })
  }

  /** Cambia una propiedad para lo próximo que se dibuje y, si hay algo seleccionado, también para eso. */
  function aplicar(appState: Partial<AppState>, elemento: Partial<ExcalidrawElement>) {
    const seleccion = api.getAppState().selectedElementIds
    const elementos = api.getSceneElements()
    const hay = elementos.some((e) => seleccion[e.id])
    api.updateScene({
      appState: appState as AppState,
      ...(hay && {
        elements: elementos.map((e) => (seleccion[e.id] ? newElementWith(e, elemento as Partial<typeof e>) : e)) as ExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      }),
    })
  }

  function elegirColor(color: string) {
    if (colorActivo === 'trazo') aplicar({ currentItemStrokeColor: color }, { strokeColor: color })
    else aplicar({ currentItemBackgroundColor: color }, { backgroundColor: color })
  }

  /** Deshacer, rehacer y zoom son atajos de teclado de la pizarra. */
  function atajo(key: string, shift = false) {
    const destino = document.querySelector('.pizarra .excalidraw') ?? document
    const mac = /Mac|iPhone|iPad/.test(navigator.platform)
    destino.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey: shift, ctrlKey: !mac, metaKey: mac, bubbles: true, cancelable: true }),
    )
  }

  async function exportar() {
    const blob = await exportToBlob({
      elements: api.getSceneElements(),
      appState: { ...api.getAppState(), exportBackground: true },
      files: api.getFiles(),
      mimeType: 'image/png',
    })
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(blob)
    enlace.download = `${b.archivo}.png`
    enlace.click()
    setTimeout(() => URL.revokeObjectURL(enlace.href), 2000)
  }

  function limpiar() {
    const elementos = api.getSceneElements()
    if (!elementos.length || !confirm(b.confirmarLimpiar)) return
    api.updateScene({
      elements: elementos.map((e) => newElementWith(e, { isDeleted: true })),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    })
  }

  return (
    <div className="flex items-stretch gap-1 overflow-x-auto border-b border-stone-200 bg-stone-50 px-2 py-1.5 [scrollbar-width:thin] dark:border-stone-800 dark:bg-stone-900">
      <Grupo titulo={b.seleccionar}>
        <BotonBarra
          activo={estado.herramienta === 'selection'}
          onClick={() => usar('selection')}
          titulo={b.seleccion}
          icono={MousePointer2}
        />
        <BotonBarra activo={estado.herramienta === 'hand'} onClick={() => usar('hand')} titulo={b.mano} icono={Hand} />
      </Grupo>

      <Grupo titulo={b.herramientas}>
        <BotonBarra activo={estado.herramienta === 'freedraw'} onClick={() => usar('freedraw')} titulo={b.lapiz} icono={Pencil} />
        <BotonBarra activo={estado.herramienta === 'eraser'} onClick={() => usar('eraser')} titulo={b.goma} icono={Eraser} />
        <BotonBarra activo={estado.herramienta === 'text'} onClick={() => usar('text')} titulo={b.texto} icono={Type} />
        <BotonBarra activo={estado.herramienta === 'image'} onClick={() => usar('image')} titulo={b.imagen} icono={ImagePlus} />
        <BotonBarra activo={estado.herramienta === 'laser'} onClick={() => usar('laser')} titulo={b.laser} icono={Pointer} />
      </Grupo>

      <Grupo titulo={b.formas}>
        <div className="flex">
          <BotonBarra
            activo={!!formaActual}
            onClick={() => usar(ultimaForma)}
            titulo={b.nombresFormas[formaActual?.tipo ?? ultimaForma]}
            icono={IconoForma}
          />
          <Desplegable etiqueta={b.formas} boton={<ChevronDown className="size-3.5" />} angosto>
            {(cerrar) => (
              <div className="grid grid-cols-5 gap-1 p-1">
                {FORMAS.map(({ tipo, icono: Icono }) => (
                  <button
                    key={tipo}
                    onClick={() => {
                      setUltimaForma(tipo)
                      usar(tipo)
                      cerrar()
                    }}
                    title={b.nombresFormas[tipo]}
                    aria-label={b.nombresFormas[tipo]}
                    className={`rounded-md p-2 hover:bg-indigo-50 dark:hover:bg-indigo-950 ${estado.herramienta === tipo ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200' : ''}`}
                  >
                    <Icono className="size-5" />
                  </button>
                ))}
              </div>
            )}
          </Desplegable>
        </div>
        <Desplegable etiqueta={b.contorno} boton={<LineaContorno estilo={estado.contorno} />}>
          {(cerrar) =>
            (['solid', 'dashed', 'dotted'] as const).map((estilo) => (
              <Opcion
                key={estilo}
                activa={estado.contorno === estilo}
                onClick={() => {
                  aplicar({ currentItemStrokeStyle: estilo }, { strokeStyle: estilo })
                  cerrar()
                }}
              >
                <LineaContorno estilo={estilo} /> {b.contornos[estilo]}
              </Opcion>
            ))
          }
        </Desplegable>
        <Desplegable etiqueta={b.relleno} boton={<PaintBucket className="size-4" />}>
          {(cerrar) =>
            (['hachure', 'cross-hatch', 'solid'] as const).map((estilo) => (
              <Opcion
                key={estilo}
                activa={estado.estiloRelleno === estilo}
                onClick={() => {
                  aplicar({ currentItemFillStyle: estilo }, { fillStyle: estilo })
                  cerrar()
                }}
              >
                {b.rellenos[estilo]}
              </Opcion>
            ))
          }
        </Desplegable>
      </Grupo>

      <Grupo titulo={b.tamano}>
        <Desplegable etiqueta={b.grosor} boton={<LineaGrosor grosor={estado.grosor} />}>
          {(cerrar) =>
            [1, 2, 4].map((grosor) => (
              <Opcion
                key={grosor}
                activa={estado.grosor === grosor}
                onClick={() => {
                  aplicar({ currentItemStrokeWidth: grosor }, { strokeWidth: grosor })
                  cerrar()
                }}
              >
                <LineaGrosor grosor={grosor} /> {b.grosores[grosor as 1 | 2 | 4]}
              </Opcion>
            ))
          }
        </Desplegable>
        <Desplegable etiqueta={b.letra} boton={<span className="text-xs font-semibold">Aa</span>}>
          {(cerrar) =>
            [16, 20, 28, 36].map((tam) => (
              <Opcion
                key={tam}
                activa={estado.letra === tam}
                onClick={() => {
                  aplicar({ currentItemFontSize: tam }, { fontSize: tam } as Partial<ExcalidrawElement>)
                  cerrar()
                }}
              >
                <span style={{ fontSize: Math.min(tam, 24) }}>Aa</span> {tam}
              </Opcion>
            ))
          }
        </Desplegable>
      </Grupo>

      <Grupo titulo={b.colores}>
        <div className="flex items-center gap-1.5">
          <SelectorColor nombre={b.color1} color={estado.trazo} activo={colorActivo === 'trazo'} onClick={() => setColorActivo('trazo')} />
          <SelectorColor
            nombre={b.color2}
            color={estado.relleno}
            activo={colorActivo === 'relleno'}
            onClick={() => setColorActivo('relleno')}
          />
          <div className="grid grid-flow-col grid-rows-2 gap-0.5">
            {PALETA.map((color) => (
              <button
                key={color}
                onClick={() => elegirColor(color)}
                title={color}
                aria-label={color}
                className="size-4 rounded-sm border border-stone-300 hover:scale-125 dark:border-stone-600"
                style={{ background: color }}
              />
            ))}
          </div>
          {colorActivo === 'relleno' && (
            <button
              onClick={() => elegirColor('transparent')}
              title={b.sinRelleno}
              aria-label={b.sinRelleno}
              className="relative size-5 overflow-hidden rounded-sm border border-stone-300 bg-white dark:border-stone-600"
            >
              <span className="absolute inset-0 m-auto h-px w-7 -translate-x-1 rotate-45 bg-red-500" />
            </button>
          )}
          <label
            className="relative flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-stone-200 dark:hover:bg-stone-800"
            title={b.masColores}
          >
            <span className="size-4 rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={b.masColores}
              onChange={(e) => elegirColor(e.target.value)}
            />
          </label>
        </div>
      </Grupo>

      <Grupo titulo={b.historial}>
        <BotonBarra onClick={() => atajo('z')} titulo={b.deshacer} icono={Undo2} />
        <BotonBarra onClick={() => atajo('z', true)} titulo={b.rehacer} icono={Redo2} />
      </Grupo>

      <Grupo titulo={b.vista}>
        <BotonBarra
          activo={estado.cuadricula}
          onClick={() => api.updateScene({ appState: { gridModeEnabled: !estado.cuadricula } as AppState })}
          titulo={b.cuadricula}
          icono={Grid3x3}
        />
      </Grupo>

      <Grupo titulo={b.acciones} ultimo>
        <BotonBarra onClick={exportar} titulo={b.exportar} icono={Download} />
        <BotonBarra onClick={limpiar} titulo={b.limpiar} icono={Trash2} />
      </Grupo>
    </div>
  )
}

function Grupo({ titulo, children, ultimo }: { titulo: string; children: ReactNode; ultimo?: boolean }) {
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-between gap-0.5 px-1.5 ${ultimo ? '' : 'border-r border-stone-200 dark:border-stone-700'}`}
    >
      <div className="flex flex-1 items-center gap-0.5">{children}</div>
      <span className="text-[10px] leading-none text-stone-400">{titulo}</span>
    </div>
  )
}

/** Acerca o aleja manteniendo fijo el centro de la pizarra (los atajos de teclado simulados no
 * los toma la pizarra: mira la tecla física, no la letra). */
function zoomA(api: ExcalidrawImperativeAPI, calcular: (actual: number) => number) {
  const s = api.getAppState()
  const nuevo = Math.min(30, Math.max(0.1, Math.round(calcular(s.zoom.value) * 10) / 10))
  const cx = s.width / 2
  const cy = s.height / 2
  api.updateScene({
    appState: {
      zoom: { value: nuevo as AppState['zoom']['value'] },
      scrollX: s.scrollX + cx / nuevo - cx / s.zoom.value,
      scrollY: s.scrollY + cy / nuevo - cy / s.zoom.value,
    } as AppState,
  })
}

/** Zoom flotante en la esquina de la pizarra: siempre a mano, también en el celular
 * (en la barra quedaba al final y había que deslizarla para encontrarlo). */
export function ZoomPizarra({ api, zoom }: { api: ExcalidrawImperativeAPI; zoom: number }) {
  const { t } = useIdioma()
  const b = t.pizarra
  const boton =
    'grid size-9 place-items-center rounded-lg text-stone-700 hover:bg-stone-200 active:bg-stone-300 dark:text-stone-200 dark:hover:bg-stone-800'
  return (
    <div className="absolute right-3 bottom-3 z-10 flex items-center gap-0.5 rounded-xl border border-stone-200 bg-white/95 p-1 shadow-md dark:border-stone-700 dark:bg-stone-900/95">
      <button onClick={() => zoomA(api, (z) => z - 0.1)} className={boton} title={b.alejar} aria-label={b.alejar}>
        <ZoomOut className="size-4" />
      </button>
      <button
        onClick={() => zoomA(api, () => 1)}
        className="h-9 min-w-12 rounded-lg px-1 text-xs font-medium tabular-nums hover:bg-stone-200 dark:hover:bg-stone-800"
        title={b.zoomNormal}
        aria-label={b.zoomNormal}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button onClick={() => zoomA(api, (z) => z + 0.1)} className={boton} title={b.acercar} aria-label={b.acercar}>
        <ZoomIn className="size-4" />
      </button>
    </div>
  )
}

function BotonBarra({
  activo,
  onClick,
  titulo,
  icono: Icono,
}: {
  activo?: boolean
  onClick: () => void
  titulo: string
  icono: LucideIcon
}) {
  return (
    <button
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      aria-pressed={activo}
      className={`rounded-md p-1.5 transition-colors ${
        activo
          ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300 dark:bg-indigo-900/70 dark:text-indigo-200 dark:ring-indigo-700'
          : 'text-stone-700 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800'
      }`}
    >
      <Icono className="size-[18px]" />
    </button>
  )
}

function SelectorColor({ nombre, color, activo, onClick }: { nombre: string; color: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={nombre}
      aria-label={nombre}
      aria-pressed={activo}
      className={`flex flex-col items-center gap-0.5 rounded-md px-1 py-0.5 ${activo ? 'bg-indigo-100 ring-1 ring-indigo-300 dark:bg-indigo-900/70 dark:ring-indigo-700' : 'hover:bg-stone-200 dark:hover:bg-stone-800'}`}
    >
      <span
        className="size-6 rounded-md border border-stone-300 dark:border-stone-600"
        style={{
          background: color === 'transparent' ? 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 50% / 8px 8px' : color,
        }}
      />
      <span className="text-[9px] leading-none text-stone-500">{nombre}</span>
    </button>
  )
}

function LineaContorno({ estilo }: { estilo: string }) {
  return (
    <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden>
      <line
        x1="1"
        y1="5"
        x2="21"
        y2="5"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={estilo === 'dashed' ? '5 3' : estilo === 'dotted' ? '1.5 2.5' : undefined}
        strokeLinecap="round"
      />
    </svg>
  )
}

function LineaGrosor({ grosor }: { grosor: number }) {
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden>
      <line x1="2" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth={grosor * 1.4} strokeLinecap="round" />
    </svg>
  )
}

function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm whitespace-nowrap ${activa ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}
    >
      {children}
    </button>
  )
}

/** Menú desplegable. Se posiciona "fixed" para que no lo recorte la barra cuando tiene scroll. */
function Desplegable({
  etiqueta,
  boton,
  children,
  angosto,
}: {
  etiqueta: string
  boton: ReactNode
  children: (cerrar: () => void) => ReactNode
  angosto?: boolean
}) {
  const [posicion, setPosicion] = useState<{ top: number; left: number } | null>(null)
  const disparador = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!posicion) return
    const cerrarSiAfuera = (e: Event) => {
      if (!menu.current?.contains(e.target as Node) && !disparador.current?.contains(e.target as Node)) setPosicion(null)
    }
    const conTecla = (e: KeyboardEvent) => e.key === 'Escape' && setPosicion(null)
    document.addEventListener('pointerdown', cerrarSiAfuera)
    document.addEventListener('keydown', conTecla)
    window.addEventListener('resize', () => setPosicion(null), { once: true })
    return () => {
      document.removeEventListener('pointerdown', cerrarSiAfuera)
      document.removeEventListener('keydown', conTecla)
    }
  }, [posicion])

  return (
    <>
      <button
        ref={disparador}
        onClick={() => {
          if (posicion) return setPosicion(null)
          const r = disparador.current!.getBoundingClientRect()
          setPosicion({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 220) })
        }}
        title={etiqueta}
        aria-label={etiqueta}
        aria-expanded={!!posicion}
        className={`flex items-center gap-0.5 rounded-md py-1.5 text-stone-700 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800 ${angosto ? 'px-0.5' : 'px-1.5'} ${posicion ? 'bg-stone-200 dark:bg-stone-800' : ''}`}
      >
        {boton}
        {!angosto && <ChevronDown className="size-3" />}
      </button>
      {posicion && (
        <div
          ref={menu}
          role="menu"
          className="aparecer fixed z-50 min-w-36 rounded-lg border border-stone-200 bg-white p-1 shadow-xl dark:border-stone-700 dark:bg-stone-900"
          style={posicion}
        >
          {children(() => setPosicion(null))}
        </div>
      )}
    </>
  )
}
