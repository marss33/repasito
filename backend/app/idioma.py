"""Textos del backend en español e inglés.

El idioma de cada pedido sale del header `X-Idioma` (lo manda el frontend según el selector)
o, si no está, de `Accept-Language`. Por defecto, español."""

from contextvars import ContextVar

IDIOMAS = ("es", "en")
idioma_actual: ContextVar[str] = ContextVar("idioma_actual", default="es")


def elegir(valor: str | None) -> str:
    """'en', 'en-US,en;q=0.9', 'es-AR'... -> 'en' o 'es'."""
    for parte in (valor or "").split(","):
        codigo = parte.split(";")[0].strip().lower()[:2]
        if codigo in IDIOMAS:
            return codigo
    return "es"


MENSAJES: dict[str, dict[str, str]] = {
    # Cuentas
    "sesion_requerida": {"es": "Iniciá sesión para continuar.", "en": "Please log in to continue."},
    "email_en_uso": {"es": "Ya existe una cuenta con ese email.", "en": "An account with that email already exists."},
    "muchos_invitados": {
        "es": "Creaste muchas cuentas de invitado hoy. Creá una cuenta normal para seguir.",
        "en": "You've created too many guest accounts today. Sign up to keep going.",
    },
    "ya_registrada": {"es": "Tu cuenta ya está registrada.", "en": "Your account is already registered."},
    "muchos_intentos": {
        "es": "Demasiados intentos. Esperá unos minutos y probá de nuevo.",
        "en": "Too many attempts. Wait a few minutes and try again.",
    },
    "login_incorrecto": {"es": "Email o contraseña incorrectos.", "en": "Wrong email or password."},
    "limite_diario": {
        "es": "Llegaste al límite de {limite} usos de IA por hoy. Mañana se renueva.",
        "en": "You've reached today's limit of {limite} AI uses. It resets tomorrow.",
    },
    # Recursos
    "materia_no_existe": {"es": "No existe esa materia.", "en": "That subject doesn't exist."},
    "documento_no_existe": {"es": "No existe ese documento.", "en": "That document doesn't exist."},
    "flashcard_no_existe": {"es": "No existe esa flashcard.", "en": "That flashcard doesn't exist."},
    # Mi rincón
    "articulo_no_existe": {"es": "Ese artículo no está en la tienda.", "en": "That item isn't in the shop."},
    "ya_lo_tenes": {"es": "Ya tenés ese artículo.", "en": "You already own that item."},
    "monedas_insuficientes": {
        "es": "Te faltan {faltan} monedas. Seguí estudiando para ganar más.",
        "en": "You need {faltan} more coins. Keep studying to earn more.",
    },
    "articulo_no_comprado": {
        "es": "Primero tenés que comprar ese artículo en la tienda.",
        "en": "You need to buy that item in the shop first.",
    },
    "foto_invalida": {
        "es": "No se pudo leer la foto. Probá con un JPG o PNG.",
        "en": "Couldn't read that photo. Try a JPG or PNG.",
    },
    "mi_sala": {"es": "Mi sala", "en": "My room"},
    "muchos_archivos_sala": {
        "es": "La sala ya tiene {maximo} archivos. Borren alguno para subir más.",
        "en": "The room already has {maximo} files. Delete one to upload more.",
    },
    "sala_llena_de_archivos": {
        "es": "Los archivos de la sala ya ocupan {mb} MB, el máximo. Borren alguno para subir más.",
        "en": "The room's files already take up {mb} MB, the limit. Delete one to upload more.",
    },
    "error_procesando": {
        "es": "No se pudo leer {nombre}. Probá de nuevo o subilo en otro formato.",
        "en": "Couldn't read {nombre}. Try again or upload it in another format.",
    },
    "tablero_lleno": {
        "es": "Ya hay {maximo} en el tablero. Borrá alguna para agregar otra.",
        "en": "There are already {maximo} on the board. Delete one to add another.",
    },
    "no_es_tu_item": {
        "es": "Solo puede borrarla quien la escribió o quien creó la sala.",
        "en": "Only whoever wrote it or created the room can delete it.",
    },
    "item_no_existe": {"es": "Eso ya no está en el tablero.", "en": "That's no longer on the board."},
    "trivia_opciones": {"es": "Esas opciones de trivia no existen.", "en": "Those trivia options don't exist."},
    "rival_no_esta": {
        "es": "Esa persona ya no está en la sala. Elegí a alguien que esté conectado.",
        "en": "That person isn't in the room anymore. Pick someone who's online.",
    },
    "trivia_archivos": {
        "es": "Para la trivia subí entre 1 y {maximo} archivos.",
        "en": "For the trivia, upload between 1 and {maximo} files.",
    },
    "trivia_sin_texto": {
        "es": "No encontré texto en esos archivos para armar preguntas.",
        "en": "I couldn't find text in those files to make questions.",
    },
    "trivia_en_curso": {
        "es": "Ya hay una trivia en juego en la sala. Esperá a que termine.",
        "en": "There's already a trivia going on in this room. Wait for it to finish.",
    },
    "trivia_error": {
        "es": "No se pudo armar la trivia. Probá de nuevo en un rato.",
        "en": "Couldn't make the trivia. Try again in a little while.",
    },
    "entra_a_la_sala": {"es": "Entrá a la sala para usar la radio.", "en": "Join the room to use the radio."},
    "archivo_no_existe": {"es": "Ese archivo ya no está en la sala.", "en": "That file is no longer in the room."},
    "no_es_tu_archivo": {
        "es": "Solo puede borrarlo quien lo subió o quien creó la sala.",
        "en": "Only whoever uploaded it or created the room can delete it.",
    },
    "solo_discord": {
        "es": "Repasito se usa desde Discord: abrilo como actividad en un canal de tu servidor.",
        "en": "Repasito is used from Discord: open it as an Activity in a channel of your server.",
    },
    "discord_no_configurado": {
        "es": "La actividad de Discord todavía no está configurada en el servidor.",
        "en": "The Discord Activity isn't configured on the server yet.",
    },
    "discord_fallo": {
        "es": "No se pudo entrar con Discord. Cerrá la actividad y volvé a abrirla.",
        "en": "Couldn't sign in with Discord. Close the activity and open it again.",
    },
    "sala_no_existe": {
        "es": "No existe una sala con ese código. Revisá el link o pedile uno nuevo a tu compañero.",
        "en": "There's no room with that code. Check the link or ask your classmate for a new one.",
    },
    "sin_apuntes": {
        "es": "Primero subí algún apunte a esta materia.",
        "en": "Upload some notes to this subject first.",
    },
    "tema_no_encontrado": {
        "es": "No encontré nada sobre «{tema}» en los apuntes.",
        "en": "I couldn't find anything about “{tema}” in your notes.",
    },
    # Validaciones
    "validacion_email": {"es": "El email no es válido.", "en": "That email isn't valid."},
    "validacion_password": {
        "es": "La contraseña tiene que tener al menos 8 caracteres.",
        "en": "The password must be at least 8 characters long.",
    },
    "validacion_nombre": {"es": "Completá el nombre.", "en": "Please enter a name."},
    "validacion_pregunta": {
        "es": "Escribí una pregunta (hasta 2000 caracteres).",
        "en": "Write a question (up to 2000 characters).",
    },
    "validacion_frente": {"es": "Completá la pregunta de la tarjeta.", "en": "Please fill in the card's question."},
    "validacion_dorso": {"es": "Completá la respuesta de la tarjeta.", "en": "Please fill in the card's answer."},
    "validacion_general": {"es": "Revisá los datos que ingresaste.", "en": "Please check the information you entered."},
    # Archivos
    "archivo_grande": {"es": "El archivo supera los {mb} MB.", "en": "The file is larger than {mb} MB."},
    "archivo_vacio": {"es": "El archivo está vacío.", "en": "The file is empty."},
    "muchos_documentos": {
        "es": "Esta materia ya tiene {maximo} archivos, que es el máximo. Borrá alguno o creá otra materia.",
        "en": "This subject already has {maximo} files, which is the limit. Delete one or create another subject.",
    },
    "formato_viejo": {
        "es": "Los archivos {extension} (formato viejo) no se pueden leer. Abrilo y guardalo como {nuevo}.",
        "en": "Old {extension} files can't be read. Open it and save it as {nuevo}.",
    },
    "formato_no_soportado": {
        "es": "Ese tipo de archivo no está soportado. Probá con PDF, Word, PowerPoint, Excel, texto o una imagen.",
        "en": "That file type isn't supported. Try PDF, Word, PowerPoint, Excel, text or an image.",
    },
    "archivo_danado": {
        "es": "No se pudo leer «{nombre}». ¿Puede ser que esté dañado?",
        "en": "Couldn't read “{nombre}”. Could it be damaged?",
    },
    "pdf_con_contrasena": {"es": "El PDF está protegido con contraseña.", "en": "The PDF is password protected."},
    "muchas_paginas_escaneadas": {
        "es": "El PDF tiene {cantidad} páginas escaneadas y el máximo es {maximo}. Dividilo en partes más chicas.",
        "en": "The PDF has {cantidad} scanned pages and the limit is {maximo}. Split it into smaller parts.",
    },
    "foto_ilegible": {
        "es": "No pude leer texto en «{nombre}». Probá con una foto más nítida, derecha y con buena luz.",
        "en": "I couldn't read any text in “{nombre}”. Try a sharper, straight photo with good lighting.",
    },
    "sin_texto": {"es": "No se encontró texto en «{nombre}».", "en": "No text was found in “{nombre}”."},
    "ocr_no_disponible": {
        "es": "La lectura de fotos no está disponible en el servidor (falta Tesseract).",
        "en": "Reading photos isn't available on the server (Tesseract is missing).",
    },
    # IA
    "ia_sin_configurar": {
        "es": "La IA no está configurada en el servidor (falta GROQ_API_KEY).",
        "en": "AI isn't set up on the server (GROQ_API_KEY is missing).",
    },
    "ia_key_invalida": {"es": "La API key de Groq no es válida.", "en": "The Groq API key isn't valid."},
    "ia_sin_cupo": {
        "es": "Se agotó el uso gratis de la IA por ahora. Probá de nuevo en un rato.",
        "en": "The free AI quota is used up for now. Try again in a little while.",
    },
    "ia_texto_largo": {
        "es": "El texto es demasiado largo para la IA gratis. Probá con una parte más chica.",
        "en": "The text is too long for the free AI. Try a smaller part.",
    },
    "ia_no_disponible": {
        "es": "La IA no está disponible en este momento. Probá en un rato.",
        "en": "The AI isn't available right now. Try again in a little while.",
    },
    "ia_rechazo": {"es": "La IA rechazó el pedido ({codigo}).", "en": "The AI rejected the request ({codigo})."},
    "ia_sin_conexion": {"es": "No se pudo conectar con la IA.", "en": "Couldn't connect to the AI."},
    "ia_sin_respuesta": {
        "es": "La IA no devolvió respuesta. Probá de nuevo.",
        "en": "The AI didn't return an answer. Please try again.",
    },
    "ia_formato": {
        "es": "La IA devolvió un formato inesperado. Probá de nuevo.",
        "en": "The AI returned an unexpected format. Please try again.",
    },
    "ia_sin_preguntas": {
        "es": "No se pudieron generar preguntas válidas. Probá de nuevo.",
        "en": "Couldn't generate valid questions. Please try again.",
    },
    "ia_sin_modelos": {"es": "No hay modelos de IA configurados.", "en": "No AI models are configured."},
}


def t(clave: str, idioma: str | None = None, **datos) -> str:
    textos = MENSAJES[clave]
    return textos.get(idioma or idioma_actual.get(), textos["es"]).format(**datos)


class ErrorTraducible(Exception):
    """Error con un mensaje para el usuario que se muestra en su idioma."""

    def __init__(self, clave: str, **datos):
        super().__init__(clave)
        self.clave = clave
        self.datos = datos

    def texto(self, idioma: str | None = None) -> str:
        return t(self.clave, idioma, **self.datos)

    def __str__(self) -> str:
        return self.texto()
