import { Camera, Check, Coins, Eye, Loader2, Lock, PawPrint, Pencil, Undo2, X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { api, mensajeDeError, urlApi } from '../api'
import { useIdioma } from '../i18n'
import type { Apariencia, Articulo, Rincon as DatosRincon, TipoArticulo, Usuario } from '../types'
import { AvatarPixelSvg } from '../pixel/AvatarPixel'
import { COLORES_POR_DEFECTO } from '../pixel/componerAvatar'
import { MascotaPixelSuelta } from '../pixel/MascotaPixel'
import { EscenaSola, siguienteClima, VistaDecoracion, type Ambiente } from './escena/Escena'
import { prepararFoto } from './TuCuenta'
import { Aviso, Boton, campo, Esqueleto, Modal } from './ui'
import Logros from './Logros'

// Vestidor: cada categoría es una pestaña del panel que se abre al lado del personaje
type Categoria = 'colores' | 'rostro' | 'pelo' | 'arriba' | 'abajo' | 'trajes' | 'accesorios'
const CATEGORIAS: Categoria[] = ['colores', 'rostro', 'pelo', 'arriba', 'abajo', 'trajes', 'accesorios']
const TIPOS_DE_CATEGORIA: Partial<Record<Categoria, TipoArticulo[]>> = {
  pelo: ['peinado'],
  arriba: ['ropa'],
  abajo: ['abajo', 'calzado'],
  trajes: ['traje'],
  accesorios: ['sombrero', 'lentes', 'adorno'],
}
// Mascota y escritorio van aparte, con la sala a la vista
type PestanaMascota = 'mascota' | 'accesorios' | 'decoracion'
const PESTANAS_MASCOTA: PestanaMascota[] = ['mascota', 'accesorios', 'decoracion']
const TIPOS_MASCOTA: Record<PestanaMascota, TipoArticulo[]> = {
  mascota: ['mascota'],
  accesorios: ['cabeza', 'cara', 'cuello'],
  decoracion: ['decoracion'],
}
// Lo que siempre tiene que haber (no se puede "quitar")
const OBLIGATORIOS: TipoArticulo[] = ['peinado', 'ropa', 'abajo', 'calzado', 'mascota']
// Si se cambia una de estas prendas a mano, el traje deja de estar puesto
const PARTES_DE_TRAJE: TipoArticulo[] = ['ropa', 'abajo', 'calzado', 'adorno']
const FORMAS = ['redondos', 'almendrados', 'cansados', 'cuadrados'] as const
const SILUETAS = ['a', 'b', 'c'] as const

type ColorAvatar = 'piel' | 'pelo' | 'ojos' | 'color_ropa' | 'color_abajo' | 'color_calzado' | 'color_accesorio'
const ROPA = ['#7fb3a6', '#c25b56', '#e0a43a', '#4f8a5b', '#3f6aa0', '#8a5aa8', '#d97a9a', '#f6e7c8', '#5a4a42', '#2f3440']
const SUGERIDOS: Record<ColorAvatar, string[]> = {
  piel: ['#ffe0d0', '#f9dcc4', '#f1c8a8', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'],
  pelo: ['#2b1d1a', '#6b4226', '#a0522d', '#e6c07b', '#f5f5f4', '#c0392b', '#f5a3c7', '#7d5ba6', '#2e86c1', '#27ae60'],
  ojos: ['#5b3a29', '#2e86c1', '#27ae60', '#8e44ad', '#c0392b', '#f1c40f', '#34495e', '#e84393'],
  color_ropa: ROPA,
  color_abajo: ['#3b4a6b', '#2f3440', '#5a4a42', '#8a6a4a', '#c25b56', '#4f8a5b', '#f6e7c8', '#8a5aa8'],
  color_calzado: ['#5a3825', '#2f3440', '#f6e7c8', '#c25b56', '#3f6aa0', '#d97a9a'],
  color_accesorio: ['#e88aa8', '#c25b56', '#e0a43a', '#4f8a5b', '#3f6aa0', '#f6e7c8', '#2f3440'],
}
const colorDe = (a: Apariencia, clave: ColorAvatar) => (a[clave] as string | undefined) || COLORES_POR_DEFECTO[clave]

const NOMBRES: Record<string, string> = {
  'gato-naranja': 'Michi',
  'perro-caramelo': 'Toby',
  conejo: 'Copito',
  raton: 'Queso',
  'rata-blanca': 'Nieve',
  'perro-negro': 'Pancho',
  doberman: 'Rocco',
  chihuahua: 'Chispa',
  salchicha: 'Salchi',
  caniche: 'Algodón',
  mono: 'Banana',
  murcielago: 'Bati',
  suricata: 'Sol',
  lagarto: 'Gecko',
  'dragon-bebe': 'Draco',
  'unicornio-bebe': 'Arcoíris',
  'caballo-bebe': 'Trueno',
  tortuga: 'Tuga',
  'oso-bebe': 'Osito',
  mapache: 'Bandido',
  empanada: 'Empi',
  'mate-termo': 'Matecito',
  'mascota-foto': 'Mi mascota',
}

function nombrePorDefecto(mascota: string) {
  return NOMBRES[mascota] ?? (mascota.startsWith('perro') ? 'Toby' : 'Michi')
}

/** La foto para la mascota personalizada (una vez comprada). */
function FotoDeMascota({ usuario, version, onCambio }: { usuario: Usuario; version: number; onCambio: (d: DatosRincon) => void }) {
  const { t } = useIdioma()
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setSubiendo(true)
    setError(null)
    try {
      onCambio(await api.subirFotoMascota(await prepararFoto(archivo)))
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setSubiendo(false)
    }
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/60 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-white dark:bg-stone-800">
        {version ? (
          <img src={urlApi(`/rincon/foto-mascota/${usuario.id}?v=${version}`)} alt="" className="size-full object-cover" />
        ) : (
          <Camera className="size-5 text-stone-400" />
        )}
      </span>
      <p className="min-w-0 flex-1 text-sm text-stone-600 dark:text-stone-300">{t.rincon.fotoMascotaAyuda}</p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">
        {subiendo ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        {version ? t.rincon.cambiarFotoMascota : t.rincon.subirFotoMascota}
        <input type="file" accept="image/*" className="sr-only" onChange={elegir} disabled={subiendo} />
      </label>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  )
}

/** Mi rincón: tu personaje, tu mascota y tu lugar de estudio. Para cambiarlos se toca "Editar avatar". */
export default function Rincon({
  usuario,
  onUsuario,
  panelFijo,
}: {
  usuario: Usuario
  onUsuario: (u: Usuario) => void
  panelFijo?: 'vestidor' | 'mascota' // dentro de Discord: el panel lo elige el menú de arriba y no se cierra
}) {
  const { t } = useIdioma()
  const r = t.rincon
  const [datos, setDatos] = useState<DatosRincon | null>(null)
  const [apariencia, setApariencia] = useState<Apariencia | null>(null)
  // El panel que está abierto al lado: el vestidor (personaje) o el de mascota y escritorio
  const [panel, setPanel] = useState<'vestidor' | 'mascota' | null>(panelFijo ?? null)
  useEffect(() => {
    if (panelFijo) {
      setPanel(panelFijo)
      setProbando(null)
    }
  }, [panelFijo])
  const [categoria, setCategoria] = useState<Categoria>('colores')
  const [pestanaMascota, setPestanaMascota] = useState<PestanaMascota>('mascota')
  const [probando, setProbando] = useState<Articulo | null>(null)
  // El clima de la ventana se cambia tocándola (acá es solo para mirar; no se guarda)
  const [clima, setClima] = useState<Ambiente>('medianoche')
  const [verReglas, setVerReglas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<'no' | 'guardando' | 'listo'>('no')
  const [comprando, setComprando] = useState<string | null>(null)
  const temporizador = useRef<number | undefined>(undefined)
  const usuarioRef = useRef(usuario)
  usuarioRef.current = usuario

  useEffect(() => {
    api
      .rincon()
      .then((d) => {
        setDatos(d)
        setApariencia(d.apariencia)
      })
      .catch((e) => setError(mensajeDeError(e)))
  }, [])

  function actualizar(d: DatosRincon) {
    setDatos(d)
    onUsuario({ ...usuarioRef.current, monedas: d.monedas, foto: d.foto })
  }

  /** Cambia la apariencia ya (se ve al instante) y la guarda un ratito después. */
  function cambiar(cambios: Partial<Apariencia>) {
    if (!apariencia) return
    const nueva = { ...apariencia, ...cambios }
    setApariencia(nueva)
    setGuardando('guardando')
    window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(async () => {
      try {
        actualizar(await api.cambiarApariencia(nueva))
        setGuardando('listo')
      } catch (e) {
        setError(mensajeDeError(e))
        setGuardando('no')
      }
    }, 600)
  }

  // Lo que puede usar: lo gratis, lo comprado, lo que trae un traje suyo y lo que ya tenía puesto
  const tengo = (a: Articulo) =>
    a.precio === 0 ||
    !!datos?.habilitados?.includes(a.id) ||
    !!datos?.comprados.includes(a.id) ||
    datos?.apariencia[a.tipo as keyof Apariencia] === a.id

  function enUso(a: Articulo) {
    if (!apariencia) return false
    if (a.tipo === 'decoracion') return apariencia.decoracion.includes(a.id)
    return apariencia[a.tipo as keyof Apariencia] === a.id
  }

  function usar(a: Articulo) {
    setProbando(null)
    if (a.tipo === 'decoracion') {
      const deco = apariencia!.decoracion
      cambiar({ decoracion: deco.includes(a.id) ? deco.filter((d) => d !== a.id) : [...deco, a.id] })
    } else if (a.tipo === 'traje') {
      const traje = datos?.trajes[a.id]
      if (enUso(a) || !traje) cambiar({ traje: null })
      else cambiar({ ...traje.piezas, ...traje.colores, traje: a.id })
    } else if (a.tipo === 'mascota') {
      // Si todavía tiene el nombre que venía por defecto, la mascota nueva trae el suyo
      const nombreTipico = Object.values(NOMBRES).includes(apariencia!.nombre) || ['Michi', 'Toby'].includes(apariencia!.nombre)
      cambiar({ mascota: a.id, nombre: nombreTipico ? nombrePorDefecto(a.id) : apariencia!.nombre })
    } else {
      const sacarTraje = PARTES_DE_TRAJE.includes(a.tipo) ? { traje: null } : {}
      if (enUso(a) && !OBLIGATORIOS.includes(a.tipo)) cambiar({ [a.tipo]: null, ...sacarTraje })
      else cambiar({ [a.tipo]: a.id, ...sacarTraje })
    }
  }

  async function comprar(a: Articulo) {
    setComprando(a.id)
    setError(null)
    try {
      actualizar(await api.comprar(a.id))
      setAviso(r.comprado(r.articulos[a.id] ?? a.id))
      window.setTimeout(() => setAviso(null), 4000)
      setProbando(null)
      usar(a) // recién comprado: se lo pone
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setComprando(null)
    }
  }

  function abrir(p: 'vestidor' | 'mascota' | null) {
    setPanel(p)
    setProbando(null)
  }

  // Lo que se ve: lo puesto, o lo que se está probando
  const vista = useMemo(() => {
    if (!apariencia) return null
    const base = { ...apariencia, foto_mascota: datos?.foto_mascota ?? 0 }
    if (!probando) return base
    if (probando.tipo === 'decoracion') return { ...base, decoracion: [...new Set([...base.decoracion, probando.id])] }
    if (probando.tipo === 'traje') {
      const traje = datos?.trajes[probando.id]
      return traje ? { ...base, ...traje.piezas, ...traje.colores, traje: probando.id } : base
    }
    return { ...base, [probando.tipo]: probando.id }
  }, [apariencia, probando, datos?.foto_mascota, datos?.trajes])

  if (error && !datos) return <Aviso>{error}</Aviso>
  if (!datos || !apariencia || !vista) return <Esqueleto filas={4} alto="h-24" />

  const fotoMascota = datos.foto_mascota ? urlApi(`/rincon/foto-mascota/${usuario.id}?v=${datos.foto_mascota}`) : undefined
  const tarjeta = 'rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900'
  // Lo que ya tiene va primero; lo que se compra, después (sort es estable)
  const deTipo = (tipo: TipoArticulo) => datos.catalogo.filter((a) => a.tipo === tipo).sort((x, y) => Number(tengo(y)) - Number(tengo(x)))

  const bannerProbando = probando && (
    <div className="absolute inset-x-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-black/60 px-3 py-2 text-sm text-white backdrop-blur">
      <Eye className="size-4" /> <span className="flex-1">{r.probando(r.articulos[probando.id] ?? probando.id)}</span>
      {!tengo(probando) && (
        <Boton
          className="px-3 py-1"
          disabled={datos.monedas < probando.precio}
          cargando={comprando === probando.id}
          onClick={() => comprar(probando)}
        >
          {datos.monedas < probando.precio ? r.teFaltan(probando.precio - datos.monedas) : `${r.comprar} · ${probando.precio} 🪙`}
        </Boton>
      )}
      <Boton variante="secundario" className="px-3 py-1" onClick={() => setProbando(null)}>
        <Undo2 className="size-4" /> {r.dejarDeProbar}
      </Boton>
    </div>
  )

  const estadoGuardado =
    guardando === 'guardando' ? <Loader2 className="inline size-3.5 animate-spin" /> : guardando === 'listo' ? `✓ ${r.guardado}` : ''

  const botonMonedas = (
    <button
      onClick={() => setVerReglas(true)}
      className="flex items-center gap-2 rounded-full bg-amber-100 px-3.5 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
      title={r.comoGanar}
    >
      <Coins className="size-4 shrink-0" /> <span className="sm:hidden">{datos.monedas}</span>
      <span className="hidden sm:inline">{r.monedas(datos.monedas)}</span>
    </button>
  )

  /** Las prendas o cosas de un tipo, como tarjetitas para probar, comprar o usar. */
  function grilla(tipo: TipoArticulo, titulo?: string) {
    const articulos = deTipo(tipo)
    if (!articulos.length) return null
    return (
      <div className="mt-4">
        {titulo && <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">{titulo}</p>}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 xl:grid-cols-4">
          {articulos.map((a) => {
            const mio = tengo(a)
            const puesto = enUso(a)
            const fijo = OBLIGATORIOS.includes(a.tipo)
            return (
              <li
                key={a.id}
                className={`flex flex-col overflow-hidden rounded-xl border transition-colors ${
                  puesto
                    ? 'border-indigo-400 ring-2 ring-indigo-200 dark:ring-indigo-900'
                    : probando?.id === a.id
                      ? 'border-amber-400'
                      : 'border-stone-200 dark:border-stone-700'
                }`}
              >
                <button
                  onClick={() => (mio ? usar(a) : setProbando(probando?.id === a.id ? null : a))}
                  className="relative aspect-square bg-gradient-to-b from-amber-50 to-orange-100 dark:from-stone-800 dark:to-stone-700"
                  aria-label={r.articulos[a.id] ?? a.id}
                >
                  <Miniatura articulo={a} apariencia={apariencia!} trajes={datos!.trajes} fotoMascota={fotoMascota} />
                  {!mio && (
                    <span className="absolute top-1.5 right-1.5 rounded-full bg-black/50 p-1 text-white">
                      <Lock className="size-3" />
                    </span>
                  )}
                </button>
                <div className="flex flex-1 flex-col gap-1.5 p-2">
                  <p className="text-xs leading-tight font-medium">{r.articulos[a.id] ?? a.id}</p>
                  {mio ? (
                    <Boton variante={puesto ? 'primario' : 'secundario'} className="mt-auto py-1 text-xs" onClick={() => usar(a)}>
                      {puesto && <Check className="size-3.5" />}
                      {puesto ? (fijo ? r.enUso : r.quitar) : r.usar}
                    </Boton>
                  ) : (
                    <Boton
                      className="mt-auto py-1 text-xs"
                      disabled={datos!.monedas < a.precio}
                      cargando={comprando === a.id}
                      onClick={() => comprar(a)}
                      title={datos!.monedas < a.precio ? r.teFaltan(a.precio - datos!.monedas) : undefined}
                    >
                      {a.precio} 🪙
                    </Boton>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  /** Encabezado de un panel lateral: título, monedas y la X para cerrarlo. */
  const cabeceraDePanel = (titulo: string) => (
    <div className="flex items-center gap-2">
      <h2 className="min-w-0 flex-1 truncate font-semibold">{titulo}</h2>
      {botonMonedas}
      {!panelFijo && (
        <button
          onClick={() => abrir(null)}
          className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          aria-label={r.cerrar}
          title={r.cerrar}
        >
          <X className="size-5" />
        </button>
      )}
    </div>
  )

  const pestanas = <T extends string>(valores: T[], actual: T, elegir: (v: T) => void, nombres: Record<T, string>) => (
    <div className="mt-3 flex gap-1 overflow-x-auto border-b border-stone-200 [scrollbar-width:none] dark:border-stone-800" role="tablist">
      {valores.map((v) => (
        <button
          key={v}
          role="tab"
          aria-selected={actual === v}
          onClick={() => elegir(v)}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            actual === v
              ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          {nombres[v]}
        </button>
      ))}
    </div>
  )

  const escena = (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-[#2c2748] dark:border-stone-800">
      <div className="relative aspect-[16/10] max-h-[460px] w-full">
        <EscenaSola
          persona={{ id: usuario.id, nombre: usuario.nombre, apariencia: vista }}
          ambiente={clima}
          onClima={() => setClima(siguienteClima(clima))}
          etiquetaClima={t.sala.cambiarClima}
        />
        {panel === 'mascota' && bannerProbando}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-stone-950/60 px-4 py-2.5 text-sm text-stone-300">
        <span className="text-xs text-stone-400">{t.sala.pistaClima}</span>
        <span className="ml-auto text-xs text-stone-400">{estadoGuardado}</span>
        {panel === null && (
          <>
            <Boton variante="secundario" className="py-1.5" onClick={() => abrir('mascota')}>
              <PawPrint className="size-4" /> {r.mascotaYEscritorio}
            </Boton>
            <Boton className="py-1.5" onClick={() => abrir('vestidor')}>
              <Pencil className="size-4" /> {r.editarAvatar}
            </Boton>
          </>
        )}
      </div>
    </section>
  )

  return (
    <div className="space-y-5">
      {error && <Aviso onCerrar={() => setError(null)}>{error}</Aviso>}
      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}

      {panel === null && escena}

      {panel === 'vestidor' && (
        <div className="aparecer grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-3 sm:gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
          {/* El personaje, de pie y grande, siempre a la vista mientras se lo viste */}
          <section className="sticky top-2 overflow-hidden rounded-2xl border border-stone-200 lg:top-4 dark:border-stone-800">
            <div className="relative bg-gradient-to-b from-[#f6e7c8] to-[#e8c9a0] dark:from-[#3a2c22] dark:to-[#2a1f18]">
              {bannerProbando}
              <AvatarRecortado a={vista} vista="10 8 44 56" className="mx-auto block aspect-[44/56] max-h-[min(480px,75dvh)] w-full" />
              <div className="absolute inset-x-0 bottom-0 h-[11%] bg-[#b07a4f]/40" />
            </div>
            <div className="flex items-center gap-2 border-t border-stone-200 bg-white px-4 py-2.5 text-sm dark:border-stone-800 dark:bg-stone-900">
              <span className="flex-1 truncate font-medium">{usuario.nombre}</span>
              <span className="text-xs text-stone-400">{estadoGuardado}</span>
            </div>
          </section>

          <section className={tarjeta}>
            {cabeceraDePanel(r.vestidor)}
            {pestanas(
              CATEGORIAS,
              categoria,
              (c) => {
                setCategoria(c)
                setProbando(null)
              },
              r.secciones,
            )}

            {categoria === 'colores' && (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">{r.cuerpo}</p>
                  <div className="grid max-w-sm grid-cols-3 gap-2">
                    {SILUETAS.map((s) => (
                      <BotonDeVista
                        key={s}
                        activo={(apariencia.silueta ?? 'a') === s}
                        onClick={() => cambiar({ silueta: s })}
                        nombre={r.siluetas[s]}
                        a={{ ...apariencia, silueta: s }}
                        vista="12 8 40 56"
                      />
                    ))}
                  </div>
                </div>
                {(Object.keys(SUGERIDOS) as ColorAvatar[]).map((clave) => (
                  <SelectorDeColor
                    key={clave}
                    nombre={r.colores[clave]}
                    valor={colorDe(apariencia, clave)}
                    sugeridos={SUGERIDOS[clave]}
                    libre={r.colorLibre}
                    onCambio={(color) => cambiar({ [clave]: color })}
                  />
                ))}
              </div>
            )}

            {categoria === 'rostro' && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">{r.formaDeOjos}</p>
                <div className="grid grid-cols-4 gap-2">
                  {FORMAS.map((forma) => (
                    <BotonDeVista
                      key={forma}
                      activo={(apariencia.ojos_forma ?? 'redondos') === forma}
                      onClick={() => cambiar({ ojos_forma: forma })}
                      nombre={r.formas[forma]}
                      a={{ ...apariencia, ojos_forma: forma }}
                      vista="23 21 18 18"
                    />
                  ))}
                </div>
                <p className="mt-4 mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">{r.pestanas}</p>
                <div className="flex gap-2">
                  <Opcion activa={!!apariencia.pestanas} onClick={() => cambiar({ pestanas: true })}>
                    {r.conPestanas}
                  </Opcion>
                  <Opcion activa={!apariencia.pestanas} onClick={() => cambiar({ pestanas: false })}>
                    {r.sinPestanas}
                  </Opcion>
                </div>
                <p className="mt-4 mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">{r.mejillas}</p>
                <div className="flex flex-wrap gap-2">
                  <Opcion activa={apariencia.rubor} onClick={() => cambiar({ rubor: !apariencia.rubor })} casilla>
                    {r.rubor}
                  </Opcion>
                  <Opcion activa={apariencia.pecas} onClick={() => cambiar({ pecas: !apariencia.pecas })} casilla>
                    {r.pecas}
                  </Opcion>
                </div>
              </div>
            )}

            {(TIPOS_DE_CATEGORIA[categoria] ?? []).map((tipo, _i, tipos) => (
              <Fragment key={tipo}>
                {grilla(tipo, tipos.length > 1 ? r.pestanas_tienda[tipo as keyof typeof r.pestanas_tienda] : undefined)}
              </Fragment>
            ))}
            {categoria === 'trajes' && <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">{r.trajesAyuda}</p>}
          </section>
        </div>
      )}

      {panel === 'mascota' && (
        <div className="aparecer grid items-start gap-5 md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div className="md:sticky md:top-4">{escena}</div>
          <section className={tarjeta}>
            {cabeceraDePanel(r.mascotaYEscritorio)}
            <label className="mt-4 block text-xs font-medium text-stone-500 dark:text-stone-400" htmlFor="nombre-mascota">
              {r.nombreMascota}
            </label>
            <input
              id="nombre-mascota"
              className={`${campo} mt-1.5 w-full`}
              maxLength={20}
              value={apariencia.nombre}
              onChange={(e) => e.target.value.trim() && cambiar({ nombre: e.target.value })}
            />
            {pestanas(
              PESTANAS_MASCOTA,
              pestanaMascota,
              (p) => {
                setPestanaMascota(p)
                setProbando(null)
              },
              r.pestanasMascota,
            )}
            {pestanaMascota === 'mascota' && datos.comprados.includes('mascota-foto') && (
              <FotoDeMascota usuario={usuario} version={datos.foto_mascota} onCambio={actualizar} />
            )}
            {TIPOS_MASCOTA[pestanaMascota].map((tipo, _i, tipos) => (
              <Fragment key={tipo}>{grilla(tipo, tipos.length > 1 ? r.categorias[tipo as keyof typeof r.categorias] : undefined)}</Fragment>
            ))}
            {pestanaMascota === 'decoracion' && <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">{r.decoracionAyuda}</p>}
          </section>
        </div>
      )}

      {verReglas && (
        <Modal titulo={r.comoGanar} onCerrar={() => setVerReglas(false)}>
          <p className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
            <Coins className="size-5" /> {r.monedas(datos.monedas)}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-stone-600 dark:text-stone-300">
            <li>📄 {r.reglaArchivo(datos.reglas.por_archivo)}</li>
            <li>⏱️ {r.reglaPomodoro(Math.round(25 * datos.reglas.por_minuto_de_pomodoro))}</li>
          </ul>
          <Progreso nombre={r.hoyArchivos} valor={datos.ganado_hoy.archivos} tope={datos.topes.archivos} />
          <Progreso nombre={r.hoySalas} valor={datos.ganado_hoy.salas} tope={datos.topes.salas} />
          <p className="mt-3 text-xs text-stone-400">{r.topeAyuda}</p>
          <h3 className="mt-6 mb-1 font-semibold">{t.logros.titulo}</h3>
          <Logros />
        </Modal>
      )}
    </div>
  )
}

function Opcion({
  activa,
  onClick,
  children,
  casilla,
}: {
  activa: boolean
  onClick: () => void
  children: React.ReactNode
  casilla?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activa}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        activa
          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
          : 'border-stone-300 text-stone-600 hover:border-indigo-400 dark:border-stone-700 dark:text-stone-300'
      }`}
    >
      {casilla && (activa ? <Check className="size-3.5" /> : <span className="size-3.5" aria-hidden />)}
      {children}
    </button>
  )
}

/** El avatar pixel de pie, recortado a una parte (vista = viewBox dentro del cuadro de 64×64). */
function AvatarRecortado({ a, vista, className }: { a: Apariencia; vista: string; className?: string }) {
  return (
    <svg viewBox={vista} className={`escena-pixel ${className ?? ''}`} shapeRendering="crispEdges">
      <AvatarPixelSvg a={a} x={32} y={64} pose="idle" />
    </svg>
  )
}

function BotonDeVista({
  activo,
  onClick,
  nombre,
  a,
  vista,
}: {
  activo: boolean
  onClick: () => void
  nombre: string
  a: Apariencia
  vista: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={`overflow-hidden rounded-xl border-2 transition-colors ${
        activo ? 'border-indigo-500' : 'border-transparent hover:border-stone-300 dark:hover:border-stone-600'
      }`}
    >
      <AvatarRecortado a={a} vista={vista} className="block aspect-square w-full bg-gradient-to-b from-amber-50 to-orange-100" />
      <span className="block py-1 text-xs">{nombre}</span>
    </button>
  )
}

// Qué parte del avatar se ve en cada miniatura de la tienda
const VISTAS: Partial<Record<TipoArticulo, string>> = {
  peinado: '14 4 36 36',
  sombrero: '12 0 40 40',
  lentes: '20 14 24 24',
  ropa: '12 26 40 30',
  adorno: '18 26 28 22',
  abajo: '14 38 36 26',
  calzado: '16 48 32 16',
}

function Miniatura({
  articulo,
  apariencia,
  trajes,
  fotoMascota,
}: {
  articulo: Articulo
  apariencia: Apariencia
  trajes: DatosRincon['trajes']
  fotoMascota?: string
}) {
  const a = articulo
  if (a.tipo === 'traje') {
    const traje = trajes[a.id]
    const con = traje ? { ...apariencia, ...traje.piezas, ...traje.colores, traje: a.id } : apariencia
    return <AvatarRecortado a={con} vista="12 22 40 42" className="absolute inset-0 h-full w-full" />
  }
  const vista = VISTAS[a.tipo]
  // Una prenda suelta se muestra sin traje (si no, el jardinero taparía la remera que se está mirando)
  if (vista)
    return <AvatarRecortado a={{ ...apariencia, [a.tipo]: a.id, traje: null }} vista={vista} className="absolute inset-0 h-full w-full" />

  if (a.tipo === 'decoracion')
    return (
      <div className="absolute inset-3">
        <VistaDecoracion id={a.id} />
      </div>
    )
  const mascota =
    a.tipo === 'mascota' ? { ...apariencia, mascota: a.id, cabeza: null, cara: null, cuello: null } : { ...apariencia, [a.tipo]: a.id }
  return (
    <MascotaPixelSuelta
      apariencia={mascota}
      foto={mascota.mascota === 'mascota-foto' ? fotoMascota : undefined}
      className="absolute inset-0 h-full w-full"
    />
  )
}

function SelectorDeColor({
  nombre,
  valor,
  sugeridos,
  libre,
  onCambio,
}: {
  nombre: string
  valor: string
  sugeridos: string[]
  libre: string
  onCambio: (color: string) => void
}) {
  const propio = !sugeridos.includes(valor.toLowerCase())
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">{nombre}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {sugeridos.map((c) => (
          <button
            key={c}
            onClick={() => onCambio(c)}
            aria-label={`${nombre} ${c}`}
            title={c}
            className={`size-7 rounded-full border-2 transition-transform hover:scale-110 ${
              valor.toLowerCase() === c
                ? 'border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800'
                : 'border-white shadow-sm dark:border-stone-700'
            }`}
            style={{ background: c }}
          />
        ))}
        <label
          className="relative flex size-7 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-stone-300 dark:border-stone-600"
          title={libre}
          style={propio ? { background: valor, borderStyle: 'solid', borderColor: '#6366f1' } : undefined}
        >
          {!propio && <span className="size-4 rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />}
          <input
            type="color"
            value={valor}
            onChange={(e) => onCambio(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`${nombre}: ${libre}`}
          />
        </label>
      </div>
    </div>
  )
}

function Progreso({ nombre, valor, tope }: { nombre: string; valor: number; tope: number }) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-stone-500 dark:text-stone-400">
        <span>{nombre}</span>
        <span className="tabular-nums">
          {valor} / {tope}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, (valor / tope) * 100)}%` }} />
      </div>
    </div>
  )
}
