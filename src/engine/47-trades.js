/* Corps de métier : chaque métier regroupe ses calques, ses symboles, ses modes de tracé et ses matériaux ou profilés usuels.
   Le métier choisi (menu « Métier » au-dessus du dessin) filtre la bibliothèque, les modes de tracé et la liste des calques ;
   « Tous les métiers » montre l'ensemble. Le métier est un réglage d'affichage : il n'est pas enregistré dans le projet,
   les objets et les calques gardent leurs propres attributs (groupe de calque, net, st, props). Ajouter un métier = ajouter une entrée ici.
   Les métiers « à venir » sont listés mais désactivés : aucun outil spécifique n'existe encore pour eux. */
const TRADES = {
  humide: { label: 'Réseaux humides (TP / VRD)', short: 'Réseaux humides', groups: ['humide'], modes: ['net'], mode: 'net',
    mats: ['PVC', 'PEHD', 'Fonte ductile', 'Béton', 'Grès', 'Acier galvanisé'],
    layers: [['Eau potable', '#0877B9'], ['Eaux usées', '#8B5E34'], ['Eaux pluviales', '#169999'], ['Défense incendie', '#D9480F']] },
  sec: { label: 'Réseaux secs (TP / VRD)', short: 'Réseaux secs', groups: ['sec'], modes: ['net'], mode: 'net',
    mats: ['Câble', 'PEHD', 'PVC', 'Acier'],
    layers: [['Électricité', '#E2861B'], ['Télécoms', '#7C3AED'], ['Gaz', '#B7791F'], ['Éclairage public', '#C2A100']] },
  cvc: { label: 'CVC et fluides industriels', short: 'CVC et fluides', groups: ['cvc', 'equipement'], modes: ['net'], mode: 'net',
    mats: ['Acier', 'Inox', 'Cuivre', 'PEHD', 'Acier galvanisé'],
    layers: [['Chauffage', '#D9480F'], ['Ventilation', '#0DA5A5'], ['Eau glacée', '#1F89C5'], ['Fluides industriels', '#7C3AED'], ['Équipements', '#B3261E']] },
  metal: { label: 'Construction métallique', short: 'Construction métallique', groups: ['metal', 'structure'], modes: ['poutre', 'mur'], mode: 'poutre',
    layers: [['Charpente métallique', '#1B2433'], ['Contreventements', '#4B5563'], ['Serrurerie', '#6B7280']] },
  gc: { label: 'Génie civil et béton', short: 'Génie civil', groups: ['gc', 'structure'], modes: ['mur', 'poutre'], mode: 'mur',
    layers: [['Fondations', '#6B5B4B'], ['Voiles et dalles', '#8A8F98'], ['Ouvrages enterrés', '#5B4636']] },
};
const TRADES_SOON = ['Préfabrication et hors-site', 'Bâtiments logistiques et industriels', 'Façades et menuiseries complexes'];
const SYM_TRADES = {
  pompe: ['cvc', 'humide'], vanne: ['humide', 'cvc'], clapet: ['humide', 'cvc'], regard: ['humide', 'gc'], cuve: ['humide', 'cvc', 'gc'],
  compteur: ['humide', 'sec', 'cvc'], coffret: ['sec', 'cvc'], moteur: ['cvc'], ventilo: ['cvc'], echangeur: ['cvc'], filtre: ['humide', 'cvc'],
  ballon: ['cvc'], hydrant: ['humide'], chambre: ['sec'], chambreRac: ['sec'], candelabre: ['sec'], armoire: ['sec', 'cvc'],
  poteau: ['metal', 'gc'], poteauRond: ['metal', 'gc'], semelle: ['gc', 'metal'],
};
const Trades = (() => {
  const KEY = 'ai.trade';
  let cur = 'all';
  try { const v = localStorage.getItem(KEY); if (v === 'all' || TRADES[v]) cur = v; } catch (e) { /* stockage indisponible */ }
  const current = () => cur;
  const set = (id) => { if (id !== 'all' && !TRADES[id]) return false; cur = id; try { localStorage.setItem(KEY, id); } catch (e) { /* sans conséquence */ } return true; };
  /* Métier d'un calque d'après son groupe ('' = général : fond de plan, cotations, divers). */
  const ofGroup = (g) => Object.keys(TRADES).find((id) => TRADES[id].groups[0] === g) || Object.keys(TRADES).find((id) => TRADES[id].groups.includes(g)) || '';
  const layerIn = (l, id) => id === 'all' || !ofGroup(l.group) || TRADES[id].groups.includes(l.group);
  const symbolIn = (k, id) => id === 'all' || (SYM_TRADES[k] || []).includes(id);
  const modeAllowed = (m, id) => m === 'none' || id === 'all' || TRADES[id].modes.includes(m);
  const missingLayers = (id, layers) => (TRADES[id] ? TRADES[id].layers.filter(([n]) => !layers.some((l) => l.name.toLowerCase() === n.toLowerCase())) : []);
  return { current, set, ofGroup, layerIn, symbolIn, modeAllowed, missingLayers };
})();
