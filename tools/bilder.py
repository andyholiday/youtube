"""Bilder lesen, drehen, nach sRGB bringen, verkleinern und ohne Metadaten als JPEG speichern."""
import datetime
import hashlib
import io
import re

from PIL import Image, ImageCms, ImageOps

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:  # ohne pillow-heif bleiben .heic-Dateien unlesbar; build.py meldet das
    pass

BILD_ENDUNGEN = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
MAX_KANTE = 1280
QUALITAET = 85
EXIF_AUFNAHME = 0x9003  # DateTimeOriginal
EXIF_UNTERVERZEICHNIS = 0x8769


def aufnahmedatum(img):
    """Gibt das EXIF-Aufnahmedatum (YYYY-MM-DD) zurück oder None."""
    try:
        exif = img.getexif()
        roh = exif.get_ifd(EXIF_UNTERVERZEICHNIS).get(EXIF_AUFNAHME) or exif.get(EXIF_AUFNAHME)
        m = re.match(r"(\d{4})[:\-](\d{2})[:\-](\d{2})", roh.decode() if isinstance(roh, bytes) else roh)
        datum = datetime.date(*(int(g) for g in m.groups()))
    except (AttributeError, TypeError, ValueError, OSError):
        return None
    return datum.isoformat() if datum.year >= 1900 else None


def _auf_rgb(img):
    """Transparenz auf Weiß legen; gibt RGB (oder CMYK, falls vorhanden) zurück."""
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        grund = Image.new("RGB", img.size, (255, 255, 255))
        grund.paste(img, mask=img.getchannel("A"))
        return grund
    return img if img.mode in ("RGB", "CMYK") else img.convert("RGB")


def _nach_srgb(img, icc):
    """Wandelt mit eingebettetem Profil (z. B. Display P3) nach sRGB; ohne Profil unverändert."""
    if img.mode in ("RGB", "CMYK") and icc:
        try:
            quelle = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            if "srgb" not in ImageCms.getProfileDescription(quelle).lower():
                srgb = ImageCms.createProfile("sRGB")
                img = ImageCms.profileToProfile(
                    img, quelle, srgb, renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
                    outputMode="RGB")
        except (ImageCms.PyCMSError, OSError, ValueError):
            pass  # unlesbares Profil: Pixel so lassen
    return img.convert("RGB")


def verkleinere(quelle, ziel):
    """Dreht per EXIF, wandelt nach sRGB, entfernt Metadaten, skaliert, speichert JPEG.

    Gibt (breite, hoehe, aufnahmedatum oder None) zurück.
    """
    with Image.open(quelle) as img:
        img.load()
        datum = aufnahmedatum(img)
        icc = img.info.get("icc_profile")
        img = _auf_rgb(ImageOps.exif_transpose(img))
        img.thumbnail((MAX_KANTE, MAX_KANTE), Image.LANCZOS)
        img = _nach_srgb(img, icc)
        # Neues Bild ohne info/exif/icc: nichts von GPS u. Ä. wird übernommen.
        sauber = Image.new("RGB", img.size)
        sauber.paste(img)
        sauber.save(ziel, "JPEG", quality=QUALITAET, optimize=True)
        return (*sauber.size, datum)


def inhalts_hash(pfad):
    """Kurzer Hash des Dateiinhalts (für den Cache-Parameter ?v=)."""
    return hashlib.sha256(pfad.read_bytes()).hexdigest()[:10]
