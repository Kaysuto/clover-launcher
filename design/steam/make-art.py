"""Images de la bibliothèque Steam pour le raccourci « Clover Games » (CLO-285).

    python design/steam/make-art.py

Sources : trèfle du launcher (src/assets/brand/launcher.png) et police Lilita One (paquet
@fontsource, convertie du WOFF2). Fond repris du bandeau de l'accueil (Backdrop.tsx, teinte
« forest »). Écrit dans src-tauri/assets/steam/ les formats demandés par Steam :
portrait 600×900, en-tête 920×430, héros 1920×620, logo transparent 1280×720 et icône 256×256.
"""

from io import BytesIO
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src-tauri" / "assets" / "steam"
LOGO = Image.open(ROOT / "src" / "assets" / "brand" / "launcher.png").convert("RGBA")
WOFF2 = ROOT / "node_modules" / "@fontsource" / "lilita-one" / "files" / "lilita-one-latin-400-normal.woff2"

# Dégradé du bandeau : from-[#1d5a35] via-[#2f7d4c] to-[#16452b], en diagonale.
STOPS = [(0.0, (0x1D, 0x5A, 0x35)), (0.5, (0x2F, 0x7D, 0x4C)), (1.0, (0x16, 0x45, 0x2B))]


def font(size: int) -> ImageFont.FreeTypeFont:
    ttf = TTFont(WOFF2)
    ttf.flavor = None
    buffer = BytesIO()
    ttf.save(buffer)
    buffer.seek(0)
    return ImageFont.truetype(buffer, size)


def gradient(width: int, height: int) -> Image.Image:
    small = Image.new("RGB", (64, 64))
    pixels = small.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126
            for (a, ca), (b, cb) in zip(STOPS, STOPS[1:]):
                if a <= t <= b:
                    k = (t - a) / (b - a)
                    pixels[x, y] = tuple(round(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))
                    break
    return small.resize((width, height), Image.BICUBIC).convert("RGBA")


def backdrop(width: int, height: int) -> Image.Image:
    """Fond vert, blocs de feuillage pixelisés et lueur, comme le bandeau de l'accueil."""
    image = gradient(width, height)
    layer = Image.new("RGBA", (width, height))
    draw = ImageDraw.Draw(layer)
    unit = max(width, height) / 1100
    blocks = [
        (0.05, 0.10, 96, 40, (255, 255, 255, 20)),
        (0.09, 0.06, 88, 32, (255, 255, 255, 15)),
        (0.58, 0.18, 112, 48, (255, 255, 255, 20)),
        (0.54, 0.13, 80, 36, (255, 255, 255, 15)),
        (0.38, 0.82, 64, 32, (0, 0, 0, 26)),
        (0.86, 0.74, 80, 32, (0, 0, 0, 26)),
    ]
    for x, y, w, h, color in blocks:
        left, top = x * width, y * height
        draw.rectangle([left, top, left + w * unit, top + h * unit], fill=color)
    glow = Image.new("RGBA", (width, height))
    radius = min(width, height) * 0.45
    ImageDraw.Draw(glow).ellipse([width / 2 - radius, -radius, width / 2 + radius, radius], fill=(0x9B, 0xE3, 0x8F, 38))
    glow = glow.filter(ImageFilter.GaussianBlur(radius * 0.35))
    return Image.alpha_composite(Image.alpha_composite(image, glow), layer)


def logo(size: int) -> Image.Image:
    return LOGO.resize((size, size), Image.LANCZOS)


def shadowed_text(image: Image.Image, xy: tuple[float, float], text: str, size: int, anchor: str) -> None:
    """Texte blanc avec l'ombre dure du jeu (mc-text-shadow)."""
    draw = ImageDraw.Draw(image)
    face = font(size)
    offset = max(2, size // 14)
    draw.text((xy[0] + offset, xy[1] + offset), text, font=face, fill=(0, 0, 0, 110), anchor=anchor)
    draw.text(xy, text, font=face, fill=(255, 255, 255, 255), anchor=anchor)


def portrait() -> Image.Image:
    image = backdrop(600, 900)
    mark = logo(380)
    image.alpha_composite(mark, ((600 - 380) // 2, 170))
    shadowed_text(image, (300, 660), "Clover", 104, "mm")
    shadowed_text(image, (300, 760), "Games", 104, "mm")
    return image


def fitting(text: str, width: float, largest: int) -> int:
    """Plus grande taille de police (≤ `largest`) où `text` tient dans `width` pixels."""
    size = largest
    while size > 10 and font(size).getlength(text) > width:
        size -= 2
    return size


def header() -> Image.Image:
    image = backdrop(920, 430)
    mark = logo(280)
    image.alpha_composite(mark, (56, 75))
    left = 56 + 280 + 36
    shadowed_text(image, (left, 215), "Clover Games", fitting("Clover Games", 920 - left - 48, 96), "lm")
    return image


def hero() -> Image.Image:
    return backdrop(1920, 620)


def wordmark() -> Image.Image:
    image = Image.new("RGBA", (1280, 720))
    mark = logo(420)
    image.alpha_composite(mark, ((1280 - 420) // 2, 40))
    shadowed_text(image, (640, 590), "Clover Games", 150, "mm")
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, image in [("portrait", portrait()), ("header", header()), ("hero", hero()), ("logo", wordmark()), ("icon", logo(256))]:
        path = OUT / f"{name}.png"
        image.save(path, optimize=True)
        print(f"{path.relative_to(ROOT)} {image.size[0]}×{image.size[1]} {path.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
