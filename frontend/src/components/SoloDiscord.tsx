import { useIdioma, SelectorIdioma } from '../i18n'

/** Lo que ve quien abre la dirección de la app fuera de Discord: Repasito se usa como actividad de Discord. */
export default function SoloDiscord() {
  const { t } = useIdioma()
  const d = t.soloDiscord
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-amber-50 to-orange-100 p-6 dark:from-stone-950 dark:to-stone-900">
      <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-xl dark:border-stone-800 dark:bg-stone-900">
        <img src={`${import.meta.env.BASE_URL}icono.svg`} alt="" className="mx-auto size-20 drop-shadow-md [image-rendering:pixelated]" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Repasito</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-300">{d.detalle}</p>
        <ol className="mt-6 space-y-2 text-left text-sm text-stone-700 dark:text-stone-200">
          {d.pasos.map((paso, i) => (
            <li key={paso} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                {i + 1}
              </span>
              <span>{paso}</span>
            </li>
          ))}
        </ol>
        <SelectorIdioma className="mx-auto mt-6" />
      </div>
    </main>
  )
}
