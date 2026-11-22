from datetime import UTC, date, datetime

from sqlalchemy import JSON, ForeignKey, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def ahora() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    nombre: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(100))
    es_invitado: Mapped[bool] = mapped_column(default=False)
    creado: Mapped[datetime] = mapped_column(default=ahora)
    # Contador de usos de IA del día
    uso_fecha: Mapped[date | None] = mapped_column(default=None)
    uso_cantidad: Mapped[int] = mapped_column(default=0)

    materias: Mapped[list["Materia"]] = relationship(back_populates="usuario", cascade="all, delete-orphan")
    sesiones: Mapped[list["Sesion"]] = relationship(back_populates="usuario", cascade="all, delete-orphan")
    salas: Mapped[list["MiembroSala"]] = relationship(back_populates="usuario", cascade="all, delete-orphan")
    rincon: Mapped["Rincon | None"] = relationship(back_populates="usuario", cascade="all, delete-orphan")
    movimientos: Mapped[list["MovimientoMonedas"]] = relationship(
        back_populates="usuario", cascade="all, delete-orphan"
    )


class Sesion(Base):
    __tablename__ = "sesiones"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expira: Mapped[datetime]

    usuario: Mapped[Usuario] = relationship(back_populates="sesiones")


class Materia(Base):
    __tablename__ = "materias"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    nombre: Mapped[str] = mapped_column(String(120))
    creada: Mapped[datetime] = mapped_column(default=ahora)

    usuario: Mapped[Usuario] = relationship(back_populates="materias")
    documentos: Mapped[list["Documento"]] = relationship(
        back_populates="materia", cascade="all, delete-orphan", order_by="Documento.id"
    )
    flashcards: Mapped[list["Flashcard"]] = relationship(back_populates="materia", cascade="all, delete-orphan")
    mensajes: Mapped[list["Mensaje"]] = relationship(
        back_populates="materia", cascade="all, delete-orphan", order_by="Mensaje.id"
    )


class Documento(Base):
    __tablename__ = "documentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    materia_id: Mapped[int] = mapped_column(ForeignKey("materias.id"), index=True)
    nombre: Mapped[str] = mapped_column(String(255))
    tipo: Mapped[str] = mapped_column(String(20))  # pdf, word, presentacion, planilla, texto, imagen
    paginas: Mapped[int]
    texto: Mapped[str] = mapped_column(Text)
    resumen: Mapped[str | None] = mapped_column(Text, default=None)
    creado: Mapped[datetime] = mapped_column(default=ahora)

    materia: Mapped[Materia] = relationship(back_populates="documentos")
    fragmentos: Mapped[list["Fragmento"]] = relationship(
        back_populates="documento", cascade="all, delete-orphan", order_by="Fragmento.orden"
    )
    flashcards: Mapped[list["Flashcard"]] = relationship(back_populates="documento", cascade="all, delete-orphan")


class Fragmento(Base):
    __tablename__ = "fragmentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    documento_id: Mapped[int] = mapped_column(ForeignKey("documentos.id"), index=True)
    pagina: Mapped[int]
    orden: Mapped[int]
    texto: Mapped[str] = mapped_column(Text)

    documento: Mapped[Documento] = relationship(back_populates="fragmentos")


class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[int] = mapped_column(primary_key=True)
    materia_id: Mapped[int] = mapped_column(ForeignKey("materias.id"), index=True)
    documento_id: Mapped[int | None] = mapped_column(ForeignKey("documentos.id"), default=None)
    frente: Mapped[str] = mapped_column(Text)
    dorso: Mapped[str] = mapped_column(Text)
    # Estado del algoritmo SM-2
    facilidad: Mapped[float] = mapped_column(default=2.5)
    intervalo: Mapped[int] = mapped_column(default=0)
    repeticiones: Mapped[int] = mapped_column(default=0)
    proxima: Mapped[date] = mapped_column(default=date.today)
    creada: Mapped[datetime] = mapped_column(default=ahora)

    materia: Mapped[Materia] = relationship(back_populates="flashcards")
    documento: Mapped[Documento | None] = relationship(back_populates="flashcards")


class Mensaje(Base):
    __tablename__ = "mensajes"

    id: Mapped[int] = mapped_column(primary_key=True)
    materia_id: Mapped[int] = mapped_column(ForeignKey("materias.id"), index=True)
    rol: Mapped[str] = mapped_column(String(10))  # "user" o "assistant"
    texto: Mapped[str] = mapped_column(Text)
    fuentes: Mapped[list] = mapped_column(JSON, default=list)
    creado: Mapped[datetime] = mapped_column(default=ahora)

    materia: Mapped[Materia] = relationship(back_populates="mensajes")


# --- Salas de estudio en grupo ---


class Sala(Base):
    __tablename__ = "salas"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    nombre: Mapped[str] = mapped_column(String(80))
    creador_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), default=None)
    creada: Mapped[datetime] = mapped_column(default=ahora)

    miembros: Mapped[list["MiembroSala"]] = relationship(back_populates="sala", cascade="all, delete-orphan")
    mensajes: Mapped[list["MensajeSala"]] = relationship(
        back_populates="sala", cascade="all, delete-orphan", order_by="MensajeSala.id"
    )
    archivos: Mapped[list["ArchivoSala"]] = relationship(
        back_populates="sala", cascade="all, delete-orphan", order_by="ArchivoSala.id"
    )


class MiembroSala(Base):
    """Quién entró alguna vez a una sala (para mostrarle sus salas recientes)."""

    __tablename__ = "miembros_sala"

    id: Mapped[int] = mapped_column(primary_key=True)
    sala_id: Mapped[int] = mapped_column(ForeignKey("salas.id"), index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    ultima_visita: Mapped[datetime] = mapped_column(default=ahora)

    sala: Mapped[Sala] = relationship(back_populates="miembros")
    usuario: Mapped[Usuario] = relationship(back_populates="salas")


class MensajeSala(Base):
    __tablename__ = "mensajes_sala"

    id: Mapped[int] = mapped_column(primary_key=True)
    sala_id: Mapped[int] = mapped_column(ForeignKey("salas.id"), index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), default=None)
    nombre: Mapped[str] = mapped_column(String(80))  # copia del nombre, por si la cuenta se borra
    texto: Mapped[str] = mapped_column(Text)
    creado: Mapped[datetime] = mapped_column(default=ahora)

    sala: Mapped[Sala] = relationship(back_populates="mensajes")


class SalaPersonal(Base):
    """La sala de cada uno para estudiar solo (pomodoro, radio, pizarra), que se abre desde las materias."""

    __tablename__ = "salas_personales"

    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True)
    sala_id: Mapped[int] = mapped_column(ForeignKey("salas.id", ondelete="CASCADE"), unique=True)


class ArchivoSala(Base):
    """Archivos compartidos en una sala: los ve y los descarga cualquiera que esté en ella."""

    __tablename__ = "archivos_sala"

    id: Mapped[int] = mapped_column(primary_key=True)
    sala_id: Mapped[int] = mapped_column(ForeignKey("salas.id"), index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), default=None)
    por: Mapped[str] = mapped_column(String(80))  # nombre de quien lo subió (copia)
    nombre: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(120))
    tamano: Mapped[int]
    datos: Mapped[bytes] = mapped_column(LargeBinary)
    creado: Mapped[datetime] = mapped_column(default=ahora)

    sala: Mapped[Sala] = relationship(back_populates="archivos")


class CuentaDiscord(Base):
    """Qué cuenta de Repaso corresponde a cada usuario de Discord (para la actividad)."""

    __tablename__ = "cuentas_discord"

    discord_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), unique=True)


class SalaDiscord(Base):
    """La sala que corresponde a cada actividad abierta en un canal de Discord."""

    __tablename__ = "salas_discord"

    instancia: Mapped[str] = mapped_column(String(64), primary_key=True)
    sala_id: Mapped[int] = mapped_column(ForeignKey("salas.id", ondelete="CASCADE"), unique=True)


class Pizarra(Base):
    """Lo dibujado en la pizarra de una sala (elementos de Excalidraw)."""

    __tablename__ = "pizarras"

    id: Mapped[int] = mapped_column(primary_key=True)
    sala_id: Mapped[int] = mapped_column(ForeignKey("salas.id"), unique=True)
    elementos: Mapped[list] = mapped_column(JSON, default=list)
    actualizada: Mapped[datetime] = mapped_column(default=ahora, onupdate=ahora)


class ArchivoPizarra(Base):
    """Imágenes pegadas en la pizarra (como data URL, igual que las guarda Excalidraw)."""

    __tablename__ = "archivos_pizarra"
    __table_args__ = (UniqueConstraint("sala_id", "archivo_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sala_id: Mapped[int] = mapped_column(ForeignKey("salas.id"), index=True)
    archivo_id: Mapped[str] = mapped_column(String(64))
    mime: Mapped[str] = mapped_column(String(40))
    datos: Mapped[str] = mapped_column(Text)
    creado: Mapped[datetime] = mapped_column(default=ahora)


# --- Mi rincón: monedas, mascota y tienda ---


class Rincon(Base):
    """Lo que el usuario fue armando: monedas, lo que compró, cómo se ve su mascota y su foto."""

    __tablename__ = "rincones"

    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True)
    monedas: Mapped[int] = mapped_column(default=0)
    comprados: Mapped[list] = mapped_column(JSON, default=list)
    apariencia: Mapped[dict] = mapped_column(JSON, default=dict)
    foto: Mapped[bytes | None] = mapped_column(LargeBinary, default=None)
    foto_version: Mapped[int] = mapped_column(default=0)

    usuario: Mapped[Usuario] = relationship(back_populates="rincon")


class FotoMascota(Base):
    """La foto de la mascota personalizada (la que se compra en la tienda y se arma con una foto)."""

    __tablename__ = "fotos_mascota"

    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True)
    datos: Mapped[bytes] = mapped_column(LargeBinary)
    version: Mapped[int] = mapped_column(default=1)


class MovimientoMonedas(Base):
    """Cada vez que alguien gana o gasta monedas (sirve para los topes diarios)."""

    __tablename__ = "movimientos_monedas"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), index=True)
    motivo: Mapped[str] = mapped_column(String(20))  # archivo, grupo, solo, compra, bienvenida
    cantidad: Mapped[int]
    fecha: Mapped[date] = mapped_column(default=date.today, index=True)
    creado: Mapped[datetime] = mapped_column(default=ahora)

    usuario: Mapped[Usuario] = relationship(back_populates="movimientos")
