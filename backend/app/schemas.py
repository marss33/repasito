from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegistroIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


class PerfilIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=80, pattern=r"\S")


class UsuarioOut(BaseModel):
    id: int
    nombre: str
    email: str
    es_invitado: bool
    usos_hoy: int
    limite_diario: int
    monedas: int = 0
    foto: int = 0  # versión de la foto de perfil (0 = no tiene)


class SalaIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=80, pattern=r"\S")


class SalaOut(BaseModel):
    codigo: str
    nombre: str
    personas: int  # conectadas ahora
    personal: bool = False  # la sala para estudiar solo


class MensajeSalaOut(Base):
    id: int
    usuario_id: int | None
    nombre: str
    texto: str
    creado: datetime


class SalaDetalle(SalaOut):
    mensajes: list[MensajeSalaOut]
    creador_id: int | None = None


class ArchivoSalaOut(Base):
    id: int
    nombre: str
    mime: str
    tamano: int
    por: str
    usuario_id: int | None
    creado: datetime


class AMateriaIn(BaseModel):
    materia_id: int


class MateriaIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=120, pattern=r"\S")


class MateriaOut(Base):
    id: int
    nombre: str
    documentos: int
    flashcards: int
    pendientes: int


class DocumentoOut(Base):
    id: int
    nombre: str
    tipo: str
    paginas: int
    fragmentos: int
    tiene_resumen: bool
    creado: datetime
    monedas_ganadas: int = 0  # solo al subirlo


class SubidaPendiente(BaseModel):
    """Un apunte que se sigue procesando en el servidor (PDF escaneado, fotos)."""

    id: str
    nombre: str
    estado: str = "procesando"  # procesando, listo o error
    error: str | None = None
    monedas_ganadas: int = 0


class DocumentoDetalle(DocumentoOut):
    resumen: str | None


class Fuente(BaseModel):
    n: int
    documento: str
    ubicacion: str
    cita: str


class MensajeOut(Base):
    id: int
    rol: str
    texto: str
    fuentes: list[Fuente]
    creado: datetime


class PreguntaIn(BaseModel):
    pregunta: str = Field(min_length=1, max_length=2000)


class GenerarFlashcardsIn(BaseModel):
    cantidad: int = Field(default=10, ge=1, le=30)


class FlashcardIn(BaseModel):
    frente: str = Field(min_length=1)
    dorso: str = Field(min_length=1)


class FlashcardOut(Base):
    id: int
    documento_id: int | None
    frente: str
    dorso: str
    intervalo: int
    repeticiones: int
    proxima: date


class RepasoIn(BaseModel):
    calidad: int = Field(ge=0, le=5)


class QuizIn(BaseModel):
    tema: str | None = Field(default=None, max_length=200)
    cantidad: int = Field(default=5, ge=1, le=15)


class PreguntaOut(BaseModel):
    enunciado: str
    opciones: list[str]
    correcta: int
    explicacion: str


class QuizOut(BaseModel):
    preguntas: list[PreguntaOut]


# --- Mi rincón ---


class ArticuloOut(BaseModel):
    id: str
    tipo: str
    precio: int


class AparienciaIn(BaseModel):
    mascota: str = Field(max_length=40)
    nombre: str = Field(min_length=1, max_length=20, pattern=r"\S")
    cabeza: str | None = Field(default=None, max_length=40)
    cara: str | None = Field(default=None, max_length=40)
    cuello: str | None = Field(default=None, max_length=40)
    decoracion: list[str] = Field(default_factory=list, max_length=10)
    # Avatar
    peinado: str | None = Field(default=None, max_length=40)
    ropa: str | None = Field(default=None, max_length=40)
    sombrero: str | None = Field(default=None, max_length=40)
    lentes: str | None = Field(default=None, max_length=40)
    piel: str | None = Field(default=None, max_length=7)
    pelo: str | None = Field(default=None, max_length=7)
    ojos: str | None = Field(default=None, max_length=7)
    labios: str | None = Field(default=None, max_length=7)
    unas: str | None = Field(default=None, max_length=7)
    color_ropa: str | None = Field(default=None, max_length=7)
    color_abajo: str | None = Field(default=None, max_length=7)
    color_calzado: str | None = Field(default=None, max_length=7)
    color_accesorio: str | None = Field(default=None, max_length=7)
    silueta: str | None = Field(default=None, max_length=2)
    abajo: str | None = Field(default=None, max_length=40)
    calzado: str | None = Field(default=None, max_length=40)
    adorno: str | None = Field(default=None, max_length=40)
    escena: str | None = Field(default=None, max_length=20)
    ojos_forma: str | None = Field(default=None, max_length=20)
    pestanas: bool | None = None
    rubor: bool | None = None
    pecas: bool | None = None
    traje: str | None = Field(default=None, max_length=40)


class CompraIn(BaseModel):
    articulo: str = Field(max_length=40)


class PerfilRinconIn(BaseModel):
    color_apodo: str | None = Field(default=None, max_length=7)  # "" = el color de siempre
    descripcion: str | None = Field(default=None, max_length=200)


class FotoIn(BaseModel):
    imagen: str = Field(max_length=3_000_000)  # data URL (el navegador ya la achica)


class RinconOut(BaseModel):
    monedas: int
    foto_mascota: int = 0  # versión de la foto de la mascota personalizada (0 = no tiene)
    comprados: list[str]
    habilitados: list[str] = []  # lo que puede usar: comprado, gratis o incluido en un traje suyo
    trajes: dict = {}
    apariencia: dict
    foto: int
    catalogo: list[ArticuloOut]
    ganado_hoy: dict[str, int]
    topes: dict[str, int]
    reglas: dict[str, float]
