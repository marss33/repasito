import base64
import binascii
import io

from fastapi import APIRouter, Depends, HTTPException, Response
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from .. import rincon as r
from ..db import get_db
from ..deps import usuario_actual
from ..idioma import t
from ..models import FotoMascota, Rincon, Usuario
from ..schemas import AparienciaIn, ArticuloOut, CompraIn, FotoIn, PerfilRinconIn, RinconOut

router = APIRouter(prefix="/rincon", tags=["rincon"])

LADO_FOTO = 256


def a_salida(db: Session, rincon: Rincon) -> RinconOut:
    return RinconOut(
        monedas=rincon.monedas,
        foto_mascota=r.version_foto_mascota(db, rincon.usuario_id),
        comprados=rincon.comprados,
        habilitados=r.habilitados(rincon),
        trajes=r.TRAJES,
        apariencia=r.completar(rincon.apariencia, rincon.usuario_id),
        foto=rincon.foto_version if rincon.foto else 0,
        catalogo=[ArticuloOut(id=a.id, tipo=a.tipo, precio=a.precio) for a in r.CATALOGO.values()],
        ganado_hoy=r.ganado_hoy(db, rincon.usuario_id),
        topes=r.TOPES,
        reglas={
            "por_archivo": r.POR_ARCHIVO,
            "por_minuto_de_pomodoro": r.POR_MINUTO_DE_POMODORO,
        },
    )


def _mi_rincon(usuario: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)) -> Rincon:
    rincon = r.rincon_de(db, usuario.id)
    db.commit()
    return rincon


@router.get("", response_model=RinconOut)
def ver(rincon: Rincon = Depends(_mi_rincon), db: Session = Depends(get_db)):
    return a_salida(db, rincon)


@router.post("/comprar", response_model=RinconOut)
def comprar(datos: CompraIn, rincon: Rincon = Depends(_mi_rincon), db: Session = Depends(get_db)):
    try:
        r.comprar(db, rincon, datos.articulo)
    except r.ErrorRincon as e:
        raise HTTPException(404 if e.clave == "articulo_no_existe" else 400, e.texto()) from None
    return a_salida(db, rincon)


@router.put("/apariencia", response_model=RinconOut)
def cambiar_apariencia(datos: AparienciaIn, rincon: Rincon = Depends(_mi_rincon), db: Session = Depends(get_db)):
    try:
        r.cambiar_apariencia(db, rincon, datos.model_dump())
    except r.ErrorRincon as e:
        raise HTTPException(400, e.texto()) from None
    return a_salida(db, rincon)


def preparar_foto(data_url: str) -> bytes:
    """Recorta la foto en un cuadrado, la achica y la guarda como JPEG (así pesa unos pocos KB)."""
    try:
        cabecera, _, datos = data_url.partition(",")
        if not cabecera.startswith("data:image/") or ";base64" not in cabecera:
            raise ValueError
        imagen = Image.open(io.BytesIO(base64.b64decode(datos, validate=True)))
        imagen = ImageOps.exif_transpose(imagen).convert("RGB")
    except (ValueError, binascii.Error, UnidentifiedImageError, OSError):
        raise HTTPException(400, t("foto_invalida")) from None
    imagen = ImageOps.fit(imagen, (LADO_FOTO, LADO_FOTO), Image.Resampling.LANCZOS)
    salida = io.BytesIO()
    imagen.save(salida, "JPEG", quality=85, optimize=True)
    return salida.getvalue()


@router.put("/perfil", response_model=RinconOut)
def cambiar_perfil(datos: PerfilRinconIn, rincon: Rincon = Depends(_mi_rincon), db: Session = Depends(get_db)):
    r.cambiar_perfil(db, rincon, datos.color_apodo, datos.descripcion)
    return a_salida(db, rincon)


@router.put("/foto", response_model=RinconOut)
def subir_foto(datos: FotoIn, rincon: Rincon = Depends(_mi_rincon), db: Session = Depends(get_db)):
    rincon.foto = preparar_foto(datos.imagen)
    rincon.foto_version += 1
    db.commit()
    return a_salida(db, rincon)


@router.delete("/foto", response_model=RinconOut)
def borrar_foto(rincon: Rincon = Depends(_mi_rincon), db: Session = Depends(get_db)):
    rincon.foto = None
    rincon.foto_version += 1
    db.commit()
    return a_salida(db, rincon)


@router.get("/foto/{usuario_id}")
def foto(usuario_id: int, _: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    """La foto de perfil de alguien (para verla en la biblioteca). La URL lleva ?v=versión,
    así que se puede cachear para siempre."""
    rincon = db.get(Rincon, usuario_id)
    if rincon is None or rincon.foto is None:
        raise HTTPException(404)
    return Response(
        rincon.foto, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=31536000, immutable"}
    )


# --- Mascota personalizada (con una foto) ---


@router.put("/foto-mascota", response_model=RinconOut)
def subir_foto_mascota(datos: FotoIn, rincon: Rincon = Depends(_mi_rincon), db: Session = Depends(get_db)):
    if not r.lo_tiene(rincon, "mascota-foto"):
        raise HTTPException(400, t("articulo_no_comprado"))
    foto = db.get(FotoMascota, rincon.usuario_id)
    if foto is None:
        db.add(FotoMascota(usuario_id=rincon.usuario_id, datos=preparar_foto(datos.imagen), version=1))
    else:
        foto.datos = preparar_foto(datos.imagen)
        foto.version += 1
    db.commit()
    return a_salida(db, rincon)


@router.get("/foto-mascota/{usuario_id}")
def ver_foto_mascota(usuario_id: int, _: Usuario = Depends(usuario_actual), db: Session = Depends(get_db)):
    foto = db.get(FotoMascota, usuario_id)
    if foto is None:
        raise HTTPException(404)
    return Response(
        foto.datos, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=31536000, immutable"}
    )
