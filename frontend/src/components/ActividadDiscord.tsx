import { DiscordSDK } from '@discord/embedded-app-sdk'
import { ArrowLeft, Loader2, PawPrint, Shirt } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { api, establecerToken, mensajeDeError } from '../api'
import { useIdioma, SelectorIdioma } from '../i18n'
import type { Usuario } from '../types'
import { EVENTO_APODO } from './TuCuenta'
import { Atrapaerrores, Aviso, Boton, Esqueleto } from './ui'
import { SelectorTema } from '../tema'

const SalaVista = lazy(() => import('./SalaVista'))
const Rincon = lazy(() => import('./Rincon'))
const Aplicacion = lazy(() => import('../App').then((m) => ({ default: m.Aplicacion })))

/** La app abierta como actividad dentro de Discord: entra con la cuenta de Discord (sin login) y
 * todos los que abren la actividad en el mismo canal comparten la misma sala de estudio. */
export default function ActividadDiscord() {
  const { t } = useIdioma()
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // La sala es lo principal; "Editar avatar" se abre tocando tu ícono y vuelve a la sala
  const [vista, setVista] = useState<'sala' | 'avatar'>('sala')
  // Dentro de "Editar avatar": el vestidor o la mascota y el escritorio
  const [seccionAvatar, setSeccionAvatar] = useState<'vestidor' | 'mascota'>('vestidor')

  function volverALaSala() {
    setVista('sala')
    // La sala vuelve a leer tu avatar de la base, así los demás ven el nuevo sin reconectar
    if (usuario) window.dispatchEvent(new CustomEvent(EVENTO_APODO, { detail: usuario.nombre }))
  }

  useEffect(() => {
    let cancelado = false
    async function conectar() {
      const estado = await api.estado()
      if (!estado.discord_client_id) throw new Error(t.discord.noConfigurado)
      const sdk = new DiscordSDK(estado.discord_client_id)
      await sdk.ready()
      // 1. Discord le pregunta al usuario (la primera vez) y nos da un código
      const { code } = await sdk.commands.authorize({
        client_id: estado.discord_client_id,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'guilds'],
      })
      // 2. El servidor lo cambia por una sesión de Repaso (el secreto de la app nunca llega al navegador)
      const sesion = await api.entrarConDiscord(code)
      establecerToken(sesion.sesion)
      await sdk.commands.authenticate({ access_token: sesion.access_token })
      // 3. Una sala por actividad: todos los del canal caen en la misma
      let nombre: string | undefined
      try {
        if (sdk.channelId) nombre = (await sdk.commands.getChannel({ channel_id: sdk.channelId })).name ?? undefined
      } catch {
        // sin permiso para ver el canal: la sala se llama "Discord"
      }
      const sala = await api.salaDeDiscord(sdk.instanceId, nombre ? `#${nombre}` : undefined)
      if (cancelado) return
      setUsuario(sesion.usuario)
      setCodigo(sala.codigo)
    }
    conectar().catch((e) => {
      if (cancelado) return
      // Los errores del SDK de Discord no son Error: traen { code, message }
      const detalle = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : null
      const codigo = e && typeof e === 'object' && 'code' in e ? ` (${String((e as { code: unknown }).code)})` : ''
      setError(detalle ? `${detalle}${codigo}` : mensajeDeError(e))
    })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error)
    return (
      <div className="mx-auto max-w-lg p-6">
        <Aviso>{error}</Aviso>
      </div>
    )
  if (!usuario || !codigo)
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-stone-500">
        <Loader2 className="size-5 animate-spin" /> {t.discord.conectando}
      </div>
    )
  return (
    <main className="actividad-discord mx-auto max-w-6xl px-3 py-4 sm:px-6">
      {/* Idioma y tema siempre a mano, también dentro de Discord */}
      <div className="mb-2 flex justify-end gap-1.5">
        <SelectorTema />
        <SelectorIdioma />
      </div>
      {/* La sala no se desmonta: así la música y la conexión siguen mientras se edita el avatar */}
      <div className={vista === 'sala' ? '' : 'hidden'}>
        <Atrapaerrores>
          <Suspense fallback={<Esqueleto filas={3} />}>
            <SalaVista
              codigo={codigo}
              usuario={usuario}
              onUsuario={setUsuario}
              discord
              onEditarAvatar={() => setVista('avatar')}
              misMaterias={
                <div className="-mx-3 overflow-hidden rounded-2xl border border-stone-200 sm:-mx-6 dark:border-stone-800">
                  <Aplicacion usuario={usuario} setUsuario={(u) => u && setUsuario(u)} enActividad />
                </div>
              }
            />
          </Suspense>
        </Atrapaerrores>
      </div>
      {vista === 'avatar' && (
        <>
          <nav className="mb-4 flex flex-wrap items-center gap-2">
            <Boton variante="secundario" onClick={volverALaSala}>
              <ArrowLeft className="size-4" /> {t.discord.volverALaSala}
            </Boton>
            <div className="ml-auto">
              <Menu
                opciones={[
                  { id: 'vestidor', nombre: t.rincon.vestidor, icono: <Shirt className="size-4" /> },
                  { id: 'mascota', nombre: t.rincon.mascotaYEscritorio, icono: <PawPrint className="size-4" /> },
                ]}
                actual={seccionAvatar}
                onElegir={setSeccionAvatar}
              />
            </div>
          </nav>
          <Atrapaerrores>
            <Suspense fallback={<Esqueleto filas={3} />}>
              <Rincon usuario={usuario} onUsuario={setUsuario} panelFijo={seccionAvatar} />
            </Suspense>
          </Atrapaerrores>
        </>
      )}
    </main>
  )
}

/** Un menú de pestañas chico, como el de "Mis materias / Editar avatar". */
function Menu<T extends string>({
  opciones,
  actual,
  onElegir,
}: {
  opciones: { id: T; nombre: string; icono: React.ReactNode }[]
  actual: T
  onElegir: (id: T) => void
}) {
  return (
    <div className="flex rounded-lg border border-stone-200 p-0.5 dark:border-stone-700" role="tablist">
      {opciones.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={actual === o.id}
          onClick={() => onElegir(o.id)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            actual === o.id ? 'bg-indigo-600 text-white' : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
          }`}
        >
          {o.icono}
          {o.nombre}
        </button>
      ))}
    </div>
  )
}
