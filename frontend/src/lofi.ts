/**
 * Radio lofi generativa: la música se crea en el navegador con Web Audio, sin archivos ni copyright.
 * Cada estilo tiene su tempo, sus acordes y su color; cada compás se arma con un generador
 * pseudoaleatorio con semilla, así la música varía sin repetirse igual.
 */

export type Estacion = 'medianoche' | 'lluvia' | 'cafe' | 'atardecer' | 'invierno' | 'verano' | 'bosque' | 'espacio' | 'piano'
export const ESTACIONES: Estacion[] = ['medianoche', 'lluvia', 'cafe', 'atardecer', 'invierno', 'verano', 'bosque', 'espacio', 'piano']

/** Sonidos de fondo: cada uno los prende o apaga a gusto (no dependen de la sala ni de la música). */
export type Sonido = 'vinilo' | 'lluvia' | 'cafe' | 'fuego'
export const SONIDOS: Sonido[] = ['vinilo', 'lluvia', 'cafe', 'fuego']
const VOLUMEN_SONIDO: Record<Sonido, number> = { vinilo: 0.35, lluvia: 0.16, cafe: 0.12, fuego: 0.5 }

interface Preset {
  bpm: number
  acordes: number[][] // notas MIDI, uno por compás (se repiten en ciclo)
  swing: number // cuánto se atrasan las semicorcheas pares (0 a 0.5)
  brillo: number // frecuencia de corte del filtro general (Hz)
  melodia: number // probabilidad de nota de melodía en cada corchea
  bateria: number // volumen de la batería (0 = sin batería)
}

const PRESETS: Record<Estacion, Preset> = {
  // Fmaj7 · Em7 · Dm7 · Cmaj7: tranquila y nocturna
  medianoche: {
    bpm: 72,
    acordes: [
      [53, 57, 60, 64],
      [52, 55, 59, 62],
      [50, 53, 57, 60],
      [48, 52, 55, 59],
    ],
    swing: 0.18,
    brillo: 1900,
    melodia: 0.22,
    bateria: 1,
  },
  // Am7 · Fmaj7 · Cmaj7 · G: melancólica, con lluvia en la ventana
  lluvia: {
    bpm: 66,
    acordes: [
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [48, 52, 55, 59],
      [50, 55, 59, 62],
    ],
    swing: 0.14,
    brillo: 1600,
    melodia: 0.15,
    bateria: 0.9,
  },
  // Dm9 · G13 · Cmaj9 · A7: más movida, de cafetería
  cafe: {
    bpm: 84,
    acordes: [
      [50, 53, 57, 60, 64],
      [53, 59, 62, 64],
      [48, 52, 55, 59, 62],
      [49, 55, 57, 61],
    ],
    swing: 0.22,
    brillo: 2600,
    melodia: 0.3,
    bateria: 1,
  },
  // Ebmaj7 · Cm7 · Abmaj7 · Bb7: cálida, de atardecer
  atardecer: {
    bpm: 76,
    acordes: [
      [51, 55, 58, 62],
      [48, 51, 55, 58],
      [56, 60, 63, 67],
      [50, 53, 56, 58],
    ],
    swing: 0.2,
    brillo: 2100,
    melodia: 0.25,
    bateria: 1,
  },
  // Dm9 · Bbmaj7 · Gm7 · Asus4: lenta y abrigada
  invierno: {
    bpm: 64,
    acordes: [
      [50, 53, 57, 60, 64],
      [46, 50, 53, 57],
      [55, 58, 62, 65],
      [57, 62, 64],
    ],
    swing: 0.12,
    brillo: 1400,
    melodia: 0.18,
    bateria: 0.75,
  },
  // Cmaj9 · Am9 · Fmaj9 · G6: luminosa, de verano
  verano: {
    bpm: 92,
    acordes: [
      [48, 52, 55, 59, 62],
      [45, 48, 52, 55, 59],
      [53, 57, 60, 64, 67],
      [55, 59, 62, 64],
    ],
    swing: 0.2,
    brillo: 3000,
    melodia: 0.32,
    bateria: 1,
  },
  // Gmaj7 · Em9 · Cmaj9 · Dsus4: suave, de bosque
  bosque: {
    bpm: 70,
    acordes: [
      [55, 59, 62, 66],
      [52, 55, 59, 62, 66],
      [48, 52, 55, 59, 62],
      [50, 55, 57],
    ],
    swing: 0.16,
    brillo: 1800,
    melodia: 0.24,
    bateria: 0.7,
  },
  // Dmaj9 · Bm9 · Gmaj9 · Asus2: flotante, espacial
  espacio: {
    bpm: 58,
    acordes: [
      [50, 54, 57, 61, 64],
      [47, 50, 54, 57, 61],
      [55, 59, 62, 66, 69],
      [57, 59, 64],
    ],
    swing: 0.1,
    brillo: 1200,
    melodia: 0.2,
    bateria: 0.45,
  },
  // Cmaj7 · Em7 · Fmaj7 · Gsus4: solo piano, sin batería, para leer tranquilo
  piano: {
    bpm: 60,
    acordes: [
      [48, 52, 55, 59],
      [52, 55, 59, 62],
      [53, 57, 60, 64],
      [55, 60, 62],
    ],
    swing: 0.1,
    brillo: 2200,
    melodia: 0.4,
    bateria: 0,
  },
}

const PASOS_POR_COMPAS = 16 // semicorcheas
// Segundos que se programan por adelantado. Con la pestaña en segundo plano el navegador frena los
// temporizadores a uno por segundo, así que ahí se programa más para que la música no se corte.
const anticipacion = () => (document.hidden ? 1.6 : 0.15)

/** Generador pseudoaleatorio con semilla (mulberry32): mismos números en todos los navegadores. */
function generador(semilla: number) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function semillaDe(texto: string): number {
  let h = 2166136261
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

const frecuencia = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

interface Paso {
  bombo: boolean
  caja: boolean
  platillo: number // volumen, 0 = no suena
  acorde: boolean
  bajo: number | null
  melodia: number | null
}

/** Arma el compás `n` de una estación. Es determinista: mismo compás, mismas notas. */
function armarCompas(estacion: Estacion, n: number): Paso[] {
  const preset = PRESETS[estacion]
  const azar = generador(semillaDe(estacion) + n * 7919)
  const acorde = preset.acordes[n % preset.acordes.length]
  const raiz = acorde[0] - 12
  const escala = [0, 2, 4, 7, 9].map((i) => acorde[0] + 12 + i) // pentatónica arriba del acorde

  return Array.from({ length: PASOS_POR_COMPAS }, (_, i) => ({
    bombo: i === 0 || i === 10 || (i === 7 && azar() < 0.3),
    caja: i === 4 || i === 12,
    platillo: i % 2 === 0 && azar() > 0.15 ? 0.25 + azar() * 0.35 : 0,
    acorde: i === 0 || (i === 10 && azar() < 0.35),
    bajo: i === 0 ? raiz : i === 8 && azar() < 0.6 ? raiz + (azar() < 0.5 ? 7 : 12) : null,
    melodia: i % 2 === 0 && i > 0 && azar() < preset.melodia ? escala[Math.floor(azar() * escala.length)] : null,
  }))
}

export interface EstadoRadio {
  estacion: Estacion
  sonando: boolean
  desde: number | null // momento (epoch en segundos) en que empezó
}

export class RadioLofi {
  private ctx: AudioContext | null = null
  private salida!: GainNode
  private filtro!: BiquadFilterNode
  private ruido!: AudioBuffer
  private ambiente: AudioBufferSourceNode[] = []
  private sonidos = new Map<Sonido, GainNode>()
  private sonidosActivos = new Set<Sonido>(['vinilo'])
  private timer: number | null = null
  private estado: EstadoRadio = { estacion: 'medianoche', sonando: false, desde: null }
  private desfase = 0 // milisegundos: reloj del servidor - reloj local
  private proximoPaso = 0
  private compases = new Map<number, Paso[]>()
  private volumenActual = 0.7

  get activa(): boolean {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  /** Hay que llamarlo desde un click: los navegadores no dejan sonar audio sin que el usuario toque algo. */
  async activar(): Promise<void> {
    if (!this.ctx) this.crear()
    await this.ctx!.resume()
    this.aplicar()
  }

  volumen(valor: number) {
    this.volumenActual = valor
    if (this.ctx) this.salida.gain.setTargetAtTime(valor * 0.5, this.ctx.currentTime, 0.05)
  }

  sincronizar(estado: EstadoRadio, desfaseMs: number) {
    const cambio = estado.estacion !== this.estado.estacion || estado.desde !== this.estado.desde || estado.sonando !== this.estado.sonando
    this.estado = estado
    this.desfase = desfaseMs
    if (cambio) this.aplicar()
  }

  /** Prende o apaga los sonidos de fondo (lluvia, café, chimenea, vinilo). */
  sonidosDeFondo(activos: Set<Sonido>) {
    this.sonidosActivos = new Set(activos)
    if (!this.ctx) return
    const t = this.ctx.currentTime
    for (const [sonido, ganancia] of this.sonidos) {
      ganancia.gain.setTargetAtTime(this.sonidosActivos.has(sonido) ? VOLUMEN_SONIDO[sonido] : 0, t, 0.6)
    }
  }

  /** Sonido corto para avisar el cambio de fase del pomodoro. */
  campana() {
    if (!this.ctx || this.ctx.state !== 'running') return
    const t = this.ctx.currentTime
    ;[76, 81, 88].forEach((nota, i) => this.tecla(nota, t + i * 0.18, 0.9, 0.22, this.ctx!.destination))
  }

  detener() {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.ambiente.forEach((fuente) => fuente.stop())
    this.ctx?.close()
    this.ctx = null
  }

  // --- Interno ---

  private crear() {
    const ctx = new AudioContext()
    this.ctx = ctx
    this.salida = ctx.createGain()
    this.salida.gain.value = this.volumenActual * 0.5
    this.filtro = ctx.createBiquadFilter()
    this.filtro.type = 'lowpass'
    const compresor = ctx.createDynamicsCompressor()
    this.filtro.connect(compresor).connect(this.salida).connect(ctx.destination)

    // Ruido blanco de 2 segundos, reutilizado por la batería, la lluvia y el café
    this.ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const datos = this.ruido.getChannelData(0)
    for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1

    // Crujido de vinilo: clicks sueltos
    const vinilo = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate)
    const clicks = vinilo.getChannelData(0)
    for (let i = 0; i < clicks.length; i++)
      clicks[i] = Math.random() < 0.0004 ? (Math.random() * 2 - 1) * 0.6 : (Math.random() * 2 - 1) * 0.004
    this.bucle(vinilo, this.canalDeSonido('vinilo'))

    // Lluvia: ruido filtrado
    const filtroLluvia = ctx.createBiquadFilter()
    filtroLluvia.type = 'bandpass'
    filtroLluvia.frequency.value = 1400
    filtroLluvia.Q.value = 0.4
    filtroLluvia.connect(this.canalDeSonido('lluvia'))
    this.bucle(this.ruido, filtroLluvia)

    // Café: murmullo de gente (ruido grave que sube y baja despacio)
    const filtroCafe = ctx.createBiquadFilter()
    filtroCafe.type = 'bandpass'
    filtroCafe.frequency.value = 520
    filtroCafe.Q.value = 0.9
    const vaivenCafe = ctx.createGain()
    vaivenCafe.gain.value = 0.7
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.23
    const profundidad = ctx.createGain()
    profundidad.gain.value = 0.3
    lfo.connect(profundidad).connect(vaivenCafe.gain)
    lfo.start()
    filtroCafe.connect(vaivenCafe).connect(this.canalDeSonido('cafe'))
    this.bucle(this.ruido, filtroCafe, 0.8)

    // Chimenea: chasquidos de leña y un rumor grave
    const fuego = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
    const chispas = fuego.getChannelData(0)
    let rumor = 0
    for (let i = 0; i < chispas.length; i++) {
      rumor = rumor * 0.995 + (Math.random() * 2 - 1) * 0.02
      const chasquido = Math.random() < 0.00025 ? (Math.random() * 2 - 1) * 0.9 : 0
      chispas[i] = rumor * 0.6 + chasquido
    }
    const filtroFuego = ctx.createBiquadFilter()
    filtroFuego.type = 'lowpass'
    filtroFuego.frequency.value = 2600
    filtroFuego.connect(this.canalDeSonido('fuego'))
    this.bucle(fuego, filtroFuego)

    this.timer = window.setInterval(() => this.programar(), 25)
  }

  private canalDeSonido(sonido: Sonido): GainNode {
    const g = this.ctx!.createGain()
    g.gain.value = this.sonidosActivos.has(sonido) ? VOLUMEN_SONIDO[sonido] : 0
    g.connect(this.salida)
    this.sonidos.set(sonido, g)
    return g
  }

  private bucle(buffer: AudioBuffer, destino: AudioNode, offset = 0) {
    const fuente = this.ctx!.createBufferSource()
    fuente.buffer = buffer
    fuente.loop = true
    fuente.connect(destino)
    fuente.start(0, offset)
    this.ambiente.push(fuente)
  }

  private aplicar() {
    if (!this.ctx) return
    const preset = PRESETS[this.estado.estacion]
    const t = this.ctx.currentTime
    this.filtro.frequency.setTargetAtTime(preset.brillo, t, 0.3)
    this.compases.clear()
    this.proximoPaso = Math.ceil(this.posicion() / this.duracionPaso())
  }

  private duracionPaso() {
    return 60 / PRESETS[this.estado.estacion].bpm / 4
  }

  /** Segundos desde que empezó a sonar el estilo actual. */
  private posicion() {
    if (this.estado.desde === null) return 0
    return (Date.now() + this.desfase) / 1000 - this.estado.desde
  }

  private programar() {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running' || !this.estado.sonando) return
    const preset = PRESETS[this.estado.estacion]
    const paso = this.duracionPaso()
    const ahora = this.posicion()
    if (this.proximoPaso * paso < ahora - 1) this.proximoPaso = Math.ceil(ahora / paso) // se trabó la pestaña

    const hasta = ahora + anticipacion()
    while (this.proximoPaso * paso < hasta) {
      const n = this.proximoPaso
      const compas = Math.floor(n / PASOS_POR_COMPAS)
      const i = n % PASOS_POR_COMPAS
      if (!this.compases.has(compas)) {
        this.compases.set(compas, armarCompas(this.estado.estacion, compas))
        this.compases.delete(compas - 2)
      }
      const swing = i % 2 === 1 ? preset.swing * paso : 0
      const cuando = ctx.currentTime + (n * paso + swing - ahora)
      if (cuando >= ctx.currentTime - 0.01) this.tocar(this.compases.get(compas)![i], Math.max(cuando, ctx.currentTime), compas, preset)
      this.proximoPaso++
    }
  }

  private tocar(paso: Paso, t: number, compas: number, preset: Preset) {
    const duracionCompas = this.duracionPaso() * PASOS_POR_COMPAS
    const bateria = preset.bateria
    if (bateria > 0) {
      if (paso.bombo) this.bombo(t, bateria)
      if (paso.caja) this.caja(t, bateria)
      if (paso.platillo) this.platillo(t, paso.platillo * bateria)
    }
    if (paso.acorde) {
      const acorde = preset.acordes[compas % preset.acordes.length]
      acorde.forEach((nota, k) => this.tecla(nota, t + k * 0.012, duracionCompas * 0.95, 0.09, this.filtro))
    }
    if (paso.bajo !== null) this.bajo(paso.bajo, t, duracionCompas / 2.2)
    if (paso.melodia !== null) this.tecla(paso.melodia, t, 0.6, 0.06, this.filtro)
  }

  /** Piano eléctrico: dos senoidales (una una octava arriba, suave) con caída lenta. */
  private tecla(nota: number, t: number, duracion: number, volumen: number, destino: AudioNode) {
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(volumen, t + 0.008)
    g.gain.exponentialRampToValueAtTime(volumen * 0.35, t + 0.6)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duracion)
    g.connect(destino)
    ;[
      [1, 1],
      [2, 0.18],
    ].forEach(([multiplo, nivel]) => {
      const osc = ctx.createOscillator()
      osc.frequency.value = frecuencia(nota) * multiplo
      osc.detune.value = (Math.random() - 0.5) * 8
      const nivelOsc = ctx.createGain()
      nivelOsc.gain.value = nivel
      osc.connect(nivelOsc).connect(g)
      osc.start(t)
      osc.stop(t + duracion + 0.05)
    })
  }

  private bajo(nota: number, t: number, duracion: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = frecuencia(nota)
    const filtro = ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.frequency.value = 420
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.32, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duracion)
    osc.connect(filtro).connect(g).connect(this.filtro)
    osc.start(t)
    osc.stop(t + duracion + 0.05)
  }

  private bombo(t: number, nivel: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(115, t)
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.75 * nivel, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38)
    osc.connect(g).connect(this.filtro)
    osc.start(t)
    osc.stop(t + 0.4)
  }

  private golpeDeRuido(t: number, tipo: BiquadFilterType, frecuenciaFiltro: number, volumen: number, duracion: number) {
    const ctx = this.ctx!
    const fuente = ctx.createBufferSource()
    fuente.buffer = this.ruido
    const filtro = ctx.createBiquadFilter()
    filtro.type = tipo
    filtro.frequency.value = frecuenciaFiltro
    const g = ctx.createGain()
    g.gain.setValueAtTime(volumen, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duracion)
    fuente.connect(filtro).connect(g).connect(this.filtro)
    fuente.start(t, Math.random() * 1.5)
    fuente.stop(t + duracion + 0.02)
  }

  private caja(t: number, nivel: number) {
    this.golpeDeRuido(t, 'bandpass', 1700, 0.32 * nivel, 0.18)
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.frequency.value = 185
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.12 * nivel, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    osc.connect(g).connect(this.filtro)
    osc.start(t)
    osc.stop(t + 0.1)
  }

  private platillo(t: number, volumen: number) {
    this.golpeDeRuido(t, 'highpass', 7500, 0.12 * volumen, 0.05)
  }
}
