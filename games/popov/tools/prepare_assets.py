"""
Подготовка ассетов для игры.

Берёт исходники из assets/ и складывает готовые к игре WebP-файлы в assets/game/:
  - спрайты персонажей без фона (PNG с прозрачностью) — фон вырезает нейросеть rembg;
  - 4 плашки-аватара Попова из листа «Комиксные эмоции Д.В.Попова.png»;
  - 3 головы для шкалы из «Эмодзи шкалы ошеломления.png»;
  - фоны ракурсов, сцены из assets/classroom, assets/classroom_reverse
    и слайды начального экрана из assets/preclass в WebP.

Установка:  python -m pip install "rembg[cpu]"
Запуск:     python tools/prepare_assets.py                 — всё
            python tools/prepare_assets.py elaman_neutral  — только эти спрайты
Новый спрайт: положите <id>_<эмоция>.png в assets/ и перезапустите скрипт.
Первый запуск скачивает модель (~180 МБ) в папку ~/.rembg.
"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFilter
from optimize_assets import save_runtime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets")
OUT = os.path.join(ROOT, "assets", "game")

REMBG_MODEL = os.environ.get("REMBG_MODEL", "isnet-general-use")  # точнее, но в 10 раз медленнее: birefnet-general
MARK = (255, 0, 255)

_session = None


def rembg_cut(img):
    """Вырезает персонажа нейросетью и убирает светлый ореол по краю."""
    global _session
    from rembg import new_session, remove

    if _session is None:
        _session = new_session(REMBG_MODEL)
    rgb = img.convert("RGB")
    cut = remove(rgb, session=_session, post_process_mask=True)
    alpha = cut.getchannel("A")
    # Почти прозрачное — убираем, почти непрозрачное — делаем плотным
    alpha = alpha.point(lambda a: 0 if a < 12 else (255 if a > 243 else a))
    # срезаем 1 px по контуру — там остаётся светлая кайма фона
    alpha = alpha.filter(ImageFilter.MinFilter(3))
    return decontaminate(rgb, alpha)


def decontaminate(rgb, alpha):
    """Снимает с полупрозрачных краёв цвет светлого фона (серый ореол)."""
    w, h = rgb.size
    bg = _border_color(rgb)
    src = rgb.load()
    a = alpha.load()
    out = Image.new("RGBA", (w, h))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            al = a[x, y]
            if al == 0:
                dst[x, y] = (0, 0, 0, 0)
                continue
            r, g, b = src[x, y]
            if al < 255:
                f = al / 255.0
                r = int(max(0, min(255, (r - (1 - f) * bg[0]) / f)))
                g = int(max(0, min(255, (g - (1 - f) * bg[1]) / f)))
                b = int(max(0, min(255, (b - (1 - f) * bg[2]) / f)))
            dst[x, y] = (r, g, b, al)
    return out


def _border_color(rgb):
    w, h = rgb.size
    pts = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2)]
    cols = [rgb.getpixel(p) for p in pts]
    return tuple(sorted(c[i] for c in cols)[len(cols) // 2] for i in range(3))


def flood_cut(img, thresh=30, step=24):
    """Заливает однотонный фон от краёв (для плашек на белом фоне)."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    work = rgb.copy()
    px = work.load()
    border = []
    for x in range(0, w, step):
        border += [(x, 0), (x, h - 1)]
    for y in range(0, h, step):
        border += [(0, y), (w - 1, y)]
    for xy in border:
        c = px[xy]
        if c == MARK or min(c) < 200:
            continue
        ImageDraw.floodfill(work, xy, MARK, thresh=thresh)
    mask = Image.new("L", (w, h), 255)
    mpx = mask.load()
    wpx = work.load()
    for y in range(h):
        for x in range(w):
            if wpx[x, y] == MARK:
                mpx[x, y] = 0
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = rgb.convert("RGBA")
    out.putalpha(mask)
    return out


def fit(img, max_w, max_h):
    img = img.copy()
    img.thumbnail((max_w, max_h), Image.LANCZOS)
    return img


def save(img, name):
    path = save_runtime(img, os.path.join(OUT, name))
    print("  ->", os.path.relpath(path, ROOT), img.size)


def sprites(only):
    for path in sorted(glob.glob(os.path.join(SRC, "*_*.png"))):
        name = os.path.splitext(os.path.basename(path))[0]
        if not name.isascii() or (only and name not in only):
            continue
        print(name)
        img = Image.open(path)
        if img.mode == "RGBA" and img.getchannel("A").getextrema()[0] == 0:
            cut = img  # уже с прозрачностью (popov_back)
        else:
            cut = rembg_cut(img)
        cut = fit(cut, 1100, 1100)
        bbox = cut.getchannel("A").getbbox()
        if bbox:
            cut = cut.crop(bbox)
        save(cut, name + ".webp")


def ui():
    sheet = Image.open(os.path.join(SRC, "Комиксные эмоции Д.В.Попова.png")).convert("RGB")
    w, h = sheet.size
    for i, (cx, cy) in enumerate([(0, 0), (1, 0), (0, 1), (1, 1)]):  # ..., ?!, !!, череп
        part = sheet.crop((cx * w // 2, cy * h // 2, (cx + 1) * w // 2, (cy + 1) * h // 2))
        cut = flood_cut(part, thresh=45, step=8)
        print("popov_avatar", i)
        save(cut.crop(cut.getchannel("A").getbbox()), "popov_avatar_%d.webp" % i)

    heads = Image.open(os.path.join(SRC, "Эмодзи шкалы ошеломления.png")).convert("RGB")
    w, h = heads.size
    for i in range(3):
        part = heads.crop((i * w // 3, 0, (i + 1) * w // 3, h))
        cut = flood_cut(part, thresh=45, step=8)
        cut = fit(cut.crop(cut.getchannel("A").getbbox()), 320, 320)
        print("bar_head", i)
        save(cut, "bar_head_%d.webp" % i)


def backgrounds():
    for src, dst in [("Передний ракурс камеры.png", "bg_front.webp"),
                     ("Задний ракурс камеры.png", "bg_back.webp")]:
        print(dst)
        save(Image.open(os.path.join(SRC, src)).convert("RGB"), dst)

    # preclass — слайдшоу начального экрана
    for path in sorted(glob.glob(os.path.join(SRC, "preclass", "*.png"))):
        name = os.path.splitext(os.path.basename(path))[0]
        print("preclass", name)
        img = Image.open(path).convert("RGB").resize((1536, 1024), Image.LANCZOS)
        save(img, "preclass_%s.webp" % name)

    # classroom — вид на окна (front), classroom_reverse — вид на доску (back)
    for folder, view in [("classroom", "front"), ("classroom_reverse", "back")]:
        for path in sorted(glob.glob(os.path.join(SRC, folder, "*.png"))):
            name = os.path.splitext(os.path.basename(path))[0]
            if name == "classroom_seated":
                dst = "scene_%s_seated.webp" % view
            elif name.startswith("popov_at_"):
                dst = "scene_%s_at_%s.webp" % (view, name[len("popov_at_"):])
            else:
                continue
            print(folder, name)
            img = Image.open(path).convert("RGB").resize((1536, 1024), Image.LANCZOS)
            save(img, dst)


def main():
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:]
    sprites(only)
    if only:
        return
    ui()
    backgrounds()


if __name__ == "__main__":
    main()
