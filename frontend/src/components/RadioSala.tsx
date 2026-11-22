import { Headphones, Pause, Play, Volume2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useIdioma } from '../i18n'
import { ESTACIONES, type Estacion, type RadioLofi } from '../lofi'
import { Boton } from './ui'

const CLAVE_VOLUMEN = 'repaso:volumen'
const CLAVE_ESTACION = 'repasito:estilo-lofi'

function leer<T>(clave: string, porDefecto: T, convertir: (texto: string) => T): T {
  try {
    const valor = localStorage.getItem(clave)
    return valor === null ? porDefecto : convertir(valor)
  } catch {
    return porDefecto
  }
}

function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    // sin almacenamiento local
  }
}

/** La radio lofi: estilo, play/pausa y volumen. Se recuerda el estilo y el volumen en el dispositivo. */
export function useMiRadio(radio: RadioLofi) {
  const [estacion, setEstacion] = useState<Estacion>(() =>
    leer(CLAVE_ESTACION, 'medianoche' as Estacion, (v) => (ESTACIONES.includes(v as Estacion) ? (v as Estacion) : 'medianoche')),
  )
  const [sonando, setSonando] = useState(false)
  const [desde, setDesde] = useState<number | null>(null)
  const [volumen, setVolumen] = useState(() => leer(CLAVE_VOLUMEN, 0.7, (v) => (Number.isFinite(Number(v)) ? Number(v) : 0.7)))

  useEffect(() => {
    radio.sincronizar({ estacion, sonando, desde }, 0)
  }, [radio, estacion, sonando, desde])

  useEffect(() => {
    radio.volumen(volumen)
    guardar(CLAVE_VOLUMEN, String(volumen))
  }, [radio, volumen])

  useEffect(() => guardar(CLAVE_ESTACION, estacion), [estacion])

  /** Hay que llamarlo desde un toque: los navegadores no dejan sonar audio sin que el usuario toque algo. */
  async function tocar() {
    await radio.activar()
    setDesde(Date.now() / 1000)
    setSonando(true)
  }

  async function elegir(nueva: Estacion) {
    setEstacion(nueva)
    await tocar()
  }

  return { estacion, sonando, volumen, setVolumen, tocar, pausar: () => setSonando(false), elegir }
}

export type MiRadio = ReturnType<typeof useMiRadio>

/** Radio lofi generada en vivo: distintos estilos para elegir, o ninguno. */
export default function RadioSala({
  miRadio,
  onCerrar,
  compacto = false,
}: {
  miRadio: MiRadio
  onCerrar?: () => void // en la sala grupal se abre tocando la radio de la escena
  compacto?: boolean // desplegable chiquito del encabezado
}) {
  const { t } = useIdioma()
  const { estacion, sonando, volumen, setVolumen, tocar, pausar, elegir } = miRadio
  const chip = compacto ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'

  return (
    <section
      className={`rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 ${compacto ? 'p-3 shadow-xl' : 'p-5'}`}
    >
      <div className="flex items-center gap-2">
        <Headphones className="size-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <h2 className={`min-w-0 flex-1 truncate font-semibold ${compacto ? 'text-sm' : ''}`}>{t.sala.radio}</h2>
        <Boton
          className="px-3"
          onClick={() => (sonando ? pausar() : tocar())}
          aria-label={sonando ? t.sala.pausarMusica : t.sala.reproducir}
        >
          {sonando ? <Pause className="size-4" /> : <Play className="size-4" />}
          {!compacto && <span className="hidden sm:inline">{sonando ? t.sala.pausarMusica : t.sala.reproducir}</span>}
        </Boton>
        {onCerrar && (
          <Boton variante="fantasma" className="px-2" onClick={onCerrar} aria-label={t.sala.cerrar} title={t.sala.cerrar}>
            <X className="size-4" />
          </Boton>
        )}
      </div>

      <p className={`text-xs font-medium text-stone-500 dark:text-stone-400 ${compacto ? 'mt-3' : 'mt-4'}`}>{t.sala.estiloDeMusica}</p>
      <div className={`flex flex-wrap ${compacto ? 'mt-1.5 gap-1.5' : 'mt-2 gap-2'}`}>
        {ESTACIONES.map((e) => (
          <button
            key={e}
            onClick={() => elegir(e)}
            aria-pressed={estacion === e}
            className={`rounded-full border transition-colors ${chip} ${
              estacion === e
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                : 'border-stone-300 hover:border-indigo-400 dark:border-stone-700'
            }`}
          >
            {t.sala.estaciones[e]}
          </button>
        ))}
      </div>

      <label className={`flex items-center gap-3 text-sm text-stone-500 dark:text-stone-400 ${compacto ? 'mt-3' : 'mt-5'}`}>
        <Volume2 className="size-4 shrink-0" aria-hidden />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volumen}
          onChange={(e) => setVolumen(Number(e.target.value))}
          className="w-full accent-indigo-600"
          aria-label={t.sala.volumen}
        />
      </label>
      {!compacto && <p className="mt-2 text-xs text-stone-400">{t.sala.radioAyuda}</p>}
    </section>
  )
}
