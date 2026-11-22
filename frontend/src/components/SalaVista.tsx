import {
  ArrowLeft,
  BookOpen,
  Check,
  CloudSun,
  Pencil,
  Shirt,
  FolderOpen,
  Headphones,
  Copy,
  Loader2,
  Maximize2,
  MessageCircle,
  PenLine,
  Pause,
  Play,
  RotateCcw,
  Send,
  Settings2,
  SkipForward,
  Timer,
  Trophy,
  X,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, mensajeDeError, urlApi } from '../api'
import { useIdioma } from '../i18n'
import { RadioLofi } from '../lofi'
import PanelAmbiente, { useClima, useFondo } from './AmbienteSala'
import RadioSala, { useMiRadio } from './RadioSala'
import TriviaSala from './TriviaSala'
import TuCuenta, { EVENTO_APODO } from './TuCuenta'
import { AvatarPixel } from '../pixel/AvatarPixel'
import type { Usuario } from '../types'
import { EscenaDeGrupo, EscenaSola, siguienteClima, tiempoRestante, type Ambiente, type ControlesSala } from './escena/Escena'
import { useSala, type EstadoSala, type Conectado, type EstadoPomodoro, type EventoSala, type LineaChat } from '../useSala'
import { Aviso, Boton, Modal } from './ui'

const cargarPizarra = () => import('./Pizarra')
const ArchivosSala = lazy(() => import('./ArchivosSala'))
const Pizarra = lazy(cargarPizarra)

function colorDe(id: number) {
  return `hsl(${(id * 137) % 360} 65% 55%)`
}

function Avatar({ persona, tamano = 'size-9' }: { persona: { id: number; nombre: string; foto?: number }; tamano?: string }) {
  return (
    <span
      className={`${tamano} flex shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white ring-2 ring-white dark:ring-stone-900`}
      style={{ background: colorDe(persona.id) }}
      title={persona.nombre}
    >
      {persona.foto ? (
        <img src={urlApi(`/rincon/foto/${persona.id}?v=${persona.foto}`)} alt="" className="size-full object-cover" />
      ) : (
        persona.nombre.charAt(0).toUpperCase()
      )}
    </span>
  )
}

export default function SalaVista({
  codigo,
  usuario,
  onUsuario,
  personal = false,
  discord = false,
  onEditarAvatar = () => (location.hash = '/rincon'),
  onGuardarCuenta = () => (location.hash = '/'),
  misMaterias,
}: {
  codigo: string
  usuario: Usuario
  onUsuario: (usuario: Usuario) => void
  personal?: boolean // "Mi sala": para estudiar solo, sin chat ni link para invitar
  discord?: boolean // dentro de la actividad de Discord: se invita desde Discord, no con un link
  onEditarAvatar?: () => void
  onGuardarCuenta?: () => void
  misMaterias?: ReactNode // en Discord: tus materias (solo las ves vos), como una pestaña más de la sala
}) {
  const { t } = useIdioma()
  const radio = useRef<RadioLofi | null>(null)
  if (!radio.current) radio.current = new RadioLofi()
  const miRadio = useMiRadio(radio.current)
  const [copiado, setCopiado] = useState(false)

  const [aviso, setAviso] = useState<string | null>(null)
  const [premio, setPremio] = useState<number | null>(null)
  const [verTrivia, setVerTrivia] = useState(false)
  const [invitacion, setInvitacion] = useState<{ nombre: string; tema: string } | null>(null)
  const nombreRef = useRef<string | null>(null)
  const usuarioRef = useRef(usuario)
  usuarioRef.current = usuario
  const textos = useRef(t)
  textos.current = t

  const alEvento = useCallback(
    (evento: EventoSala) => {
      if (evento.evento === 'fase') radio.current?.campana()
      else if (evento.evento === 'trivia') {
        // Al que la armó se le abre sola; a los demás les llega la invitación
        if (evento.nombre === nombreRef.current) setVerTrivia(true)
        else setInvitacion({ nombre: evento.nombre, tema: evento.tema })
      } else if (evento.evento === 'aviso') {
        if (!evento.texto) return
        setAviso(evento.texto)
        window.setTimeout(() => setAviso(null), 6000)
      } else if (evento.evento === 'archivos') {
        setNuevosArchivos((n) => n + 1)
      } else if (evento.evento === 'monedas') {
        onUsuario({ ...usuarioRef.current, monedas: evento.total })
        setPremio(evento.ganadas)
        window.setTimeout(() => setPremio(null), 6000)
      }
    },
    [onUsuario],
  )
  const { nombre, creadorId, estado, chat, conexion, error, enviar, ahoraServidor, escena, escucharPizarra, cargarImagenes } = useSala(
    codigo,
    alEvento,
  )
  nombreRef.current = nombre
  const [pestana, setPestana] = useState<'estudio' | 'pizarra' | 'archivos' | 'materias'>('estudio')
  const [vioMaterias, setVioMaterias] = useState(false) // se cargan la primera vez y después quedan
  const [nuevosArchivos, setNuevosArchivos] = useState(0)
  const [chatAbierto, setChatAbierto] = useState(false)
  const [verPomodoro, setVerPomodoro] = useState(false)
  const [verRadio, setVerRadio] = useState(false)
  const [vistaPomodoro, setVistaPomodoro] = useState(false)
  // El ambiente (fondo, clima y ruido) es de cada uno: no cambia lo que ven los demás
  const [verAmbiente, setVerAmbiente] = useState(false)
  // Miniperfil de alguien de la sala (tocándolo) y el editor del perfil propio
  const [perfilDe, setPerfilDe] = useState<number | null>(null)
  const [editandoPerfil, setEditandoPerfil] = useState(false)
  const [fondo, setFondo] = useFondo()
  const [clima, setClima] = useClima()
  // Mensajes del chat que llegaron mientras no se lo veía (en la pizarra o con el chat cerrado)
  const [leidos, setLeidos] = useState(0)
  const chatALaVista = !personal && pestana === 'estudio' && chatAbierto
  const sinLeer = chatALaVista ? 0 : chat.slice(leidos).filter((l) => l.tipo === 'mensaje').length
  useEffect(() => {
    if (chatALaVista) setLeidos(chat.length)
  }, [chatALaVista, chat.length])

  // La pizarra pesa bastante: se baja de fondo apenas se entra a la sala
  useEffect(() => {
    const id = window.setTimeout(cargarPizarra, 1500)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => () => radio.current?.detener(), [])

  // Si cambia su apodo desde "Tu cuenta", los demás de la sala lo ven al instante
  useEffect(() => {
    const alCambiar = (e: Event) => enviar({ tipo: 'perfil', nombre: (e as CustomEvent<string>).detail })
    window.addEventListener(EVENTO_APODO, alCambiar)
    return () => window.removeEventListener(EVENTO_APODO, alCambiar)
  }, [enviar])

  async function copiarLink() {
    await navigator.clipboard.writeText(`${location.origin}/#/sala/${codigo}`)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1800)
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Aviso>{error === 'sala' ? t.sala.noExiste : error === 'sesion' ? t.sala.sinSesion : error}</Aviso>
        <Boton variante="secundario" onClick={() => (location.hash = '/salas')}>
          <ArrowLeft className="size-4" /> {t.sala.volver}
        </Boton>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {!personal && (
        <header className="relative z-30 flex flex-wrap items-center gap-3">
          {!discord && (
            <Boton
              variante="fantasma"
              className="px-2"
              onClick={() => (location.hash = '/salas')}
              aria-label={t.sala.volver}
              title={t.sala.volver}
            >
              <ArrowLeft className="size-4" />
            </Boton>
          )}
          <div className="min-w-[11rem] flex-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{nombre ?? '…'}</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              <span className="font-mono tracking-widest">{codigo}</span>
              {estado && ` · ${t.sala.enLaSala(estado.conectados.length)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Boton
              variante={verAmbiente ? 'primario' : 'secundario'}
              onClick={() => setVerAmbiente((v) => !v)}
              aria-pressed={verAmbiente}
              aria-label={t.sala.ambiente}
              title={t.sala.ambiente}
            >
              <CloudSun className="size-4" /> <span className="hidden sm:inline">{t.sala.ambiente}</span>
            </Boton>
            {estado && (
              <BotonReloj
                pomodoro={estado.pomodoro}
                ahoraServidor={ahoraServidor}
                activo={verPomodoro}
                onClick={() => setVerPomodoro((v) => !v)}
                etiqueta={t.sala.abrirReloj}
              />
            )}
            <Boton
              variante={verRadio ? 'primario' : 'secundario'}
              onClick={() => setVerRadio((v) => !v)}
              aria-pressed={verRadio}
              aria-label={t.sala.abrirRadio}
              title={t.sala.abrirRadio}
            >
              <Headphones className="size-4" /> <span className="hidden sm:inline">{t.sala.radio}</span>
            </Boton>
            {!personal && (
              <Boton
                variante={verTrivia ? 'primario' : 'secundario'}
                onClick={() => setVerTrivia(true)}
                aria-label={t.trivia.abrir}
                title={t.trivia.abrir}
              >
                <Trophy className="size-4" /> <span className="hidden sm:inline">{t.trivia.titulo}</span>
                {(estado?.trivia && estado.trivia.fase !== 'terminada') || estado?.preparando_trivia ? (
                  <span className="size-2 rounded-full bg-amber-400" aria-hidden />
                ) : null}
              </Boton>
            )}
            <Boton
              variante={chatAbierto ? 'primario' : 'secundario'}
              onClick={() => {
                setChatAbierto((a) => !a)
                setPestana('estudio')
              }}
              aria-pressed={chatAbierto}
              aria-label={t.sala.abrirChat}
              title={t.sala.abrirChat}
            >
              <MessageCircle className="size-4" /> <span className="hidden sm:inline">{t.sala.abrirChat}</span>
              {sinLeer > 0 && (
                <span className="rounded-full bg-amber-400 px-1.5 text-xs leading-5 font-semibold text-amber-950">{sinLeer}</span>
              )}
            </Boton>
          </div>
          <div className="flex -space-x-2">
            {estado?.conectados.slice(0, 6).map((p) => (
              <button
                key={p.id}
                onClick={() => setPerfilDe(p.id)}
                className="rounded-full transition-transform hover:scale-110"
                title={p.nombre}
              >
                <Avatar persona={{ id: p.id, nombre: p.nombre, foto: p.apariencia?.foto }} />
              </button>
            ))}
          </div>
          {!discord && (
            <Boton variante="secundario" onClick={copiarLink}>
              {copiado ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
              {copiado ? t.sala.linkCopiado : t.sala.copiarLink}
            </Boton>
          )}
          {/* Los paneles se esconden en vez de desmontarse: así la música y el título con el tiempo siguen */}
          <div className="pointer-events-none absolute top-full right-0 mt-2 flex max-w-full flex-wrap items-start justify-end gap-3">
            <div className={verAmbiente ? 'aparecer pointer-events-auto w-72 max-w-full' : 'hidden'}>
              <PanelAmbiente
                radio={radio.current!}
                fondo={fondo}
                onFondo={setFondo}
                clima={clima}
                onClima={setClima}
                onCerrar={() => setVerAmbiente(false)}
              />
            </div>
            <div className={verPomodoro ? 'aparecer pointer-events-auto' : 'hidden'}>
              <PomodoroCompacto
                pomodoro={estado?.pomodoro ?? null}
                ahoraServidor={ahoraServidor}
                enviar={enviar}
                onCerrar={() => setVerPomodoro(false)}
                onVista={() => setVistaPomodoro(true)}
              />
            </div>
            <div className={verRadio ? 'aparecer pointer-events-auto w-72 max-w-full' : 'hidden'}>
              {estado && <RadioSala miRadio={miRadio} onCerrar={() => setVerRadio(false)} compacto />}
            </div>
            <div className={chatAbierto && pestana === 'estudio' ? 'aparecer pointer-events-auto w-80 max-w-full' : 'hidden'}>
              <ChatSala
                chat={chat}
                usuario={usuario}
                conectados={estado?.conectados ?? []}
                enviar={enviar}
                onCerrar={() => setChatAbierto(false)}
                compacto
              />
            </div>
          </div>
        </header>
      )}

      {!personal && /^(Invitado|Guest) \d{3}$/.test(usuario.nombre) && (
        <ElegirNombre
          onGuardar={async (nuevo) => {
            const actualizado = await api.cambiarNombre(nuevo)
            onUsuario(actualizado)
            enviar({ tipo: 'perfil', nombre: actualizado.nombre })
          }}
        />
      )}

      {conexion !== 'conectada' && (
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Loader2 className="size-4 animate-spin" /> {conexion === 'conectando' ? t.sala.conectando : t.sala.reconectando}
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-stone-200 dark:border-stone-800" role="tablist">
        <Pestana activa={pestana === 'estudio'} onClick={() => setPestana('estudio')}>
          <Timer className="size-4" /> {t.sala.pestanaEstudio}
          {sinLeer > 0 && <span className="rounded-full bg-indigo-600 px-1.5 text-xs font-semibold leading-5 text-white">{sinLeer}</span>}
        </Pestana>
        <Pestana
          activa={pestana === 'pizarra'}
          onClick={() => {
            setLeidos(chat.length)
            setPestana('pizarra')
          }}
        >
          <PenLine className="size-4" /> {t.sala.pestanaPizarra}
        </Pestana>
        {!personal && (
          <Pestana activa={pestana === 'archivos'} onClick={() => setPestana('archivos')}>
            <FolderOpen className="size-4" /> {t.sala.pestanaArchivos}
          </Pestana>
        )}
        {misMaterias && (
          <Pestana
            activa={pestana === 'materias'}
            onClick={() => {
              setPestana('materias')
              setVioMaterias(true)
            }}
          >
            <BookOpen className="size-4" /> {t.discord.misMaterias}
          </Pestana>
        )}
        {pestana !== 'estudio' && estado && <MiniReloj pomodoro={estado.pomodoro} ahoraServidor={ahoraServidor} />}
      </div>

      {aviso && (
        <Aviso tipo="info" onCerrar={() => setAviso(null)}>
          {aviso}
        </Aviso>
      )}
      {invitacion && !verTrivia && estado?.trivia && !estado.trivia.jugadores.some((j) => j.id === usuario.id) && (
        <div
          className="aparecer fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-indigo-200 bg-white p-4 shadow-xl sm:flex-row sm:items-center dark:border-indigo-900 dark:bg-stone-900"
          role="dialog"
          aria-label={t.trivia.titulo}
        >
          <Trophy className="size-6 shrink-0 text-amber-500" />
          <p className="min-w-0 flex-1 text-sm font-medium">{t.trivia.invitacion(invitacion.nombre, invitacion.tema)}</p>
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={() => setInvitacion(null)}>
              {t.trivia.ahoraNo}
            </Boton>
            <Boton
              onClick={() => {
                enviar({ tipo: 'trivia', accion: 'unirme' })
                setInvitacion(null)
                setVerTrivia(true)
              }}
            >
              {t.trivia.unirme}
            </Boton>
          </div>
        </div>
      )}
      {verTrivia && (
        <TriviaSala
          codigo={codigo}
          usuarioId={usuario.id}
          trivia={estado?.trivia ?? null}
          preparando={estado?.preparando_trivia ?? null}
          ahoraServidor={ahoraServidor}
          enviar={enviar}
          onCerrar={() => setVerTrivia(false)}
        />
      )}
      {premio !== null && (
        <div
          className="aparecer fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 font-semibold text-amber-950 shadow-lg"
          role="status"
        >
          🪙 {t.rincon.ganaste(premio)}
        </div>
      )}

      {pestana === 'pizarra' && (
        <Suspense
          fallback={
            <div className="flex h-[calc(100dvh-13rem)] min-h-[26rem] items-center justify-center gap-2 rounded-2xl border border-stone-200 text-sm text-stone-500 dark:border-stone-800">
              <Loader2 className="size-4 animate-spin" /> {t.sala.cargandoPizarra}
            </div>
          }
        >
          <Pizarra
            escena={escena}
            conectados={estado?.conectados ?? []}
            enviar={enviar}
            escucharPizarra={escucharPizarra}
            cargarImagenes={cargarImagenes}
          />
        </Suspense>
      )}
      {pestana === 'archivos' && (
        <Suspense fallback={<Loader2 className="size-5 animate-spin text-stone-400" />}>
          <ArchivosSala codigo={codigo} usuario={usuario} creadorId={creadorId} cambios={nuevosArchivos} />
        </Suspense>
      )}
      {misMaterias && vioMaterias && <div className={pestana === 'materias' ? '' : 'hidden'}>{misMaterias}</div>}
      {/* La pestaña Estudio no se desmonta: así la música (y los videos) siguen sonando mientras se dibuja */}
      <div className={`space-y-5 ${pestana === 'estudio' ? '' : 'hidden'}`}>
        {personal ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-5">
              {estado && <EscenaPersonal estado={estado} usuario={usuario} clima={clima} onClima={() => setClima(siguienteClima(clima))} />}
              <Pomodoro pomodoro={estado?.pomodoro ?? null} ahoraServidor={ahoraServidor} enviar={enviar} />
            </div>
            <div className="space-y-5">
              {estado && <RadioSala miRadio={miRadio} />}
              <PanelAmbiente radio={radio.current!} clima={clima} onClima={setClima} compacto={false} />
            </div>
          </div>
        ) : (
          estado && (
            <EscenaDeLaSala
              estado={estado}
              escena={fondo}
              clima={clima}
              controles={{
                pomodoro: estado.pomodoro,
                ahoraServidor,
                sonando: miRadio.sonando,
                onReloj: () => setVerPomodoro((v) => !v),
                onRadio: () => setVerRadio((v) => !v),
                etiquetaReloj: t.sala.abrirReloj,
                etiquetaRadio: t.sala.abrirRadio,
                onClima: () => setVerAmbiente((v) => !v),
                etiquetaClima: t.sala.abrirAmbiente,
                onPersona: setPerfilDe,
              }}
            />
          )
        )}
      </div>
      {perfilDe !== null && estado && (
        <MiniPerfil
          persona={estado.conectados.find((c) => c.id === perfilDe) ?? null}
          esMio={perfilDe === usuario.id}
          onCerrar={() => setPerfilDe(null)}
          onEditarPerfil={() => {
            setPerfilDe(null)
            setEditandoPerfil(true)
          }}
          onEditarAvatar={() => {
            setPerfilDe(null)
            onEditarAvatar()
          }}
        />
      )}
      {editandoPerfil && (
        <TuCuenta
          usuario={usuario}
          onUsuario={onUsuario}
          onCerrar={() => setEditandoPerfil(false)}
          onGuardarCuenta={() => {
            setEditandoPerfil(false)
            onGuardarCuenta()
          }}
        />
      )}
      {vistaPomodoro && estado && (
        <VistaPomodoro
          estado={estado}
          escena={fondo}
          clima={clima}
          ahoraServidor={ahoraServidor}
          onCerrar={() => setVistaPomodoro(false)}
        />
      )}
    </div>
  )
}

/** El lugar con todos los que están en la sala. Cada uno ve el fondo y el clima que eligió. */
function EscenaDeLaSala({
  estado,
  escena,
  clima,
  controles,
}: {
  estado: EstadoSala
  escena: string
  clima: Ambiente
  controles: ControlesSala
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-900 dark:border-stone-800">
      <div className="aspect-[16/5] w-full">
        <EscenaDeGrupo escena={escena} personas={estado.conectados} ambiente={clima} controles={controles} />
      </div>
    </section>
  )
}

/** El miniperfil de alguien de la sala: su foto, su apodo con su color y lo que escribió. */
function MiniPerfil({
  persona,
  esMio,
  onCerrar,
  onEditarPerfil,
  onEditarAvatar,
}: {
  persona: Conectado | null
  esMio: boolean
  onCerrar: () => void
  onEditarPerfil: () => void
  onEditarAvatar: () => void
}) {
  const { t } = useIdioma()
  if (!persona) return null
  const a = persona.apariencia
  return (
    <Modal titulo={persona.nombre} onCerrar={onCerrar}>
      <div className="flex items-center gap-4">
        <Avatar persona={{ id: persona.id, nombre: persona.nombre, foto: a?.foto }} tamano="size-20 text-3xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-semibold" style={a?.color_apodo ? { color: a.color_apodo } : undefined}>
            {persona.nombre}
          </p>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{a?.descripcion || t.cuenta.sinDescripcion}</p>
        </div>
        {a && (
          <div className="hidden shrink-0 rounded-xl bg-gradient-to-b from-amber-50 to-orange-100 sm:block dark:from-stone-800 dark:to-stone-700">
            <AvatarPixel a={a} pose="idle" escala={1.5} />
          </div>
        )}
      </div>
      {esMio && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Boton onClick={onEditarPerfil}>
            <Pencil className="size-4" /> {t.cuenta.editarPerfil}
          </Boton>
          <Boton variante="secundario" onClick={onEditarAvatar}>
            <Shirt className="size-4" /> {t.cuenta.editarAvatar}
          </Boton>
        </div>
      )}
    </Modal>
  )
}

/** Vista pomodoro: los números grandes en blanco sobre la sala oscurecida, para concentrarse. */
function VistaPomodoro({
  estado,
  escena,
  clima,
  ahoraServidor,
  onCerrar,
}: {
  estado: EstadoSala
  escena: string
  clima: Ambiente
  ahoraServidor: () => number
  onCerrar: () => void
}) {
  const { t } = useIdioma()
  const [, refrescar] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => refrescar((n) => n + 1), 250)
    const conEscape = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', conEscape)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('keydown', conEscape)
    }
  }, [onCerrar])
  const { pomodoro } = estado
  return (
    <div
      className="aparecer fixed inset-0 z-50 overflow-hidden bg-stone-950"
      role="dialog"
      aria-modal="true"
      aria-label={t.sala.vistaPomodoro}
    >
      <div className="absolute inset-0">
        <EscenaDeGrupo escena={escena} personas={estado.conectados} ambiente={clima} cubrir />
      </div>
      <div className="absolute inset-0 bg-black/60" />
      <button
        onClick={onCerrar}
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/25"
        aria-label={t.sala.salirVista}
        title={t.sala.salirVista}
      >
        <X className="size-6" />
      </button>
      <div className="relative flex h-full flex-col items-center justify-center text-white select-none">
        <span className="font-['Pixelify_Sans'] text-[clamp(5rem,22vw,17rem)] leading-none tabular-nums drop-shadow-[0_4px_0_rgba(0,0,0,0.35)]">
          {tiempoRestante(pomodoro, ahoraServidor)}
        </span>
        <span className="mt-4 font-['Pixelify_Sans'] text-[clamp(1.2rem,3vw,2rem)] text-white/80">
          {t.sala.fases[pomodoro.fase]} · {t.sala.bloques(pomodoro.ciclos)}
        </span>
      </div>
    </div>
  )
}

/** En "Mi sala": tu personaje en su escritorio. Tocar la ventana cambia el clima. */
function EscenaPersonal({
  estado,
  usuario,
  clima,
  onClima,
}: {
  estado: EstadoSala
  usuario: Usuario
  clima: Ambiente
  onClima: () => void
}) {
  const { t } = useIdioma()
  const yo = estado.conectados.find((c) => c.id === usuario.id)
  if (!yo) return null
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-900 dark:border-stone-800">
      <div className="aspect-[16/10] w-full">
        <EscenaSola persona={yo} ambiente={clima} onClima={onClima} etiquetaClima={t.sala.cambiarClima} />
      </div>
    </section>
  )
}

function Pestana({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        activa
          ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
          : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
      }`}
    >
      {children}
    </button>
  )
}

/** El pomodoro en chiquito, para tenerlo a la vista mientras se dibuja. */
function MiniReloj({ pomodoro, ahoraServidor }: { pomodoro: EstadoPomodoro; ahoraServidor: () => number }) {
  const { t } = useIdioma()
  const [, refrescar] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => refrescar((n) => n + 1), 500)
    return () => window.clearInterval(id)
  }, [])
  const restante = pomodoro.corriendo && pomodoro.fin ? pomodoro.fin - ahoraServidor() : pomodoro.restante
  return (
    <span className="ml-auto flex items-center gap-2 pr-1 text-sm text-stone-500 dark:text-stone-400">
      <span className={`size-2 rounded-full ${pomodoro.fase === 'estudio' ? 'bg-indigo-500' : 'bg-emerald-500'}`} aria-hidden />
      {t.sala.fases[pomodoro.fase]} · <span className="font-mono tabular-nums">{formatear(restante)}</span>
    </span>
  )
}

function formatear(segundos: number) {
  const s = Math.max(0, Math.ceil(segundos))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function Pomodoro({
  pomodoro,
  ahoraServidor,
  enviar,
  onCerrar,
  onVista,
}: {
  pomodoro: EstadoPomodoro | null
  ahoraServidor: () => number
  enviar: (m: object) => void
  onCerrar?: () => void
  onVista?: () => void
}) {
  const { t } = useIdioma()
  const [, refrescar] = useState(0)
  const [ajustes, setAjustes] = useState(false)
  const [estudio, setEstudio] = useState(25)
  const [descanso, setDescanso] = useState(5)

  useEffect(() => {
    const id = window.setInterval(() => refrescar((n) => n + 1), 250)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (pomodoro && !ajustes) {
      setEstudio(pomodoro.estudio / 60)
      setDescanso(pomodoro.descanso / 60)
    }
  }, [pomodoro, ajustes])

  const restante = pomodoro ? (pomodoro.corriendo && pomodoro.fin ? pomodoro.fin - ahoraServidor() : pomodoro.restante) : 0
  const total = pomodoro ? (pomodoro.fase === 'estudio' ? pomodoro.estudio : pomodoro.descanso) : 1
  const progreso = Math.min(1, Math.max(0, 1 - restante / total))
  const reloj = formatear(restante)

  // El tiempo también se ve en la pestaña del navegador
  useEffect(() => {
    if (!pomodoro) return
    const anterior = document.title
    document.title = `${reloj} · ${t.sala.fases[pomodoro.fase]}`
    return () => {
      document.title = anterior
    }
  }, [reloj, pomodoro, t])

  const radioCirculo = 88
  const circunferencia = 2 * Math.PI * radioCirculo
  const color = pomodoro?.fase === 'descanso' ? 'text-emerald-500' : 'text-indigo-500'

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-center gap-2">
        <Timer className="size-4 text-indigo-600 dark:text-indigo-400" />
        <h2 className="flex-1 font-semibold">{t.sala.pomodoro}</h2>
        <Boton
          variante="fantasma"
          className="px-2"
          onClick={() => setAjustes((a) => !a)}
          aria-label={t.sala.ajustes}
          title={t.sala.ajustes}
        >
          <Settings2 className="size-4" />
        </Boton>
        {onCerrar && (
          <Boton variante="fantasma" className="px-2" onClick={onCerrar} aria-label={t.sala.cerrar} title={t.sala.cerrar}>
            <X className="size-4" />
          </Boton>
        )}
      </div>

      <div className="mt-2 flex flex-col items-center">
        <div className="relative size-52">
          <svg viewBox="0 0 200 200" className="size-full -rotate-90">
            <circle cx="100" cy="100" r={radioCirculo} className="fill-none stroke-stone-200 dark:stroke-stone-800" strokeWidth="10" />
            <circle
              cx="100"
              cy="100"
              r={radioCirculo}
              className={`fill-none stroke-current transition-[stroke-dashoffset] duration-300 ${color}`}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circunferencia}
              strokeDashoffset={circunferencia * (1 - progreso)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-semibold tabular-nums">{reloj}</span>
            <span className={`mt-1 text-sm font-medium ${color}`}>{pomodoro ? t.sala.fases[pomodoro.fase] : '…'}</span>
          </div>
        </div>
        {pomodoro && <p className="text-sm text-stone-500 dark:text-stone-400">{t.sala.bloques(pomodoro.ciclos)}</p>}
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Boton
          onClick={() => enviar({ tipo: 'pomodoro', accion: pomodoro?.corriendo ? 'pausar' : 'iniciar' })}
          disabled={!pomodoro}
          className="min-w-28"
        >
          {pomodoro?.corriendo ? <Pause className="size-4" /> : <Play className="size-4" />}
          {pomodoro?.corriendo ? t.sala.pausar : t.sala.iniciar}
        </Boton>
        <Boton variante="secundario" onClick={() => enviar({ tipo: 'pomodoro', accion: 'saltar' })} disabled={!pomodoro}>
          <SkipForward className="size-4" /> {t.sala.saltar}
        </Boton>
        <Boton variante="fantasma" onClick={() => enviar({ tipo: 'pomodoro', accion: 'reiniciar' })} disabled={!pomodoro}>
          <RotateCcw className="size-4" /> {t.sala.reiniciar}
        </Boton>
        {onVista && (
          <Boton variante="secundario" onClick={onVista} disabled={!pomodoro}>
            <Maximize2 className="size-4" /> {t.sala.vistaPomodoro}
          </Boton>
        )}
      </div>

      {ajustes && (
        <form
          className="mt-4 flex flex-wrap items-end justify-center gap-3 rounded-xl bg-stone-100 p-3 dark:bg-stone-800/60"
          onSubmit={(e) => {
            e.preventDefault()
            enviar({ tipo: 'pomodoro', accion: 'configurar', estudio, descanso })
            setAjustes(false)
          }}
        >
          <label className="text-sm">
            <span className="block font-medium">{t.sala.minutosEstudio}</span>
            <input
              type="number"
              min={5}
              max={90}
              value={estudio}
              onChange={(e) => setEstudio(Number(e.target.value))}
              className="mt-1 w-24 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-stone-700 dark:bg-stone-950"
            />
          </label>
          <label className="text-sm">
            <span className="block font-medium">{t.sala.minutosDescanso}</span>
            <input
              type="number"
              min={1}
              max={30}
              value={descanso}
              onChange={(e) => setDescanso(Number(e.target.value))}
              className="mt-1 w-24 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-stone-700 dark:bg-stone-950"
            />
          </label>
          <Boton type="submit">{t.sala.aplicar}</Boton>
        </form>
      )}
      <p className="mt-3 text-center text-xs text-stone-400">{t.sala.pomodoroAyuda}</p>
    </section>
  )
}

/** El botón del encabezado que muestra el tiempo del pomodoro y lo abre. */
function BotonReloj({
  pomodoro,
  ahoraServidor,
  activo,
  onClick,
  etiqueta,
}: {
  pomodoro: EstadoPomodoro
  ahoraServidor: () => number
  activo: boolean
  onClick: () => void
  etiqueta: string
}) {
  const [, refrescar] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => refrescar((n) => n + 1), 500)
    return () => window.clearInterval(id)
  }, [])
  return (
    <Boton variante={activo ? 'primario' : 'secundario'} onClick={onClick} aria-pressed={activo} title={etiqueta}>
      <span className={`size-2 rounded-full ${pomodoro.fase === 'estudio' ? 'bg-amber-400' : 'bg-emerald-400'}`} aria-hidden />
      <span className="font-mono tabular-nums">{tiempoRestante(pomodoro, ahoraServidor)}</span>
    </Boton>
  )
}

/** El pomodoro en chiquito, desplegado desde el encabezado de la sala grupal. */
function PomodoroCompacto({
  pomodoro,
  ahoraServidor,
  enviar,
  onCerrar,
  onVista,
}: {
  pomodoro: EstadoPomodoro | null
  ahoraServidor: () => number
  enviar: (m: object) => void
  onCerrar: () => void
  onVista: () => void
}) {
  const { t } = useIdioma()
  const [, refrescar] = useState(0)
  const [ajustes, setAjustes] = useState(false)
  const [estudio, setEstudio] = useState(25)
  const [descanso, setDescanso] = useState(5)
  useEffect(() => {
    const id = window.setInterval(() => refrescar((n) => n + 1), 250)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    if (pomodoro && !ajustes) {
      setEstudio(pomodoro.estudio / 60)
      setDescanso(pomodoro.descanso / 60)
    }
  }, [pomodoro, ajustes])
  const restante = pomodoro ? (pomodoro.corriendo && pomodoro.fin ? pomodoro.fin - ahoraServidor() : pomodoro.restante) : 0
  const total = pomodoro ? (pomodoro.fase === 'estudio' ? pomodoro.estudio : pomodoro.descanso) : 1
  const progreso = Math.min(1, Math.max(0, 1 - restante / total))
  const reloj = formatear(restante)
  // El tiempo también se ve en la pestaña del navegador
  useEffect(() => {
    if (!pomodoro) return
    const anterior = document.title
    document.title = `${reloj} · ${t.sala.fases[pomodoro.fase]}`
    return () => {
      document.title = anterior
    }
  }, [reloj, pomodoro, t])
  const descansando = pomodoro?.fase === 'descanso'
  const icono =
    'rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40 dark:hover:bg-stone-800 dark:hover:text-stone-200'

  return (
    <section className="w-64 rounded-2xl border border-stone-200 bg-white p-3 shadow-xl dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-center gap-1">
        <Timer className="size-4 text-indigo-600 dark:text-indigo-400" />
        <h2 className="flex-1 text-sm font-semibold">{t.sala.pomodoro}</h2>
        <button onClick={() => setAjustes((a) => !a)} className={icono} aria-label={t.sala.ajustes} title={t.sala.ajustes}>
          <Settings2 className="size-4" />
        </button>
        <button onClick={onCerrar} className={icono} aria-label={t.sala.cerrar} title={t.sala.cerrar}>
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="font-mono text-4xl font-semibold tabular-nums">{reloj}</span>
        <span className={`text-xs font-medium ${descansando ? 'text-emerald-600' : 'text-indigo-600 dark:text-indigo-400'}`}>
          {pomodoro ? t.sala.fases[pomodoro.fase] : '…'}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${descansando ? 'bg-emerald-500' : 'bg-indigo-500'}`}
          style={{ width: `${progreso * 100}%` }}
        />
      </div>
      {pomodoro && <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">{t.sala.bloques(pomodoro.ciclos)}</p>}
      <div className="mt-3 flex items-center gap-1">
        <Boton
          className="flex-1 py-1.5 text-sm"
          onClick={() => enviar({ tipo: 'pomodoro', accion: pomodoro?.corriendo ? 'pausar' : 'iniciar' })}
          disabled={!pomodoro}
        >
          {pomodoro?.corriendo ? <Pause className="size-4" /> : <Play className="size-4" />}
          {pomodoro?.corriendo ? t.sala.pausar : t.sala.iniciar}
        </Boton>
        <button
          onClick={() => enviar({ tipo: 'pomodoro', accion: 'saltar' })}
          disabled={!pomodoro}
          className={icono}
          title={t.sala.saltar}
          aria-label={t.sala.saltar}
        >
          <SkipForward className="size-4" />
        </button>
        <button
          onClick={() => enviar({ tipo: 'pomodoro', accion: 'reiniciar' })}
          disabled={!pomodoro}
          className={icono}
          title={t.sala.reiniciar}
          aria-label={t.sala.reiniciar}
        >
          <RotateCcw className="size-4" />
        </button>
        <button onClick={onVista} disabled={!pomodoro} className={icono} title={t.sala.vistaPomodoro} aria-label={t.sala.vistaPomodoro}>
          <Maximize2 className="size-4" />
        </button>
      </div>
      {ajustes && (
        <form
          className="mt-3 flex items-end gap-2 rounded-xl bg-stone-100 p-2 dark:bg-stone-800/60"
          onSubmit={(e) => {
            e.preventDefault()
            enviar({ tipo: 'pomodoro', accion: 'configurar', estudio, descanso })
            setAjustes(false)
          }}
        >
          <label className="text-xs">
            <span className="block font-medium">{t.sala.minutosEstudio}</span>
            <input
              type="number"
              min={5}
              max={90}
              value={estudio}
              onChange={(e) => setEstudio(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1 dark:border-stone-700 dark:bg-stone-950"
            />
          </label>
          <label className="text-xs">
            <span className="block font-medium">{t.sala.minutosDescanso}</span>
            <input
              type="number"
              min={1}
              max={30}
              value={descanso}
              onChange={(e) => setDescanso(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1 dark:border-stone-700 dark:bg-stone-950"
            />
          </label>
          <Boton type="submit" className="px-2.5 py-1 text-xs">
            {t.sala.aplicar}
          </Boton>
        </form>
      )}
    </section>
  )
}

function ChatSala({
  chat,
  usuario,
  conectados,
  enviar,
  onCerrar,
  compacto = false,
}: {
  chat: LineaChat[]
  usuario: Usuario
  conectados: Conectado[]
  enviar: (m: object) => void
  onCerrar?: () => void
  compacto?: boolean // desplegable del encabezado
}) {
  const { t } = useIdioma()
  const [texto, setTexto] = useState('')
  const lista = useRef<HTMLDivElement>(null)

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: 'smooth' })
  }, [chat])

  function describir(linea: Extract<LineaChat, { tipo: 'evento' }>) {
    const e = linea.evento
    if (e.evento === 'fase') return t.sala.eventos[e.fase]
    if (e.evento === 'pomodoro') {
      const texto = t.sala.eventos[e.accion as 'iniciar' | 'pausar' | 'saltar' | 'reiniciar' | 'configurar']
      return texto ? texto(e.nombre) : null
    }
    if (e.evento === 'monedas') return t.sala.eventos.monedas(e.ganadas)
    if (e.evento === 'aviso' || e.evento === 'archivos') return null
    if (e.evento === 'archivo') return t.sala.eventos.archivo(e.nombre, e.archivo)
    if (e.evento === 'trivia') return t.sala.eventos.trivia(e.nombre, e.tema)
    return t.sala.eventos[e.evento](e.nombre)
  }

  return (
    <section
      className={`flex flex-col rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 ${
        compacto ? 'h-[min(28rem,70dvh)] shadow-xl' : 'min-h-[28rem] lg:h-[calc(100dvh-12rem)]'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-stone-200 px-5 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">{t.sala.chat}</h2>
        <span className="truncate text-xs text-stone-500">{conectados.map((c) => c.nombre).join(', ')}</span>
        {onCerrar && (
          <button
            onClick={onCerrar}
            className="rounded-lg p-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            aria-label={t.sala.cerrar}
            title={t.sala.cerrar}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <div ref={lista} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {chat.length === 0 && <p className="py-10 text-center text-sm text-stone-400">{t.sala.sinMensajes}</p>}
        {chat.map((linea) => {
          if (linea.tipo === 'evento') {
            const descripcion = describir(linea)
            return descripcion ? (
              <p key={linea.id} className="text-center text-xs text-stone-400">
                {descripcion}
              </p>
            ) : null
          }
          const m = linea.mensaje
          const propio = m.usuario_id === usuario.id
          return (
            <div key={m.id} className={`flex gap-2 ${propio ? 'flex-row-reverse' : ''}`}>
              <Avatar persona={{ id: m.usuario_id ?? 0, nombre: m.nombre }} tamano="size-7" />
              <div className={`max-w-[80%] ${propio ? 'text-right' : ''}`}>
                <p className="text-xs text-stone-500">
                  {m.nombre} {propio && t.sala.vos} ·{' '}
                  {new Date(m.creado + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p
                  className={`mt-0.5 inline-block rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap ${
                    propio ? 'rounded-tr-md bg-indigo-600 text-white' : 'rounded-tl-md bg-stone-100 dark:bg-stone-800'
                  }`}
                >
                  {m.texto}
                </p>
              </div>
            </div>
          )
        })}
      </div>
      <form
        className="flex items-center gap-2 border-t border-stone-200 p-3 dark:border-stone-800"
        onSubmit={(e) => {
          e.preventDefault()
          if (!texto.trim()) return
          enviar({ tipo: 'chat', texto })
          setTexto('')
        }}
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={500}
          placeholder={t.sala.escribiMensaje}
          aria-label={t.sala.escribiMensaje}
          className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-stone-700 dark:bg-stone-950"
        />
        <Boton type="submit" className="px-3" disabled={!texto.trim()} aria-label={t.enviar}>
          <Send className="size-4" />
        </Boton>
      </form>
    </section>
  )
}

function ElegirNombre({ onGuardar }: { onGuardar: (nombre: string) => Promise<void> }) {
  const { t } = useIdioma()
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:flex-row sm:items-end dark:border-indigo-900 dark:bg-indigo-950/50"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!nombre.trim()) return
        setGuardando(true)
        setError(null)
        try {
          await onGuardar(nombre.trim())
        } catch (err) {
          setError(mensajeDeError(err))
          setGuardando(false)
        }
      }}
    >
      <label className="flex-1">
        <span className="block font-medium">{t.sala.comoTeLlamas}</span>
        <span className="block text-sm text-stone-600 dark:text-stone-300">{t.sala.comoTeLlamasDetalle}</span>
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={80}
          aria-label={t.sala.comoTeLlamas}
          className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:border-indigo-400 dark:border-stone-700 dark:bg-stone-950"
        />
        {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
      </label>
      <Boton type="submit" disabled={!nombre.trim()} cargando={guardando}>
        {t.guardar}
      </Boton>
    </form>
  )
}
