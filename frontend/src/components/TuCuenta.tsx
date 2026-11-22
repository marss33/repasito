import { Camera, Check, Loader2, Trash2, UserPlus } from 'lucide-react'
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { api, mensajeDeError, urlApi } from '../api'
import { useIdioma } from '../i18n'
import type { Usuario } from '../types'
import { Aviso, Boton, campo, Modal } from './ui'

/** Achica la foto en el navegador (cuadrada, 256 px) antes de mandarla. */
export async function prepararFoto(archivo: File): Promise<string> {
  const imagen = await createImageBitmap(archivo)
  const lado = Math.min(imagen.width, imagen.height)
  const lienzo = document.createElement('canvas')
  lienzo.width = lienzo.height = 256
  lienzo.getContext('2d')!.drawImage(imagen, (imagen.width - lado) / 2, (imagen.height - lado) / 2, lado, lado, 0, 0, 256, 256)
  return lienzo.toDataURL('image/jpeg', 0.88)
}

/** Avisa a la sala abierta (si hay) que cambió el perfil (apodo, foto, color o descripción), para que los demás lo vean ya. */
export const EVENTO_APODO = 'repaso:apodo'

export function FotoDeUsuario({ usuario, tamano = 'size-8', texto = 'text-sm' }: { usuario: Usuario; tamano?: string; texto?: string }) {
  return (
    <span
      className={`${tamano} ${texto} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100 font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300`}
    >
      {usuario.foto ? (
        <img src={urlApi(`/rincon/foto/${usuario.id}?v=${usuario.foto}`)} alt="" className="size-full object-cover" />
      ) : (
        usuario.nombre.charAt(0).toUpperCase()
      )}
    </span>
  )
}

export const COLORES_DE_APODO = ['', '#c25b56', '#e0803a', '#d4a020', '#4f8a5b', '#3d8f8a', '#3f6aa0', '#6a5ab0', '#b05a98', '#d97a9a']

/** Editar perfil: foto, apodo, color del apodo y descripción. Sirve igual para invitados y para cuentas registradas. */
export default function TuCuenta({
  usuario,
  onUsuario,
  onCerrar,
  onGuardarCuenta,
}: {
  usuario: Usuario
  onUsuario: (u: Usuario) => void
  onCerrar: () => void
  onGuardarCuenta: () => void
}) {
  const { t } = useIdioma()
  const c = t.cuenta
  const [apodo, setApodo] = useState(usuario.nombre)
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [color, setColor] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [perfilGuardado, setPerfilGuardado] = useState({ color: '', descripcion: '' })
  const [guardandoPerfil, setGuardandoPerfil] = useState(false)
  const [perfilListo, setPerfilListo] = useState(false)

  useEffect(() => {
    api
      .rincon()
      .then((r) => {
        const actual = { color: r.apariencia.color_apodo ?? '', descripcion: r.apariencia.descripcion ?? '' }
        setColor(actual.color)
        setDescripcion(actual.descripcion)
        setPerfilGuardado(actual)
      })
      .catch(() => {})
  }, [])

  const avisarALaSala = (nombre: string) => window.dispatchEvent(new CustomEvent(EVENTO_APODO, { detail: nombre }))

  async function guardarPerfil(e: FormEvent) {
    e.preventDefault()
    setGuardandoPerfil(true)
    setError(null)
    try {
      await api.cambiarPerfil({ color_apodo: color, descripcion })
      setPerfilGuardado({ color, descripcion })
      avisarALaSala(usuario.nombre)
      setPerfilListo(true)
      setTimeout(() => setPerfilListo(false), 2000)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setGuardandoPerfil(false)
    }
  }

  async function guardarApodo(e: FormEvent) {
    e.preventDefault()
    const nuevo = apodo.trim()
    if (!nuevo || nuevo === usuario.nombre) return
    setGuardando(true)
    setError(null)
    try {
      const actualizado = await api.cambiarNombre(nuevo)
      onUsuario(actualizado)
      avisarALaSala(actualizado.nombre)
      setListo(true)
      setTimeout(() => setListo(false), 2000)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setGuardando(false)
    }
  }

  async function elegirFoto(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setSubiendo(true)
    setError(null)
    try {
      const r = await api.subirFoto(await prepararFoto(archivo))
      onUsuario({ ...usuario, foto: r.foto, monedas: r.monedas })
      avisarALaSala(usuario.nombre)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setSubiendo(false)
    }
  }

  async function quitarFoto() {
    try {
      const r = await api.quitarFoto()
      onUsuario({ ...usuario, foto: r.foto })
      avisarALaSala(usuario.nombre)
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  return (
    <Modal titulo={c.titulo} onCerrar={onCerrar}>
      <div className="space-y-5">
        {error && <Aviso onCerrar={() => setError(null)}>{error}</Aviso>}

        <div className="flex items-center gap-4">
          <FotoDeUsuario usuario={usuario} tamano="size-16" texto="text-2xl" />
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 px-3.5 py-2 text-sm font-medium hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800">
              {subiendo ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              {usuario.foto ? c.cambiarFoto : c.subirFoto}
              <input type="file" accept="image/*" className="sr-only" onChange={elegirFoto} disabled={subiendo} />
            </label>
            {!!usuario.foto && (
              <Boton variante="fantasma" onClick={quitarFoto}>
                <Trash2 className="size-4" /> {c.quitarFoto}
              </Boton>
            )}
          </div>
        </div>

        <form onSubmit={guardarApodo}>
          <label className="text-sm font-medium" htmlFor="apodo">
            {c.apodo}
          </label>
          <p className="text-xs text-stone-500 dark:text-stone-400">{c.apodoAyuda}</p>
          <div className="mt-2 flex gap-2">
            <input
              id="apodo"
              className={`${campo} min-w-0 flex-1`}
              maxLength={30}
              value={apodo}
              onChange={(e) => setApodo(e.target.value)}
            />
            <Boton type="submit" cargando={guardando} disabled={!apodo.trim() || apodo.trim() === usuario.nombre}>
              {listo ? <Check className="size-4" /> : null}
              {listo ? c.guardado : c.guardar}
            </Boton>
          </div>
        </form>

        <form onSubmit={guardarPerfil} className="space-y-4">
          <div>
            <p className="text-sm font-medium">{c.colorApodo}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {COLORES_DE_APODO.map((col) => (
                <button
                  key={col || 'normal'}
                  type="button"
                  onClick={() => setColor(col)}
                  aria-pressed={color === col}
                  aria-label={col || c.colorApodo}
                  className={`size-7 rounded-full border-2 transition-transform hover:scale-110 ${
                    color === col
                      ? 'border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800'
                      : 'border-white shadow-sm dark:border-stone-700'
                  } ${col ? '' : 'bg-stone-800 dark:bg-stone-200'}`}
                  style={col ? { background: col } : undefined}
                />
              ))}
              <span className="ml-2 truncate text-sm font-semibold" style={color ? { color } : undefined}>
                {apodo.trim() || usuario.nombre}
              </span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="descripcion">
              {c.descripcion}
            </label>
            <p className="text-xs text-stone-500 dark:text-stone-400">{c.descripcionAyuda}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.ideas.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setDescripcion(idea)}
                  className="rounded-full border border-stone-300 px-2.5 py-1 text-xs text-stone-600 transition-colors hover:border-indigo-400 dark:border-stone-700 dark:text-stone-300"
                >
                  {idea.trim()}
                </button>
              ))}
            </div>
            <textarea
              id="descripcion"
              className={`${campo} mt-2 w-full resize-none`}
              rows={2}
              maxLength={100}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <Boton
            type="submit"
            cargando={guardandoPerfil}
            disabled={color === perfilGuardado.color && descripcion === perfilGuardado.descripcion}
          >
            {perfilListo ? <Check className="size-4" /> : null}
            {perfilListo ? c.guardado : c.guardarPerfil}
          </Boton>
        </form>

        {usuario.es_invitado ? (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-100">
            <p>{c.invitado}</p>
            <Boton className="mt-3" onClick={onGuardarCuenta}>
              <UserPlus className="size-4" /> {t.guardarMiCuenta}
            </Boton>
          </div>
        ) : (
          <p className="text-sm text-stone-500 dark:text-stone-400">{usuario.email}</p>
        )}
      </div>
    </Modal>
  )
}
