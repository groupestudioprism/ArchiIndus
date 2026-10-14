/* Propriétés techniques extensibles : objet `props` {clé: nombre} sur les réseaux (net), structures (st) et équipements (sym).
   Chaque propriété est décrite une seule fois dans PROP_DEFS (libellé, unité, bornes, familles concernées) : formulaire, validation à
   l'import, nomenclature et étiquettes s'appuient sur cette table. Ajouter une propriété = ajouter une ligne ici.
   Les valeurs sont celles saisies par l'utilisateur : aucune vérification de conformité à une norme n'est faite. */
const PROP_DEFS = {
  zi:    { label: 'Altitude amont', unit: 'm', min: -1000, max: 10000, dec: 3, kinds: ['net'] },
  zf:    { label: 'Altitude aval', unit: 'm', min: -1000, max: 10000, dec: 3, kinds: ['net'] },
  depth: { label: 'Profondeur', unit: 'm', min: 0, max: 1000, dec: 2, kinds: ['net'] },
  q:     { label: 'Débit', unit: 'L/s', min: 0, max: 1e6, dec: 3, kinds: ['net', 'sym'] },
  pr:    { label: 'Pression', unit: 'bar', min: -1, max: 1000, dec: 2, kinds: ['net', 'sym'] },
  t:     { label: 'Température', unit: '°C', min: -273, max: 2000, dec: 1, kinds: ['net', 'sym'] },
  z:     { label: 'Altitude / niveau', unit: 'm', min: -1000, max: 10000, dec: 3, kinds: ['st', 'sym'] },
  h:     { label: 'Hauteur', unit: 'mm', min: 1, max: 100000, dec: 1, kinds: ['st'] },
};
const Props = (() => {
  const kindOf = (o) => (o.net ? 'net' : o.st ? 'st' : o.type === 'sym' ? 'sym' : null);
  const keys = (kind) => Object.keys(PROP_DEFS).filter((k) => PROP_DEFS[k].kinds.includes(kind));
  const round = (v, d) => { const f = 10 ** d; return Math.round(v * f) / f; };
  /* Ne garde que les clés connues de la famille, avec des nombres finis dans leurs bornes. Renvoie null si rien ne reste. */
  function clean(p, kind) {
    if (!kind || !p || typeof p !== 'object') return null;
    const out = {};
    for (const k of keys(kind)) {
      const d = PROP_DEFS[k], v = p[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= d.min && v <= d.max) out[k] = round(v, d.dec);
    }
    return Object.keys(out).length ? out : null;
  }
  /* Pente moyenne d'un réseau en % ((amont − aval) / longueur horizontale), si les deux altitudes sont connues. */
  function slope(o) {
    const p = o.props;
    if (!o.net || !p || typeof p.zi !== 'number' || typeof p.zf !== 'number') return null;
    const L = (Geo.length(o) || 0) / 1000;
    return L > 0 ? (p.zi - p.zf) / L * 100 : null;
  }
  const f = (v, d) => v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d });
  const fmtVal = (k, v) => `${f(v, PROP_DEFS[k].dec)} ${PROP_DEFS[k].unit}`;
  const slopeStr = (o) => { const s = slope(o); return s === null ? '' : f(s, 2) + ' %'; };
  /* « Altitude amont 12,5 m ; Débit 3 L/s » */
  const summary = (o) => keys(kindOf(o) || '').filter((k) => o.props && typeof o.props[k] === 'number').map((k) => `${PROP_DEFS[k].label} ${fmtVal(k, o.props[k])}`).join(' ; ');
  return { kindOf, keys, clean, slope, slopeStr, summary, fmtVal };
})();
