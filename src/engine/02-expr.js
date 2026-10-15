/* Formules et variables du projet (comme les équations de SolidWorks ou les paramètres d'Inventor).
   Un champ numérique accepte une valeur (1500) ou une formule commençant ou non par « = » : L/2 + 10, 2*pi*R, sqrt(A^2+B^2),
   max(H, 300). Les noms renvoient aux variables du projet (d.vars : [{n, e, note}]), elles-mêmes définies par des formules.
   Fonctions : sqrt abs min max round floor ceil sin cos tan asin acos atan (degrés), pi. Pas d'eval : analyseur dédié. */
const Expr = (() => {
  const FN = {
    sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil,
    sin: (d) => Math.sin(d * Math.PI / 180), cos: (d) => Math.cos(d * Math.PI / 180), tan: (d) => Math.tan(d * Math.PI / 180),
    asin: (v) => Math.asin(v) * 180 / Math.PI, acos: (v) => Math.acos(v) * 180 / Math.PI, atan: (v) => Math.atan(v) * 180 / Math.PI,
  };
  const NAME = /^[A-Za-z_À-ÿ][A-Za-z0-9_À-ÿ]{0,30}$/;

  function tokens(s) {
    const out = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const num = /^(\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?/i.exec(s.slice(i));
      if (num) { out.push({ t: 'n', v: parseFloat(num[0].replace(',', '.')) }); i += num[0].length; continue; }
      const id = /^[A-Za-z_À-ÿ][A-Za-z0-9_À-ÿ]*/.exec(s.slice(i));
      if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
      if ('+-*/^(),;'.includes(c)) { out.push({ t: c === ';' ? ',' : c }); i++; continue; }
      throw new Error(`caractère inattendu « ${c} »`);
    }
    return out;
  }

  /* analyse descendante : expr := terme ((+|-) terme)* ; terme := puiss ((*|/) puiss)* ; puiss := unaire (^ puiss)? */
  function parse(src) {
    const tk = tokens(String(src).replace(/^\s*=/, '')); let k = 0;
    const peek = () => tk[k], eat = (t) => { if (!tk[k] || tk[k].t !== t) throw new Error(`« ${t} » attendu`); k++; };
    function primary() {
      const x = tk[k++];
      if (!x) throw new Error('formule incomplète');
      if (x.t === 'n') return { k: 'n', v: x.v };
      if (x.t === '(') { const e = expr(); eat(')'); return e; }
      if (x.t === '-') return { k: 'neg', a: power() };
      if (x.t === '+') return power();
      if (x.t === 'id') {
        if (peek() && peek().t === '(') {
          if (!FN[x.v.toLowerCase()]) throw new Error(`fonction inconnue « ${x.v} »`);
          k++; const args = [];
          if (!(peek() && peek().t === ')')) { args.push(expr()); while (peek() && peek().t === ',') { k++; args.push(expr()); } }
          eat(')'); return { k: 'fn', f: x.v.toLowerCase(), args };
        }
        if (x.v.toLowerCase() === 'pi') return { k: 'n', v: Math.PI };
        return { k: 'v', n: x.v };
      }
      throw new Error('formule mal écrite');
    }
    function power() { const a = primary(); if (peek() && peek().t === '^') { k++; return { k: '^', a, b: power() }; } return a; }
    function term() { let a = power(); while (peek() && (peek().t === '*' || peek().t === '/')) { const op = tk[k++].t; a = { k: op, a, b: power() }; } return a; }
    function expr() { let a = term(); while (peek() && (peek().t === '+' || peek().t === '-')) { const op = tk[k++].t; a = { k: op, a, b: term() }; } return a; }
    const e = expr();
    if (k < tk.length) throw new Error('formule mal écrite (fin inattendue)');
    return e;
  }
  function names(e, out = new Set()) {
    if (!e) return out;
    if (e.k === 'v') out.add(e.n);
    for (const x of [e.a, e.b, ...(e.args || [])]) if (x) names(x, out);
    return out;
  }
  function run(e, get) {
    switch (e.k) {
      case 'n': return e.v;
      case 'v': return get(e.n);
      case 'neg': return -run(e.a, get);
      case '+': return run(e.a, get) + run(e.b, get);
      case '-': return run(e.a, get) - run(e.b, get);
      case '*': return run(e.a, get) * run(e.b, get);
      case '/': { const b = run(e.b, get); if (b === 0) throw new Error('division par zéro'); return run(e.a, get) / b; }
      case '^': return Math.pow(run(e.a, get), run(e.b, get));
      case 'fn': return FN[e.f](...e.args.map((x) => run(x, get)));
    }
    throw new Error('formule invalide');
  }

  /* Valeurs de toutes les variables (dans l'ordre des dépendances). Erreurs par variable (boucle, nom inconnu…). */
  function solve(vars) {
    const byName = new Map(), vals = new Map(), errs = new Map();
    for (const v of vars || []) byName.set(v.n, v);
    const visiting = new Set();
    const get = (n) => {
      if (vals.has(n)) return vals.get(n);
      const v = byName.get(n);
      if (!v) throw new Error(`variable inconnue « ${n} »`);
      if (visiting.has(n)) throw new Error(`boucle : « ${n} » dépend d'elle-même`);
      visiting.add(n);
      try { const x = run(parse(v.e), get); if (!Number.isFinite(x)) throw new Error('résultat non numérique'); vals.set(n, x); return x; }
      finally { visiting.delete(n); }
    };
    for (const v of vars || []) { try { get(v.n); } catch (e) { errs.set(v.n, e.message); } }
    return { vals, errs };
  }

  /* Évalue un texte saisi : nombre ou formule. Renvoie {v, expr} (expr = '' pour un simple nombre) ou lève une Error en français. */
  function evalText(text, vars) {
    const s = String(text == null ? '' : text).trim();
    if (!s) throw new Error('valeur vide');
    if (/^-?\d+(?:[.,]\d+)?$/.test(s)) return { v: parseFloat(s.replace(',', '.')), expr: '' };
    const e = parse(s), { vals } = solve(vars);
    const v = run(e, (n) => { if (vals.has(n)) return vals.get(n); throw new Error(`variable inconnue « ${n} »`); });
    if (!Number.isFinite(v)) throw new Error('résultat non numérique');
    return { v, expr: s.replace(/^\s*=\s*/, '') };
  }
  const validName = (n) => NAME.test(n) && !FN[n.toLowerCase()] && n.toLowerCase() !== 'pi';

  return { parse, names, solve, evalText, validName };
})();
