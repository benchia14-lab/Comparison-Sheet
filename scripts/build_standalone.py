"""Build the offline HTML from the tested web UI and pinned browser libraries."""
from __future__ import annotations

import hashlib
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
]


def library(name, url, expected):
    with urlopen(url, timeout=30) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f'{name}: download checksum differs from the verified build input')
    text = data.decode('utf-8')
    if '</script' in text.lower():
        raise ValueError(f'{name}: unsafe inline script delimiter')
    return text


def main():
    html = (ROOT / 'templates/index.html').read_text()
    css = (ROOT / 'static/style.css').read_text()
    # The standalone page must not request a Google font when opened offline.
    css = css[css.index(':root'):]
    html = html.replace('<link rel="stylesheet" href="/static/style.css">', f'<style>\n{css}\n</style>')
    scripts = {name: library(name, url, digest) for name, url, digest in LIBRARIES}
    vendor = ROOT / 'static/vendor'
    vendor.mkdir(exist_ok=True)
    for name in ('pdf.min.js', 'pdf.worker.min.js'):
        (vendor / name).write_text(scripts[name])
    parts = [f'<script>\n{scripts[name]}\n</script>' for name in
             ('xlsx.full.min.js', 'pdf.min.js', 'mammoth.browser.min.js')]
    parts.append(f'<script id="pdf-worker" type="text/plain">\n{scripts["pdf.worker.min.js"]}\n</script>')
    parts.append("<script>pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([document.getElementById('pdf-worker').textContent], {type:'application/javascript'}));</script>")
    for name in ('standalone-adapter.js', 'app.js'):
        parts.append(f'<script>\n{(ROOT / "static" / name).read_text()}\n</script>')
    html = html.replace('<script src="/static/vendor/pdf.min.js"></script>\n  <script>pdfjsLib.GlobalWorkerOptions.workerSrc = \'/static/vendor/pdf.worker.min.js\';</script>\n  ', '')
    html = html.replace('<script src="/static/app.js"></script>', '\n'.join(parts))
    html = html.replace('QuoteLine · Comparison workspace', 'QuoteLine · Standalone comparison workspace')
    output = ROOT / 'QuoteLine-Standalone.html'
    output.write_text(html)
    print(f'Created {output} ({output.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
