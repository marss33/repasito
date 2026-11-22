import {
  Armchair,
  BookOpen,
  Check,
  FileText,
  Layers,
  ListChecks,
  Loader2,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { api, cuandoSePierdaLaSesion, enDiscord, mensajeDeError } from './api'
import Apuntes from './components/Apuntes'
import Login from './components/Login'
import TuCuenta, { FotoDeUsuario } from './components/TuCuenta'
import { Atrapaerrores, Aviso, Boton, campo, Esqueleto, Modal } from './components/ui'
import { SelectorIdioma, useIdioma } from './i18n'
import { SelectorTema } from './tema'
import type { Estado, Materia, Usuario } from './types'

const Salas = lazy(() => import('./components/Salas'))
const SalaVista = lazy(() => import('./components/SalaVista'))
const Rincon = lazy(() => import('./components/Rincon'))
const MiSala = lazy(() => import('./components/MiSala'))

type Ruta = { tipo: 'materias' } | { tipo: 'salas' } | { tipo: 'sala'; codigo: string } | { tipo: 'rincon' }

/** La parte de la app que se ve sale del link: #/salas o #/sala/K7Q2PX (así el link de invitación lleva directo). */
function leerRuta(): Ruta {
  const sala = location.hash.match(/^#\/sala\/([A-Za-z0-9]{4,8})$/)
  if (sala) return { tipo: 'sala', codigo: sala[1].toUpperCase() }
  if (location.hash === '#/salas') return { tipo: 'salas' }
  if (location.hash === '#/rincon') return { tipo: 'rincon' }
  return { tipo: 'materias' }
}

// Las pestañas que no se ven al entrar se cargan recién cuando se abren
const Chat = lazy(() => import('./components/Chat'))
const Flashcards = lazy(() => import('./components/Flashcards'))
const Quiz = lazy(() => import('./components/Quiz'))

type Pestana = 'apuntes' | 'chat' | 'flashcards' | 'quiz' | 'sala'

const PESTANAS: { id: Pestana; icono: typeof FileText }[] = [
  { id: 'apuntes', icono: FileText },
  { id: 'chat', icono: MessageSquare },
  { id: 'flashcards', icono: Layers },
  { id: 'quiz', icono: ListChecks },
  { id: 'sala', icono: Armchair },
]

const CLAVE_MATERIA = 'repaso:materia'

function leerGuardado(): number | null {
  try {
    const valor = localStorage.getItem(CLAVE_MATERIA)
    return valor ? Number(valor) : null
  } catch {
    return null
  }
}

function guardar(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(CLAVE_MATERIA)
    else localStorage.setItem(CLAVE_MATERIA, String(id))
  } catch {
    // sin almacenamiento local, no pasa nada
  }
}

const ActividadDiscord = lazy(() => import('./components/ActividadDiscord'))
const SoloDiscord = lazy(() => import('./components/SoloDiscord'))

export default function App() {
  if (enDiscord)
    return (
      <Atrapaerrores>
        <Suspense fallback={null}>
          <ActividadDiscord />
        </Suspense>
      </Atrapaerrores>
    )
  return <AppWeb />
}

function AppWeb() {
  // undefined = todavía no sabemos si hay sesión; null = no hay
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined)
  // En producción la app se usa solo como actividad de Discord: la web muestra cómo abrirla
  const [soloDiscord, setSoloDiscord] = useState(false)

  useEffect(() => {
    cuandoSePierdaLaSesion(() => setUsuario(null))
    api
      .estado()
      .then((e) => setSoloDiscord(!!e.solo_discord))
      .catch(() => {})
    api
      .yo()
      .then(setUsuario)
      .catch(() => setUsuario(null))
  }, [])

  if (soloDiscord)
    return (
      <Suspense fallback={null}>
        <SoloDiscord />
      </Suspense>
    )

  return (
    <Atrapaerrores>
      {usuario === undefined ? (
        <div className="flex min-h-dvh items-center justify-center">
          <Loader2 className="size-6 animate-spin text-stone-400" />
        </div>
      ) : usuario === null ? (
        <Login onEntrar={setUsuario} />
      ) : (
        <Aplicacion usuario={usuario} setUsuario={setUsuario} />
      )}
    </Atrapaerrores>
  )
}

/** La app de estudio. Con `enActividad` (dentro de Discord) muestra solo las materias: las salas y
 * el avatar se manejan desde los botones de la actividad, y no hay "cerrar sesión". */
export function Aplicacion({
  usuario,
  setUsuario,
  enActividad = false,
}: {
  usuario: Usuario
  setUsuario: (u: Usuario | null) => void
  enActividad?: boolean
}) {
  const { t } = useIdioma()
  const [estado, setEstado] = useState<Estado | null>(null)
  const [materias, setMaterias] = useState<Materia[] | null>(null)
  const [actualId, setActualId] = useState<number | null>(leerGuardado)
  const [pestana, setPestana] = useState<Pestana>('apuntes')
  const [error, setError] = useState<string | null>(null)
  const [guardandoCuenta, setGuardandoCuenta] = useState(false)
  const [editandoCuenta, setEditandoCuenta] = useState(false)
  const [ruta, setRuta] = useState<Ruta>(() => (enActividad ? { tipo: 'materias' } : leerRuta()))
  // "Mi sala" queda abierta (y sonando) aunque se cambie de pestaña o de materia
  const [salaAbierta, setSalaAbierta] = useState(false)
  const enMiSala = ruta.tipo === 'materias' && pestana === 'sala'
  useEffect(() => {
    if (enMiSala) setSalaAbierta(true)
  }, [enMiSala])
  useEffect(() => {
    if (ruta.tipo === 'sala') setSalaAbierta(false) // en una sala de grupo suena la música de esa sala
  }, [ruta.tipo])

  useEffect(() => {
    if (enActividad) return
    const alCambiar = () => setRuta(leerRuta())
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])

  function abrirMateria(id: number) {
    setActualId(id)
    if (ruta.tipo !== 'materias') history.pushState(null, '', location.pathname + location.search)
    setRuta({ tipo: 'materias' })
  }

  const recargar = useCallback(async () => {
    try {
      const lista = await api.materias()
      setMaterias(lista)
      setActualId((id) => (id !== null && lista.some((m) => m.id === id) ? id : (lista[0]?.id ?? null)))
      api
        .yo()
        .then(setUsuario)
        .catch(() => {}) // actualiza el contador de usos de IA
    } catch (e) {
      setError(mensajeDeError(e))
      setMaterias((m) => m ?? [])
    }
  }, [setUsuario])

  useEffect(() => {
    api
      .estado()
      .then(setEstado)
      .catch(() => {})
    recargar()
  }, [recargar])

  useEffect(() => guardar(actualId), [actualId])

  // Precarga en segundo plano lo que se usa después (chat, fórmulas) para que abra al instante
  useEffect(() => {
    const id = setTimeout(() => {
      import('./components/Chat')
      import('./components/Flashcards')
      import('./components/MarkdownCompleto')
    }, 1500)
    return () => clearTimeout(id)
  }, [])

  async function crear(nombre: string) {
    try {
      const nueva = await api.crearMateria(nombre)
      await recargar()
      setActualId(nueva.id)
      setPestana('apuntes')
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  async function renombrar(materia: Materia, nombre: string) {
    try {
      await api.renombrarMateria(materia.id, nombre)
      recargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  async function borrar(materia: Materia) {
    if (!confirm(t.confirmarBorrarMateria(materia.nombre))) return
    try {
      await api.borrarMateria(materia.id)
      if (materia.id === actualId) setActualId(null)
      recargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  async function salir() {
    if (usuario.es_invitado && !confirm(t.confirmarSalirInvitado)) return
    await api.salir().catch(() => {})
    guardar(null)
    setUsuario(null)
  }

  const actual = materias?.find((m) => m.id === actualId) ?? null

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex flex-col border-b border-stone-200 bg-white md:sticky md:top-0 md:h-dvh md:w-64 md:shrink-0 md:border-r md:border-b-0 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center gap-2 px-5 py-4">
          <img src={`${import.meta.env.BASE_URL}icono.svg`} alt="" className="size-8 [image-rendering:pixelated]" />
          <span className="flex-1 text-lg font-semibold tracking-tight">Repasito</span>
          <SelectorTema className="md:hidden" />
          <SelectorIdioma className="md:hidden" />
          <button onClick={() => setEditandoCuenta(true)} className="md:hidden" aria-label={t.cuenta.titulo} title={t.cuenta.titulo}>
            <FotoDeUsuario usuario={usuario} tamano="size-7" texto="text-xs" />
          </button>
          {!enActividad && (
            <button
              onClick={salir}
              className="rounded p-1 text-stone-400 hover:text-stone-700 md:hidden dark:hover:text-stone-200"
              aria-label={t.salir}
              title={t.salir}
            >
              <LogOut className="size-4" />
            </button>
          )}
        </div>

        <nav
          className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] md:flex-1 md:flex-col md:overflow-y-auto"
          aria-label={t.materias}
        >
          {!enActividad && (
            <>
              <button
                onClick={() => (location.hash = '/salas')}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  ruta.tipo === 'salas' || ruta.tipo === 'sala'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-950'
                }`}
              >
                <Users className="size-4" /> {t.sala.estudiarEnGrupo}
              </button>
              <button
                onClick={() => (location.hash = '/rincon')}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors md:mb-3 ${
                  ruta.tipo === 'rincon'
                    ? 'bg-amber-500 text-white'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-950'
                }`}
              >
                <Armchair className="size-4" /> {t.rincon.titulo}
              </button>
            </>
          )}
          <p className="hidden px-2 pb-1 text-xs font-semibold tracking-wider text-stone-400 uppercase md:block">{t.materias}</p>
          {materias === null && (
            <div className="hidden md:block">
              <Esqueleto filas={3} alto="h-8" />
            </div>
          )}
          {materias?.map((m) => (
            <div key={m.id} className="group relative shrink-0">
              <button
                onClick={() => abrirMateria(m.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 pr-8 text-left text-sm transition-colors ${
                  m.id === actualId && ruta.tipo === 'materias'
                    ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                <span className="truncate">{m.nombre}</span>
                {m.pendientes > 0 && (
                  <span className="ml-auto rounded-full bg-indigo-600 px-1.5 text-xs font-semibold text-white" title={t.repasarHoy}>
                    {m.pendientes}
                  </span>
                )}
              </button>
              <button
                onClick={() => borrar(m)}
                className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 rounded p-1 text-stone-400 group-hover:block group-focus-within:block hover:text-red-600"
                aria-label={t.borrarNombre(m.nombre)}
                title={t.borrarMateria}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <NuevaMateria onCrear={crear} />
        </nav>

        <div className="hidden border-t border-stone-200 px-5 py-4 md:block dark:border-stone-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditandoCuenta(true)}
              className="-m-1.5 flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
              title={t.cuenta.titulo}
            >
              <FotoDeUsuario usuario={usuario} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{usuario.nombre}</span>
                <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
                  {usuario.es_invitado ? t.cuentaInvitado : usuario.email}
                </span>
              </span>
            </button>
            {!enActividad && (
              <button
                onClick={salir}
                className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                aria-label={t.salir}
                title={t.salir}
              >
                <LogOut className="size-4" />
              </button>
            )}
          </div>
          <UsoIA usuario={usuario} />
          <div className="mt-3 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
            <span>{t.idioma}</span>
            <div className="flex items-center gap-1.5">
              <SelectorTema />
              <SelectorIdioma />
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        <div className={`mx-auto space-y-4 ${ruta.tipo === 'sala' || ruta.tipo === 'rincon' || enMiSala ? 'max-w-6xl' : 'max-w-4xl'}`}>
          {usuario.es_invitado && (
            <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 sm:flex-row sm:items-center dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-100">
              <p className="flex-1">{t.avisoInvitado}</p>
              <Boton onClick={() => setGuardandoCuenta(true)} className="shrink-0">
                <UserPlus className="size-4" /> {t.guardarMiCuenta}
              </Boton>
            </div>
          )}
          {ruta.tipo === 'materias' && estado && !estado.ia_configurada && <Aviso tipo="info">{t.iaNoConfigurada}</Aviso>}
          {ruta.tipo === 'materias' && estado && !estado.ocr_disponible && <Aviso tipo="info">{t.ocrNoDisponible}</Aviso>}
          {error && <Aviso onCerrar={() => setError(null)}>{error}</Aviso>}

          {ruta.tipo !== 'materias' ? (
            <Atrapaerrores key={ruta.tipo === 'sala' ? ruta.codigo : ruta.tipo}>
              <Suspense fallback={<Esqueleto filas={3} />}>
                {ruta.tipo === 'salas' ? (
                  <Salas />
                ) : ruta.tipo === 'rincon' ? (
                  <Rincon usuario={usuario} onUsuario={setUsuario} />
                ) : (
                  <SalaVista codigo={ruta.codigo} usuario={usuario} onUsuario={setUsuario} />
                )}
              </Suspense>
            </Atrapaerrores>
          ) : materias === null ? (
            <Esqueleto filas={3} />
          ) : actual ? (
            <>
              <Encabezado materia={actual} onRenombrar={(nombre) => renombrar(actual, nombre)} />

              <div
                className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-stone-200 [scrollbar-width:none] dark:border-stone-800"
                role="tablist"
              >
                {PESTANAS.filter((p) => !enActividad || p.id !== 'sala').map(({ id, icono: Icono }) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={pestana === id}
                    onClick={() => setPestana(id)}
                    className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      pestana === id
                        ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                        : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
                    }`}
                  >
                    <Icono className="size-4" />
                    {t.pestanas[id]}
                    {id === 'flashcards' && actual.pendientes > 0 && (
                      <span className="rounded-full bg-indigo-100 px-1.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        {actual.pendientes}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <section className="pt-2">
                <Atrapaerrores key={`${actual.id}-${pestana}`}>
                  <Suspense fallback={<Esqueleto filas={2} />}>
                    {pestana === 'apuntes' && <Apuntes materia={actual} onCambio={recargar} />}
                    {pestana === 'chat' && <Chat materia={actual} onCambio={recargar} />}
                    {pestana === 'flashcards' && <Flashcards materia={actual} onCambio={recargar} />}
                    {pestana === 'quiz' && <Quiz materia={actual} onCambio={recargar} />}
                    {pestana === 'sala' && !salaAbierta && <Esqueleto filas={3} />}
                  </Suspense>
                </Atrapaerrores>
              </section>
            </>
          ) : (
            <Bienvenida onCrear={crear} />
          )}
          {salaAbierta && (
            <div className={enMiSala ? '' : 'hidden'}>
              <Atrapaerrores>
                <Suspense fallback={<Esqueleto filas={3} />}>
                  <MiSala usuario={usuario} onUsuario={setUsuario} />
                </Suspense>
              </Atrapaerrores>
            </div>
          )}
        </div>
      </main>

      {editandoCuenta && (
        <TuCuenta
          usuario={usuario}
          onUsuario={setUsuario}
          onCerrar={() => setEditandoCuenta(false)}
          onGuardarCuenta={() => {
            setEditandoCuenta(false)
            setGuardandoCuenta(true)
          }}
        />
      )}
      {guardandoCuenta && (
        <GuardarCuenta
          onListo={(u) => {
            setUsuario(u)
            setGuardandoCuenta(false)
          }}
          onCerrar={() => setGuardandoCuenta(false)}
        />
      )}
    </div>
  )
}

function Encabezado({ materia, onRenombrar }: { materia: Materia; onRenombrar: (nombre: string) => void }) {
  const { t } = useIdioma()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(materia.nombre)

  useEffect(() => {
    setNombre(materia.nombre)
    setEditando(false)
  }, [materia.id, materia.nombre])

  function confirmar() {
    const limpio = nombre.trim()
    if (limpio && limpio !== materia.nombre) onRenombrar(limpio)
    setEditando(false)
  }

  return (
    <header>
      {editando ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            confirmar()
          }}
        >
          <input
            autoFocus
            value={nombre}
            maxLength={120}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setEditando(false)}
            aria-label={t.nombreMateria}
            className="min-w-0 flex-1 rounded-lg border border-indigo-400 bg-white px-2 py-1 text-2xl font-semibold tracking-tight outline-none dark:bg-stone-950"
          />
          <Boton type="submit" className="px-2" aria-label={t.guardarNombre}>
            <Check className="size-4" />
          </Boton>
          <Boton type="button" variante="fantasma" className="px-2" onClick={() => setEditando(false)} aria-label={t.cancelar}>
            <X className="size-4" />
          </Boton>
        </form>
      ) : (
        <div className="group flex items-center gap-2">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{materia.nombre}</h1>
          <button
            onClick={() => setEditando(true)}
            className="rounded p-1 text-stone-400 opacity-100 transition-opacity hover:text-stone-700 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 dark:hover:text-stone-200"
            aria-label={t.cambiarNombre}
            title={t.cambiarNombre}
          >
            <Pencil className="size-4" />
          </button>
        </div>
      )}
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        {t.resumenMateria(materia.documentos, materia.flashcards, materia.pendientes)}
      </p>
    </header>
  )
}

function GuardarCuenta({ onListo, onCerrar }: { onListo: (u: Usuario) => void; onCerrar: () => void }) {
  const { t } = useIdioma()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal titulo={t.guardarMiCuenta} onCerrar={onCerrar}>
      <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">{t.guardarCuentaDetalle}</p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setCargando(true)
          setError(null)
          try {
            onListo(await api.guardarCuenta(nombre, email, password))
          } catch (err) {
            setError(mensajeDeError(err))
            setCargando(false)
          }
        }}
      >
        <label className="block">
          <span className="text-sm font-medium">{t.nombre}</span>
          <input
            required
            autoFocus
            maxLength={80}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoComplete="given-name"
            className={campo}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t.email}</span>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={campo} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t.contrasena}</span>
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className={campo}
          />
          <span className="mt-1 block text-xs text-stone-500">{t.minimoCaracteres}</span>
        </label>
        {error && <Aviso>{error}</Aviso>}
        <Boton type="submit" cargando={cargando} className="w-full">
          {t.guardarCuenta}
        </Boton>
      </form>
    </Modal>
  )
}

function UsoIA({ usuario }: { usuario: Usuario }) {
  const { t } = useIdioma()
  const restantes = Math.max(0, usuario.limite_diario - usuario.usos_hoy)
  const proporcion = Math.min(1, usuario.usos_hoy / usuario.limite_diario)
  return (
    <div className="mt-3" title={t.usosAyuda}>
      <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
        <span className="flex items-center gap-1">
          <Sparkles className="size-3" /> {t.usosHoy}
        </span>
        <span className="tabular-nums">{t.restantes(restantes)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
        <div
          className={`h-full transition-all ${proporcion >= 0.9 ? 'bg-red-500' : 'bg-indigo-500'}`}
          style={{ width: `${proporcion * 100}%` }}
        />
      </div>
    </div>
  )
}

function NuevaMateria({ onCrear }: { onCrear: (nombre: string) => void }) {
  const { t } = useIdioma()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
      >
        <Plus className="size-4" /> {t.nuevaMateria}
      </button>
    )
  }

  return (
    <form
      className="shrink-0"
      onSubmit={(e) => {
        e.preventDefault()
        if (nombre.trim()) onCrear(nombre.trim())
        setNombre('')
        setAbierto(false)
      }}
    >
      <input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onBlur={() => !nombre.trim() && setAbierto(false)}
        onKeyDown={(e) => e.key === 'Escape' && setAbierto(false)}
        placeholder={t.nombreMateria}
        aria-label={t.nombreMateria}
        maxLength={120}
        className="w-48 rounded-lg border border-indigo-400 bg-white px-3 py-1.5 text-sm outline-none md:w-full dark:bg-stone-950"
      />
    </form>
  )
}

function Bienvenida({ onCrear }: { onCrear: (nombre: string) => void }) {
  const { t } = useIdioma()
  const [nombre, setNombre] = useState('')
  const iconos = [FileText, MessageSquare, Layers]

  return (
    <div className="py-10 text-center">
      <BookOpen className="mx-auto mb-4 size-10 text-indigo-600 dark:text-indigo-400" />
      <h1 className="text-3xl font-semibold tracking-tight">{t.primeraMateria}</h1>
      <p className="mx-auto mt-2 max-w-md text-stone-500 dark:text-stone-400">{t.primeraMateriaDetalle}</p>

      <form
        className="mx-auto mt-6 flex max-w-sm gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (nombre.trim()) onCrear(nombre.trim())
        }}
      >
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={t.ejemploMateria}
          aria-label={t.nombreMateria}
          maxLength={120}
          className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:border-indigo-400 dark:border-stone-700 dark:bg-stone-900"
        />
        <Boton type="submit" disabled={!nombre.trim()}>
          {t.crear}
        </Boton>
      </form>

      <div className="mt-12 grid gap-4 text-left sm:grid-cols-3">
        {t.pasos.map(([titulo, texto], i) => {
          const Icono = iconos[i]
          return (
            <div key={titulo} className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
              <div className="mb-2 flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Icono className="size-5" />
                <span className="text-xs font-semibold">{t.paso(i + 1)}</span>
              </div>
              <p className="font-medium">{titulo}</p>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{texto}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
