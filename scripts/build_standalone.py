"""Build the offline HTML and the standard CDN-linked HTML from the tested web UI."""
from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
LIBRARIES = [
    ('xlsx.full.min.js', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
     'c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99'),
    ('pdf.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.min.js',
     '1fc294eefda602e591a06c1d5af361cae23756b5a334fc2421d5f9accce038e5'),
    ('mammoth.browser.min.js', 'https://cdn.jsdelivr.net/npm/mammoth@1.11.0/mammoth.browser.min.js',
     '62773d3b21c7130342148e78abf7b97dbd3103463d3ffc5a68601a2a007e1cf1'),
    ('pdf.worker.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js',
     '99732130603cd4980f009a29a38a86373b43ffb9ae22c35ec85440f311ceddfc'),
    ('exceljs.min.js', 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
     '7e49da68588e250dbb8bba190d2caa8ab3787cc0284bda1d8b2f805c4df742c9'),
]
# Loaded with <script> tags in this order; the PDF worker is handled separately.
PAGE_LIBRARIES = ('xlsx.full.min.js', 'pdf.min.js', 'mammoth.browser.min.js', 'exceljs.min.js')
SERVER_SCRIPTS = re.compile(r'\s*<script src="/static/[^"]+"></script>|\s*<script>pdfjsLib\.GlobalWorkerOptions[^<]*</script>')


def library(name, url, expected):
    with urlopen(url, timeout=30) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f'{name}: download checksum differs from the verified build input')
    text = data.decode('utf-8')
    if '</script' in text.lower():
        raise ValueError(f'{name}: unsafe inline script delimiter')
    return text


def page():
    html = (ROOT / 'templates/index.html').read_text()
    css = (ROOT / 'static/style.css').read_text()
    # Neither single-file page requests a Google font, so both look the same offline.
    css = css[css.index(':root'):]
    return html.replace('<link rel="stylesheet" href="/static/style.css">', f'<style>\n{css}\n</style>')


def with_scripts(html, parts):
    """Replace the Flask page's /static script tags with the single-file scripts."""
    html = SERVER_SCRIPTS.sub('', html)
    return html.replace('</body>', '  ' + '\n'.join(parts) + '\n</body>')


def app_scripts():
    return [f'<script>\n{(ROOT / "static" / name).read_text()}\n</script>'
            for name in ('export-workbook.js', 'standalone-adapter.js', 'app.js')]


def build_standard():
    """Write a regular-sized HTML page that loads the pinned libraries from the CDN."""
    sri = {name: (url, 'sha256-' + base64.b64encode(bytes.fromhex(digest)).decode())
           for name, url, digest in LIBRARIES}
    parts = [f'<script src="{sri[name][0]}" integrity="{sri[name][1]}" crossorigin="anonymous"></script>'
             for name in PAGE_LIBRARIES]
    parts.append(f"<script>pdfjsLib.GlobalWorkerOptions.workerSrc = '{sri['pdf.worker.min.js'][0]}';</script>")
    parts += app_scripts()
    html = with_scripts(page(), parts)
    output = ROOT / 'QuoteLine.html'
    output.write_text(html)
    print(f'Created {output} ({output.stat().st_size:,} bytes)')


def main():
    build_standard()
    html = page()
    scripts = {name: library(name, url, digest) for name, url, digest in LIBRARIES}
    vendor = ROOT / 'static/vendor'
    vendor.mkdir(exist_ok=True)
    for name in ('pdf.min.js', 'pdf.worker.min.js', 'exceljs.min.js'):
        (vendor / name).write_text(scripts[name])
    parts = [f'<script>\n{scripts[name]}\n</script>' for name in
             PAGE_LIBRARIES]
    parts.append(f'<script id="pdf-worker" type="text/plain">\n{scripts["pdf.worker.min.js"]}\n</script>')
    parts.append("<script>pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([document.getElementById('pdf-worker').textContent], {type:'application/javascript'}));</script>")
    parts += app_scripts()
    html = with_scripts(html, parts)
    html = html.replace('QuoteLine · Comparison workspace', 'QuoteLine · Standalone comparison workspace')
    output = ROOT / 'QuoteLine-Standalone.html'
    output.write_text(html)
    print(f'Created {output} ({output.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
