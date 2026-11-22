import { Check, ChevronDown, CloudSun, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useIdioma } from '../i18n'
import { SONIDOS, type RadioLofi, type Sonido } from '../lofi'
import { CLIMAS, ESCENAS_DE_GRUPO, type Ambiente } from './escena/Escena'

/* El ambiente de la sala es de cada uno: el fondo, el clima de la ventana y el ruido de fondo.
 * Se guarda en este navegador y no cambia lo que ven los demás. */

const CLAVE_SONIDOS = 'repaso:sonidos'

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    // sin almacenamiento local: se pierde al recargar
  }
}

/** Un valor elegido de una lista que se recuerda entre visitas. */
export function usePreferencia<T extends string>(clave: string, opciones: readonly T[], porDefecto: T) {
  const [valor, setValor] = useState<T>(() => {
    const guardado = leer(clave)
    return guardado && (opciones as readonly string[]).includes(guardado) ? (guardado as T) : porDefecto
  })
  useEffect(() => guardar(clave, valor), [clave, valor])
  return [valor, setValor] as const
}

export function useFondo() {
  return usePreferencia('repasito:fondo', ESCENAS_DE_GRUPO, 'biblioteca')
}

export function useClima() {
  return usePreferencia<Ambiente>('repasito:clima', CLIMAS, 'medianoche')
}

const ICONOS_CLIMA: Record<Ambiente, string> = {
  medianoche: '🌙',
  amanecer: '🌅',
  dia: '☀️',
  cafe: '🌇',
  lluvia: '🌧️',
  nieve: '❄️',
}

/** Una parte del panel que se despliega al tocar su título; cerrada, muestra lo que está elegido. */
function Seccion({
  titulo,
  elegido,
  abierta,
  onAlternar,
  children,
}: {
  titulo: string
  elegido: string
  abierta: boolean
  onAlternar: () => void
  children: ReactNode
}) {
  return (
    <div className="mt-2 border-t border-stone-100 pt-2 dark:border-stone-800">
      <button onClick={onAlternar} aria-expanded={abierta} className="flex w-full items-center gap-2 text-left">
        <span className="text-xs font-medium text-stone-500 dark:text-stone-400">{titulo}</span>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-stone-700 dark:text-stone-200">{elegido}</span>
        <ChevronDown className={`size-4 shrink-0 text-stone-400 transition-transform ${abierta ? 'rotate-180' : ''}`} />
      </button>
      {abierta && <div className="aparecer mt-2">{children}</div>}
    </div>
  )
}

/** El panel para elegir fondo, clima y ruido ambiental. Se abre tocando una ventana de la sala. */
export default function PanelAmbiente({
  radio,
  fondo,
  onFondo,
  clima,
  onClima,
  onCerrar,
  compacto = true,
}: {
  radio: RadioLofi
  fondo?: string // sin fondo: en la sala personal hay un solo lugar
  onFondo?: (fondo: (typeof ESCENAS_DE_GRUPO)[number]) => void
  clima: Ambiente
  onClima: (clima: Ambiente) => void
  onCerrar?: () => void
  compacto?: boolean
}) {
  const { t } = useIdioma()
  const s = t.sala
  const [sonidos, setSonidos] = useState<Set<Sonido>>(() => {
    try {
      const guardados = JSON.parse(leer(CLAVE_SONIDOS) ?? '["vinilo"]') as Sonido[]
      return new Set(guardados.filter((x) => SONIDOS.includes(x)))
    } catch {
      return new Set<Sonido>(['vinilo'])
    }
  })

  useEffect(() => {
    radio.sonidosDeFondo(sonidos)
    guardar(CLAVE_SONIDOS, JSON.stringify([...sonidos]))
  }, [radio, sonidos])

  async function alternar(sonido: Sonido) {
    const nuevos = new Set(sonidos)
    if (nuevos.has(sonido)) nuevos.delete(sonido)
    else nuevos.add(sonido)
    setSonidos(nuevos)
    if (nuevos.size) await radio.activar() // el navegador pide un toque antes de dejar sonar
  }

  const chip = (activo: boolean) =>
    `flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
      activo
        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
        : 'border-stone-300 text-stone-600 hover:border-indigo-400 dark:border-stone-700 dark:text-stone-300'
    }`
  // Las secciones están cerradas y se abren (de a una) tocando su título
  const [abierta, setAbierta] = useState<'fondo' | 'clima' | 'ruido' | null>(null)
  const alternarSeccion = (seccion: 'fondo' | 'clima' | 'ruido') => setAbierta((a) => (a === seccion ? null : seccion))
  const nombreDeFondo = (e: string) => t.rincon.escenas[e as keyof typeof t.rincon.escenas] ?? e

  return (
    <section
      className={`rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 ${compacto ? 'p-3 shadow-xl' : 'p-5'}`}
    >
      <div className="flex items-center gap-2">
        <CloudSun className="size-4 text-indigo-600 dark:text-indigo-400" />
        <h2 className="flex-1 text-sm font-semibold">
          {s.ambiente} <span className="font-normal text-stone-400">· {s.soloParaVos}</span>
        </h2>
        {onCerrar && (
          <button
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            aria-label={s.cerrar}
            title={s.cerrar}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {fondo && onFondo && (
        <Seccion titulo={s.fondo} elegido={nombreDeFondo(fondo)} abierta={abierta === 'fondo'} onAlternar={() => alternarSeccion('fondo')}>
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {ESCENAS_DE_GRUPO.map((e) => (
              <button key={e} onClick={() => onFondo(e)} aria-pressed={fondo === e} className={chip(fondo === e)}>
                {nombreDeFondo(e)}
              </button>
            ))}
          </div>
        </Seccion>
      )}

      <Seccion
        titulo={s.clima}
        elegido={`${ICONOS_CLIMA[clima]} ${s.climas[clima]}`}
        abierta={abierta === 'clima'}
        onAlternar={() => alternarSeccion('clima')}
      >
        <div className="flex flex-wrap gap-1.5">
          {CLIMAS.map((c) => (
            <button key={c} onClick={() => onClima(c)} aria-pressed={clima === c} className={chip(clima === c)}>
              <span aria-hidden>{ICONOS_CLIMA[c]}</span> {s.climas[c]}
            </button>
          ))}
        </div>
      </Seccion>

      <Seccion
        titulo={s.ruidoAmbiental}
        elegido={sonidos.size ? [...sonidos].map((x) => s.sonidos[x]).join(', ') : s.ninguno}
        abierta={abierta === 'ruido'}
        onAlternar={() => alternarSeccion('ruido')}
      >
        <div className="flex flex-wrap gap-1.5">
          {SONIDOS.map((x) => (
            <button key={x} onClick={() => alternar(x)} aria-pressed={sonidos.has(x)} className={chip(sonidos.has(x))}>
              {sonidos.has(x) && <Check className="size-3" />}
              {s.sonidos[x]}
            </button>
          ))}
        </div>
      </Seccion>
    </section>
  )
}
