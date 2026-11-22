import { ArrowRight, Camera, FileText, Layers, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { api, mensajeDeError } from '../api'
import { SelectorIdioma, useIdioma } from '../i18n'
import { SelectorTema } from '../tema'
import type { Usuario } from '../types'
import { Aviso, Boton, campo } from './ui'

const ICONOS = [FileText, Camera, MessageSquare, Layers]

export default function Login({ onEntrar }: { onEntrar: (usuario: Usuario) => void }) {
  const { t } = useIdioma()
  const [modo, setModo] = useState<'registro' | 'entrar'>('registro')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState<'form' | 'invitado' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function ejecutar(tipo: 'form' | 'invitado', accion: () => Promise<Usuario>) {
    setCargando(tipo)
    setError(null)
    try {
      onEntrar(await accion())
    } catch (e) {
      setError(mensajeDeError(e))
      setCargando(null)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-14">
      {/* Fondo decorativo */}
      <div className="pointer-events-none absolute -top-40 -left-40 size-[32rem] rounded-full bg-indigo-300/30 blur-3xl dark:bg-indigo-700/20" />
      <div className="pointer-events-none absolute -right-40 -bottom-40 size-[32rem] rounded-full bg-fuchsia-300/25 blur-3xl dark:bg-fuchsia-800/15" />

      <div className="absolute top-4 right-4 flex items-center gap-1.5">
        <SelectorTema />
        <SelectorIdioma />
      </div>

      <div className="relative grid w-full max-w-5xl items-center gap-12 md:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}icono.svg`} alt="" className="size-11 drop-shadow-md [image-rendering:pixelated]" />
            <span className="text-2xl font-semibold tracking-tight">Repasito</span>
          </div>
          <h1 className="mt-8 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            {t.lema}{' '}
            <span className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-transparent">{t.lemaResaltado}</span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-stone-600 dark:text-stone-300">{t.subtitulo}</p>
          <ul className="mt-8 space-y-4">
            {t.ventajas.map((texto, i) => {
              const Icono = ICONOS[i]
              return (
                <li key={texto} className="flex gap-3 text-stone-700 dark:text-stone-300">
                  <span className="mt-0.5 rounded-lg bg-white p-1.5 text-indigo-600 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:text-indigo-400 dark:ring-stone-800">
                    <Icono className="size-4" />
                  </span>
                  {texto}
                </li>
              )
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white/90 p-6 shadow-xl shadow-stone-900/5 backdrop-blur sm:p-8 dark:border-stone-800 dark:bg-stone-900/90">
          <Boton
            className="w-full py-3 text-base"
            cargando={cargando === 'invitado'}
            disabled={cargando !== null}
            onClick={() => ejecutar('invitado', api.entrarComoInvitado)}
          >
            {t.probarSinCuenta} <ArrowRight className="size-4" />
          </Boton>
          <p className="mt-2 text-center text-xs text-stone-500 dark:text-stone-400">{t.probarSinCuentaDetalle}</p>

          <div className="my-6 flex items-center gap-3 text-xs text-stone-400">
            <div className="h-px flex-1 bg-stone-200 dark:bg-stone-800" /> {t.oConTuCuenta}{' '}
            <div className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-lg bg-stone-100 p-1 dark:bg-stone-800">
            {(['registro', 'entrar'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setModo(m)
                  setError(null)
                }}
                className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
                  modo === m ? 'bg-white shadow-sm dark:bg-stone-950' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                {m === 'registro' ? t.crearCuenta : t.entrar}
              </button>
            ))}
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              ejecutar('form', () => (modo === 'registro' ? api.registrarse(nombre, email, password) : api.entrar(email, password)))
            }}
          >
            {modo === 'registro' && (
              <label className="block">
                <span className="text-sm font-medium">{t.nombre}</span>
                <input
                  required
                  maxLength={80}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  autoComplete="given-name"
                  className={campo}
                />
              </label>
            )}
            <label className="block">
              <span className="text-sm font-medium">{t.email}</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className={campo}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t.contrasena}</span>
              <input
                required
                type="password"
                minLength={modo === 'registro' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
                className={campo}
              />
              {modo === 'registro' && <span className="mt-1 block text-xs text-stone-500">{t.minimoCaracteres}</span>}
            </label>
            {error && <Aviso>{error}</Aviso>}
            <Boton type="submit" variante="secundario" cargando={cargando === 'form'} disabled={cargando !== null} className="w-full">
              {modo === 'registro' ? t.crearCuenta : t.entrar}
            </Boton>
          </form>
        </div>
      </div>
    </div>
  )
}
