"""Encode runtime images as WebP; source artwork outside assets/game is untouched.

Usage: python3 games/popov/tools/optimize_assets.py
Requires Pillow. Also imported by prepare_assets.py so regeneration uses the same limits.
"""
from pathlib import Path
from PIL import Image

ASSETS = Path(__file__).resolve().parents[1] / 'assets' / 'game'


def save_runtime(image, target):
    target = Path(target).with_suffix('.webp')
    image = image.copy()
    if target.stem.startswith(('bg_', 'scene_', 'preclass_')):
        limit = (1536, 1024)
    elif target.stem.startswith('popov_avatar_'):
        limit = (540, 260)
    elif target.stem.startswith('bar_head_'):
        limit = (160, 160)
    else:
        limit = (900, 900)
    image.thumbnail(limit, Image.Resampling.LANCZOS)
    image.save(target, 'WEBP', quality=85, method=6, exact=True)
    # Decode before replacing the previous runtime copy.
    with Image.open(target) as check:
        check.load()
        assert check.size == image.size
    return target


def main():
    originals = sorted(p for p in ASSETS.iterdir() if p.suffix.lower() in ('.png', '.jpg'))
    before = sum(p.stat().st_size for p in originals)
    after = 0
    for path in originals:
        with Image.open(path) as image:
            target = save_runtime(image, path)
        after += target.stat().st_size
        path.unlink()
    print(f'{len(originals)} images: {before:,} -> {after:,} bytes')


if __name__ == '__main__':
    main()
