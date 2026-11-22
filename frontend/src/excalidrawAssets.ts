// Las fuentes de la pizarra se sirven desde nuestro propio servidor (en /fonts) y no desde un CDN:
// así funciona igual dentro de Discord, que bloquea pedidos a otros dominios.
// Tiene que importarse antes que Excalidraw.
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[]
  }
}

window.EXCALIDRAW_ASSET_PATH = `${location.origin}${import.meta.env.BASE_URL}`

export {}
