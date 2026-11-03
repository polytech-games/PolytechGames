"""Build standalone index.html and dev.html using only Python's standard library.

python3 games/zhan-na-grani/tools/build.py [--check]
Edit src/game.js, src/style.css, src/page.html and assets/, then rebuild.
"""
from pathlib import Path
import argparse
import base64
import mimetypes
import re

ROOT = Path(__file__).resolve().parents[1]


def outputs():
    page = (ROOT / 'src/page.html').read_text()
    game = (ROOT / 'src/game.js').read_text()
    vendor = (ROOT / 'src/vendor/pixi.js').read_text()
    script = ('(() => {\n\"use strict\";\n'
              'const bundleURL = location.href;\n' + vendor + '\n' + game + '\n})();\n')
    dev_script = script
    style = (ROOT / 'src/style.css').read_text()

    def inline(match):
        name = match.group(2)
        path = ROOT / name
        mime = mimetypes.guess_type(path)[0]
        if not mime or not path.is_file():
            raise ValueError(f'Missing image: {name}')
        data = base64.b64encode(path.read_bytes()).decode('ascii')
        return match.group(1) + f'data:{mime};base64,{data}' + match.group(1)

    script = re.sub(r'([\x27\"])(assets/[^\x27\"]+\.(?:png|webp|jpg|avif))\1', inline, script)
    # A script string must never close the HTML script element.
    script = script.replace('</script', '<\\/script')
    yield ROOT / 'index.html', page.replace('<!-- GAME_STYLE -->', f'<style>\n{style}</style>').replace(
        '<!-- GAME_SCRIPT -->', f'<script>\n{script}</script>')
    yield ROOT / 'dev.html', page.replace('<!-- GAME_STYLE -->', '<link rel="stylesheet" href="src/style.css">').replace(
        '<!-- GAME_SCRIPT -->', '<script>\n' + dev_script.replace('</script', '<\\/script') + '</script>')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if generated HTML is out of date')
    args = parser.parse_args()
    for path, content in outputs():
        if args.check:
            if not path.exists() or path.read_text() != content:
                raise SystemExit(f'Out of date: {path.relative_to(ROOT)}; run tools/build.py')
        else:
            path.write_text(content)
        print(('Checked ' if args.check else 'Wrote ') + str(path.relative_to(ROOT)))


if __name__ == '__main__':
    main()
