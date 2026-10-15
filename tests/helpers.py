"""Outils communs aux tests de bout en bout d'ARCHIINDUS (Playwright pour Python, Chromium sans interface).

L'application est servie en HTTP local (le noyau OpenCascade tourne dans un Web Worker module : il faut une origine http).
Page testée : dist/archiindus-demo.html (comptes et cloud simulés dans le navigateur). Réseau extérieur bloqué, sauf Three.js r160
servi depuis une copie locale (variable THREE_DIR, dossier node_modules/three).

    from helpers import App
    with App() as app:
        pg = app.page            # page ouverte, écran de compte contourné, exports autorisés (licence simulée)
"""
import contextlib, functools, http.server, os, pathlib, socketserver, threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
THREE = pathlib.Path(os.environ.get('THREE_DIR', '/tmp/claude-0/-home-claude/f90c60ab-0f3e-5af8-9815-4cd5756f9e00/scratchpad/npm/node_modules/three'))


class _Quiet(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.js': 'text/javascript'}

    def log_message(self, *a):
        pass


def serve():
    handler = functools.partial(_Quiet, directory=str(ROOT))
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class App:
    def __init__(self, width=1440, height=900, login=False, gl=True):
        self.size, self.login, self.gl = (width, height), login, gl
        self.errors, self.checks, self.fails = [], 0, []

    def __enter__(self):
        self.srv = serve()
        self.base = f'http://127.0.0.1:{self.srv.server_address[1]}/'
        self.pw = sync_playwright().start()
        args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] if self.gl else []
        self.browser = self.pw.chromium.launch(args=args)
        self.ctx = self.browser.new_context(viewport={'width': self.size[0], 'height': self.size[1]}, accept_downloads=True)
        self.ctx.route('**/*', self._route)
        self.page = self.ctx.new_page()
        self.page.on('pageerror', lambda e: self.errors.append('pageerror: ' + str(e)))
        self.page.on('console', lambda m: self.errors.append('console: ' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text and 'Failed to load resource' not in m.text else None)
        self.page.goto(self.base + 'dist/archiindus-demo.html')
        self.page.wait_for_function('window.__apReady === true', timeout=30000)
        if not self.login:
            self.enter()
        return self

    def _route(self, r):
        u = r.request.url
        if 'cdn.jsdelivr.net/npm/three@0.160.0/' in u:
            p = THREE / u.split('three@0.160.0/')[1]
            return r.fulfill(path=str(p), content_type='application/javascript') if p.exists() else r.abort()
        if u.startswith(self.base) or u.startswith('data:') or u.startswith('blob:'):
            return r.continue_()
        return r.abort()

    def enter(self):
        """Contourne l'écran de compte (testé à part) : application visible, licence simulée (exports autorisés)."""
        self.page.wait_for_timeout(400)
        self.page.evaluate("""() => { document.getElementById('auth').hidden = true; document.getElementById('home').hidden = true;
          const a = document.getElementById('app'); a.inert = false; const s = document.getElementById('splash'); if (s) s.remove();
          window.SPAccess = Object.freeze({level:'admin', canSave:true, canExport:true}); }""")

    def ok(self, cond, msg):
        self.checks += 1
        if not cond:
            self.fails.append(msg)
            print('ÉCHEC :', msg)

    def wait_kernel(self, timeout=120000):
        self.page.evaluate('Kernel.start(), 1')
        self.page.wait_for_function("Kernel.status() === 'ready' || Kernel.status() === 'error'", timeout=timeout)
        return self.page.evaluate('Kernel.status() + " " + Kernel.info()')

    def rebuild(self, extra=False, timeout=120000):
        """Attend une reconstruction complète du noyau pour l'état courant du document."""
        return self.page.evaluate("""async (extra) => { for (let i = 0; i < 400; i++) { const r = await Kernel.update({extra}); if (r) return {n: r.bodies.length, errors: r.errors, ms: r.ms}; await new Promise((s) => setTimeout(s, 100)); } return null; }""", extra)

    def report(self):
        errs = [e for e in self.errors if 'ERR_' not in e]
        print('erreurs page :', errs)
        self.ok(not errs, 'aucune erreur JavaScript')
        print(f'\n{self.checks} contrôles, {len(self.fails)} échec(s)')
        return 1 if self.fails else 0

    def __exit__(self, *a):
        with contextlib.suppress(Exception):
            self.browser.close()
        with contextlib.suppress(Exception):
            self.pw.stop()
        self.srv.shutdown()


BYPASS = """() => { document.getElementById('auth').hidden = true; document.getElementById('home').hidden = true;
  const a = document.getElementById('app'); a.inert = false; const s = document.getElementById('splash'); if (s) s.remove();
  window.SPAccess = Object.freeze({level:'admin', canSave:true, canExport:true}); }"""


def enter(pg, reload=False, url=None):
    """Ouvre (ou recharge) la démo autonome et contourne l'écran de compte (testé par e2e_compte.py)."""
    if reload:
        pg.reload()
    else:
        pg.goto(url or (ROOT / 'dist' / 'archiindus-demo.html').as_uri())
    pg.wait_for_function('window.__apReady === true', timeout=30000)
    pg.wait_for_timeout(300)
    pg.evaluate(BYPASS)
