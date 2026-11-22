const CLAVE = 'repasito:recarga-por-version'

/** Recarga la página para traer la versión nueva de la app, salvo que ya se haya recargado
 * hace menos de un minuto (así no queda en un bucle si el problema es otro). */
export function recargarPorVersionNueva(): boolean {
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE) ?? 0)
    if (Date.now() - ultima < 60_000) return false
    sessionStorage.setItem(CLAVE, String(Date.now()))
  } catch {
    // sin almacenamiento: se recarga igual
  }
  location.reload()
  return true
}

/** Errores de "no se encontró un pedazo de la app" (pasa justo después de publicar una versión). */
export function esErrorDeVersion(error: unknown): boolean {
  const texto = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Loading chunk/i.test(texto)
}
