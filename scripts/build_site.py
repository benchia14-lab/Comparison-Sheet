"""Assemble the Netlify site: QuoteLine.html behind Microsoft sign-in, plus the login page.

Runs on Netlify (see netlify.toml) and needs no network access. The site is the
browser app only; QuoteLine-Standalone.html stays an offline download from the repository.
"""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
AUTH_HEAD = ('<script src="/msal-browser.min.js"></script>\n'
             '  <script src="/app-config.js"></script>\n'
             '  <script src="/auth-guard.js"></script>\n'
             '  <link rel="apple-touch-icon" href="/apple-touch-icon.png">\n')


def main():
    shutil.rmtree(SITE, ignore_errors=True)
    shutil.copytree(ROOT / 'web', SITE)
    shutil.copy(ROOT / 'static/favicon.png', SITE / 'favicon.png')
    html = (ROOT / 'QuoteLine.html').read_text()
    marker = '  <meta name="viewport"'
    if marker not in html or 'auth-guard.js' in html:
        raise ValueError('QuoteLine.html head is not in the expected form')
    # The guard must run before the app renders, so it goes at the top of <head>.
    html = html.replace(marker, '  ' + AUTH_HEAD + marker, 1)
    (SITE / 'index.html').write_text(html)
    print('Built', SITE, sorted(p.name for p in SITE.iterdir()))


if __name__ == '__main__':
    main()
