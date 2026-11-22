import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../api'
import type { Usuario } from '../types'
import SalaVista from './SalaVista'
import { Aviso, Esqueleto } from './ui'

/** La sala para estudiar solo: pomodoro, radio, pizarra y tu escena (escritorio o chimenea). */
export default function MiSala({ usuario, onUsuario }: { usuario: Usuario; onUsuario: (u: Usuario) => void }) {
  const [codigo, setCodigo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .salaPersonal()
      .then((s) => setCodigo(s.codigo))
      .catch((e) => setError(mensajeDeError(e)))
  }, [])

  if (error) return <Aviso>{error}</Aviso>
  if (!codigo) return <Esqueleto filas={3} />
  return <SalaVista codigo={codigo} usuario={usuario} onUsuario={onUsuario} personal />
}
