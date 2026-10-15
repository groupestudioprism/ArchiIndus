#!/usr/bin/env python3
"""Assemble ARCHIINDUS en un seul fichier HTML à partir des sources de src/.

  src/parts/head.html       titre, polices, ouverture de <body>
  src/css/*.css             styles (ordre : CSS_ORDER)
  src/parts/body.html       structure de la page (intro, dessin, connexion, accueil)
  src/engine/*.js           moteur (script classique, fichiers concaténés dans l'ordre alphabétique)
  src/js/auth.js + cloud.js + auth-end.js
                            compte Studio Prism, code PIN, cloud, partage, accueil : module commun aux apps du studio
                            (repris d'ARCHIPLAN, collections ai*) ; script classique, une seule IIFE
  src/view3d/*.js           moteur 3D (module ES Three.js r160, importmap comme ARCHIPLAN)
  kernel/                   noyau géométrique OpenCascade (Web Worker, fichiers publiés tels quels, voir kernel/README.md)

Sorties :
  index.html                    site en ligne (GitHub Pages) : Firebase branché (projet commun Studio Prism)
  dist/archiindus-demo.html     démo autonome (comptes et cloud simulés dans le navigateur), utilisée par les tests
Usage : python3 tools/build.py
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
S = ROOT / 'src'
CSS_ORDER = ['tokens.css', 'app.css', 'cad.css', 'home.css']
FB = '10.12.2'
CONFIG = '''const FIREBASE_CONFIG = {
  // Projet Firebase commun de Studio Prism : le même que le site, ARCHIPLAN et ARCHITRAFIC. Configuration publique par conception.
  apiKey: "AIzaSyAAD5rrHuVh6_PC2_45L3y9F7zWe5ACW6E",
  authDomain: "archivision-studioprism.firebaseapp.com",
  projectId: "archivision-studioprism",
  storageBucket: "archivision-studioprism.firebasestorage.app",
  messagingSenderId: "226072216517",
  appId: "1:226072216517:web:0aeef645a4f1481fe801ac"
};'''
PRELOAD = ('<link rel="preconnect" href="https://www.gstatic.com" crossorigin>'
           '<link rel="preconnect" href="https://firestore.googleapis.com">'
           '<link rel="preconnect" href="https://identitytoolkit.googleapis.com">'
           '<link rel="preconnect" href="https://securetoken.googleapis.com">'
           + ''.join(f'<link rel="preload" as="script" href="https://www.gstatic.com/firebasejs/{FB}/firebase-{n}-compat.js">' for n in ('app', 'auth', 'firestore')))


def rd(p):
    return (S / p).read_text(encoding='utf-8')


def assemble(vendor='kernel/vendor/'):
    engine = ''.join(
        f'/* ==== {f.name} ==== */\n' + f.read_text(encoding='utf-8') + '\n'
        for f in sorted((S / 'engine').glob('*.js'))
    )
    view3d = ''.join(f.read_text(encoding='utf-8') + '\n' for f in sorted((S / 'view3d').glob('*.js')))
    css = ''.join(rd('css/' + c) for c in CSS_ORDER if (S / 'css' / c).exists())
    return (
        rd('parts/head.html')
        + '<style>\n' + css + '</style>\n'
        + rd('parts/body.html')
        + '<script>\nwindow.AI_KERNEL = {vendor: ' + json.dumps(vendor) + ', src: ' + json.dumps(rd('kernel/worker.js')).replace('</', '<\\/') + '};\n</script>\n'
        + '<script>\n' + engine + '</script>\n'
        + '<script>\n' + rd('js/auth.js') + rd('js/cloud.js') + rd('js/auth-end.js') + '</script>\n'
        + rd('parts/importmap.html')
        + '<script type="module">\n' + view3d + '</script>\n</body></html>\n'
    )


def main():
    demo = assemble('../kernel/vendor/')
    assert demo.count('const FIREBASE_CONFIG = null;') == 1 and f"FIREBASE_VERSION = '{FB}'" in demo
    (ROOT / 'dist').mkdir(exist_ok=True)
    (ROOT / 'dist' / 'archiindus-demo.html').write_text(demo, encoding='utf-8')
    live = assemble().replace('const FIREBASE_CONFIG = null;', CONFIG).replace('</head>', PRELOAD + '</head>', 1)
    (ROOT / 'index.html').write_text(live, encoding='utf-8')
    print('index.html', len(live.encode('utf-8')), 'octets · dist/archiindus-demo.html', len(demo.encode('utf-8')), 'octets')


if __name__ == '__main__':
    main()
