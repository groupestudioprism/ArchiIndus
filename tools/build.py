#!/usr/bin/env python3
"""Assemble ARCHIINDUS en un seul fichier HTML à partir des sources de src/.

  src/parts/head.html     titre, polices, ouverture de <body>
  src/css/*.css           styles (ordre : CSS_ORDER)
  src/parts/body.html     structure de la page
  src/engine/*.js         moteur (script classique, fichiers concaténés dans l'ordre alphabétique)
  src/view3d/*.js         moteur 3D (module ES Three.js r160, importmap comme ArchiPlan)
  src/parts/importmap.html  carte d'import de Three.js (CDN jsDelivr, même version qu'ArchiPlan)

Sortie : index.html (publication GitHub Pages).
Usage  : python3 tools/build.py

Même principe qu'ArchiPlan (tools/build.py). Firebase n'est PAS encore branché :
voir README.md, section « Comptes et licences ».
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
S = ROOT / 'src'
CSS_ORDER = ['tokens.css', 'app.css', 'home.css']


def rd(p):
    return (S / p).read_text(encoding='utf-8')


def assemble():
    engine = ''.join(
        f'/* ==== {f.name} ==== */\n' + f.read_text(encoding='utf-8') + '\n'
        for f in sorted((S / 'engine').glob('*.js'))
    )
    view3d = ''.join(f.read_text(encoding='utf-8') + '\n' for f in sorted((S / 'view3d').glob('*.js')))
    return (
        rd('parts/head.html')
        + '<style>\n' + ''.join(rd('css/' + c) for c in CSS_ORDER) + '</style>\n'
        + rd('parts/body.html')
        + '<script>\n' + engine + '</script>\n'
        + rd('parts/importmap.html')
        + '<script type="module">\n' + view3d + '</script>\n</body></html>\n'
    )


def main():
    html = assemble()
    (ROOT / 'index.html').write_text(html, encoding='utf-8')
    print('index.html', len(html.encode('utf-8')), 'octets')


if __name__ == '__main__':
    main()
