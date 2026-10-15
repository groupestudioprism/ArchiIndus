/* ============ Bibliothèque de matériaux d'ARCHIINDUS : mécanique, thermique, hygrométrie, carbone ============
   Même principe que la bibliothèque d'ARCHIPLAN (src/engine/10-materials.js), complétée des caractéristiques mécaniques
   nécessaires au calcul des déformations. Unités :
     rho kg/m³ · E, G, fy, fu, fk MPa (N/mm²) · nu (−) · alpha 1/K (dilatation linéique) · lambda W/(m·K) · c J/(kg·K)
     mu facteur de résistance à la vapeur (−) · gwp kg CO2e/kg (production A1-A3, valeur générique) · R m²·K/W (lames d'air).
   Sources des valeurs mécaniques (valeurs caractéristiques ou nominales, épaisseurs courantes) :
     - Aciers de construction : EN 1993-1-1 § 3.2 et tableau 3.1 (t ≤ 40 mm) ; E 210 000, G 81 000, ν 0,3, α 12·10⁻⁶.
     - Aciers inoxydables : EN 1993-1-4 tableau 2.1 (tôles laminées à chaud) ; E 200 000, G 76 900.
     - Aluminium : EN 1999-1-1 § 3.2.5 et tableau 3.2b (profilés filés) ; E 70 000, G 27 000, α 23·10⁻⁶.
     - Bétons : EN 1992-1-1 tableau 3.1 (fck, fctm, Ecm) ; ν 0,2, α 10·10⁻⁶.
     - Armatures : EN 1992-1-1 § 3.2 (B500B, Es 200 000).
     - Bois massif : EN 338 ; lamellé-collé : EN 14080 (E0,mean, fm,k, ρ moyen).
     - Fonte ductile : EN 1563 (EN-GJS-500-7).
   Les valeurs marquées « typique » (plastiques, cuivre, isolants…) sont des ordres de grandeur de fiches fabricants :
   à remplacer par la fiche technique du produit retenu. Valeurs thermiques : ordre de grandeur EN ISO 10456 / règles Th-U.
   Aucune de ces valeurs ne remplace une note de calcul signée : elles servent au pré-dimensionnement. */
const MAT_CATS = ['Aciers', 'Aciers inoxydables', 'Aluminium', 'Fontes et cuivreux', 'Bétons', 'Armatures', 'Bois', 'Maçonnerie',
  'Plastiques (réseaux)', 'Isolants', 'Bardages et couvertures', 'Verre', 'Étanchéité et divers'];
const MATS = {};
function MI(id, nom, cat, p) { MATS[id] = { nom, cat, rho: 1000, lambda: 1, c: 1000, mu: 1, gwp: 0, color: '#9AA3AD', ...p }; }
const ST_E = { E: 210000, G: 81000, nu: 0.3, alpha: 12e-6, rho: 7850, lambda: 50, c: 450, mu: 1e6, color: '#8C96A2', src: 'EN 1993-1-1' };
// ---- Aciers de construction (EN 10025-2, EN 1993-1-1 tableau 3.1, t ≤ 40 mm)
MI('S235', 'Acier S235', 'Aciers', { ...ST_E, fy: 235, fu: 360, gwp: 1.55 });
MI('S275', 'Acier S275', 'Aciers', { ...ST_E, fy: 275, fu: 430, gwp: 1.55 });
MI('S355', 'Acier S355', 'Aciers', { ...ST_E, fy: 355, fu: 490, gwp: 1.55 });
MI('S320GD', 'Tôle galvanisée S320GD (bardage, bac)', 'Aciers', { ...ST_E, fy: 320, fu: 390, gwp: 2.40, src: 'EN 10346', color: '#7D8893' });
MI('acierGalva', 'Acier galvanisé (tube, serrurerie) S235', 'Aciers', { ...ST_E, fy: 235, fu: 360, gwp: 1.90, color: '#A9B2BA' });
// ---- Aciers inoxydables (EN 1993-1-4 tableau 2.1, tôles laminées à chaud)
MI('inox304', 'Inox 1.4301 (304)', 'Aciers inoxydables', { E: 200000, G: 76900, nu: 0.3, alpha: 16e-6, rho: 7900, lambda: 15, c: 500, mu: 1e6, fy: 210, fu: 520, gwp: 4.40, color: '#B9C0C6', src: 'EN 1993-1-4' });
MI('inox316', 'Inox 1.4404 (316L)', 'Aciers inoxydables', { E: 200000, G: 76900, nu: 0.3, alpha: 16e-6, rho: 8000, lambda: 15, c: 500, mu: 1e6, fy: 220, fu: 520, gwp: 4.80, color: '#C2C8CD', src: 'EN 1993-1-4' });
// ---- Aluminium (EN 1999-1-1, profilés filés)
MI('alu6060', 'Aluminium EN AW-6060 T6 (t ≤ 15 mm)', 'Aluminium', { E: 70000, G: 27000, nu: 0.3, alpha: 23e-6, rho: 2700, lambda: 200, c: 880, mu: 1e6, fy: 140, fu: 170, gwp: 6.70, color: '#C3CAD2', src: 'EN 1999-1-1' });
MI('alu6082', 'Aluminium EN AW-6082 T6 (t ≤ 5 mm)', 'Aluminium', { E: 70000, G: 27000, nu: 0.3, alpha: 23e-6, rho: 2700, lambda: 170, c: 880, mu: 1e6, fy: 250, fu: 290, gwp: 6.70, color: '#BCC4CC', src: 'EN 1999-1-1' });
// ---- Fontes et cuivreux
MI('fonteGS', 'Fonte ductile EN-GJS-500-7', 'Fontes et cuivreux', { E: 169000, G: 66000, nu: 0.275, alpha: 12.5e-6, rho: 7100, lambda: 36, c: 515, mu: 1e6, fy: 320, fu: 500, gwp: 1.50, color: '#4D5155', src: 'EN 1563' });
MI('cuivre', 'Cuivre Cu-DHP (tube R250)', 'Fontes et cuivreux', { E: 115000, nu: 0.34, alpha: 17e-6, rho: 8930, lambda: 380, c: 385, mu: 1e6, fu: 250, gwp: 2.70, color: '#B87333', src: 'EN 1057 · E typique' });
// ---- Bétons (EN 1992-1-1 tableau 3.1) : fk = fck (compression), ft = fctm (traction moyenne)
const BE = { nu: 0.2, alpha: 10e-6, rho: 2500, lambda: 2.3, c: 1000, mu: 130, gwp: 0.16, color: '#A9AEB1', src: 'EN 1992-1-1' };
MI('C20', 'Béton armé C20/25', 'Bétons', { ...BE, fk: 20, ft: 2.2, E: 30000 });
MI('C25', 'Béton armé C25/30', 'Bétons', { ...BE, fk: 25, ft: 2.6, E: 31000 });
MI('C30', 'Béton armé C30/37', 'Bétons', { ...BE, fk: 30, ft: 2.9, E: 33000 });
MI('C35', 'Béton armé C35/45', 'Bétons', { ...BE, fk: 35, ft: 3.2, E: 34000 });
MI('C40', 'Béton armé C40/50', 'Bétons', { ...BE, fk: 40, ft: 3.5, E: 35000 });
MI('betonNA', 'Béton non armé C25/30', 'Bétons', { ...BE, fk: 25, ft: 2.6, E: 31000, rho: 2300, lambda: 1.75, mu: 100, gwp: 0.13 });
// ---- Armatures
MI('B500B', 'Acier pour béton armé B500B', 'Armatures', { E: 200000, nu: 0.3, alpha: 12e-6, rho: 7850, lambda: 50, c: 450, mu: 1e6, fy: 500, fu: 540, gwp: 1.40, color: '#7A6E64', src: 'EN 1992-1-1 · EN 10080' });
// ---- Bois (EN 338, EN 14080) : fy = fm,k (flexion), E = E0,mean ; α parallèle au fil typique
const BO = { alpha: 4e-6, lambda: 0.13, c: 1600, mu: 50, color: '#D8B27A' };
MI('boisC24', 'Bois massif résineux C24', 'Bois', { ...BO, fy: 24, E: 11000, G: 690, rho: 420, rhok: 350, gwp: 0.26, src: 'EN 338' });
MI('boisC30', 'Bois massif résineux C30', 'Bois', { ...BO, fy: 30, E: 12000, G: 750, rho: 460, rhok: 380, gwp: 0.26, src: 'EN 338' });
MI('GL24h', 'Lamellé-collé GL24h', 'Bois', { ...BO, fy: 24, E: 11500, G: 650, rho: 420, rhok: 385, gwp: 0.38, color: '#D6AE72', src: 'EN 14080' });
MI('GL28h', 'Lamellé-collé GL28h', 'Bois', { ...BO, fy: 28, E: 12600, G: 650, rho: 460, rhok: 425, gwp: 0.38, color: '#D3A86A', src: 'EN 14080' });
// ---- Maçonnerie (thermique, masse) — résistance non donnée : dépend du produit et du mortier (EN 1996)
MI('parpaing', 'Bloc béton creux B40', 'Maçonnerie', { rho: 1350, lambda: 1.0, c: 1000, mu: 10, gwp: 0.10, alpha: 8e-6, color: '#BDB6A8', src: 'thermique Th-U' });
MI('parpaingP', 'Bloc béton plein', 'Maçonnerie', { rho: 2000, lambda: 1.40, c: 1000, mu: 15, gwp: 0.11, alpha: 8e-6, color: '#B3AC9F', src: 'thermique Th-U' });
MI('brique', 'Brique terre cuite alvéolaire', 'Maçonnerie', { rho: 800, lambda: 0.40, c: 1000, mu: 10, gwp: 0.24, alpha: 6e-6, color: '#C47A52', src: 'thermique Th-U' });
// ---- Plastiques de réseaux (valeurs typiques, MRS selon EN ISO 12162)
MI('PVC', 'PVC-U (canalisations)', 'Plastiques (réseaux)', { E: 3000, nu: 0.38, alpha: 80e-6, rho: 1400, lambda: 0.17, c: 900, mu: 5e4, mrs: 25, gwp: 3.10, color: '#E9ECEF', src: 'typique · MRS 25' });
MI('PE100', 'PEHD PE100', 'Plastiques (réseaux)', { E: 1100, nu: 0.4, alpha: 200e-6, rho: 960, lambda: 0.40, c: 1900, mu: 1e5, mrs: 10, gwp: 2.00, color: '#2F3437', src: 'typique · MRS 10' });
MI('PPR', 'Polypropylène PP-R', 'Plastiques (réseaux)', { E: 900, nu: 0.4, alpha: 150e-6, rho: 900, lambda: 0.22, c: 1800, mu: 1e5, mrs: 8, gwp: 1.95, color: '#5E8B4A', src: 'typique · MRS 8' });
// ---- Isolants (ArchiPlan)
MI('laineRoche', 'Laine de roche', 'Isolants', { rho: 40, lambda: 0.035, c: 1030, mu: 1, gwp: 1.28, color: '#D8BF6E', src: 'thermique' });
MI('laineRocheD', 'Laine de roche haute densité (bardage, ITE)', 'Isolants', { rho: 140, lambda: 0.038, c: 1030, mu: 1, gwp: 1.28, color: '#CBB062', src: 'thermique' });
MI('PIR', 'Polyuréthane PIR (parements alu)', 'Isolants', { rho: 32, lambda: 0.022, c: 1400, mu: 60, gwp: 3.48, color: '#E7D9A8', src: 'thermique' });
MI('PSE', 'Polystyrène expansé PSE', 'Isolants', { rho: 20, lambda: 0.032, c: 1450, mu: 60, gwp: 3.29, color: '#E9EEF0', src: 'thermique' });
MI('XPS', 'Polystyrène extrudé XPS', 'Isolants', { rho: 32, lambda: 0.032, c: 1450, mu: 150, gwp: 3.40, color: '#A9CBE4', src: 'thermique' });
MI('laineVerre', 'Laine de verre', 'Isolants', { rho: 15, lambda: 0.035, c: 1030, mu: 1, gwp: 1.35, color: '#E8D56F', src: 'thermique' });
// ---- Bardages et couvertures
MI('bacAcier', 'Bac acier laqué (nervuré)', 'Bardages et couvertures', { ...ST_E, fy: 320, fu: 390, gwp: 2.40, color: '#5F6B76', src: 'EN 10346 (S320GD)' });
MI('bardageAcier', 'Bardage acier laqué (plateau + parement)', 'Bardages et couvertures', { ...ST_E, fy: 320, fu: 390, gwp: 2.40, color: '#9AA6B1', src: 'EN 10346 (S320GD)' });
MI('fibroCiment', 'Plaque fibres-ciment', 'Bardages et couvertures', { rho: 1500, lambda: 0.35, c: 1050, mu: 50, gwp: 0.60, alpha: 10e-6, color: '#A8A8A2', src: 'typique' });
// ---- Verre (EN 572, EN 16612)
MI('verre', 'Verre float', 'Verre', { E: 70000, nu: 0.22, alpha: 9e-6, rho: 2500, lambda: 1.0, c: 750, mu: 1e6, fy: 45, gwp: 1.44, color: '#9FD0E2', src: 'EN 572 · fg,k 45' });
// ---- Étanchéité et divers (ArchiPlan)
MI('bitume', 'Membrane bitumineuse', 'Étanchéité et divers', { rho: 1100, lambda: 0.23, c: 1000, mu: 50000, gwp: 0.43, color: '#2C2E31' });
MI('paraVapeur', 'Pare-vapeur polyéthylène', 'Étanchéité et divers', { rho: 920, lambda: 0.33, c: 2200, mu: 100000, gwp: 2.0, color: '#D6E7EE' });
MI('chape', 'Chape ciment', 'Étanchéité et divers', { rho: 2000, lambda: 1.40, c: 1000, mu: 50, gwp: 0.17, alpha: 10e-6, color: '#9C978E' });
MI('resine', 'Résine époxy (sol industriel)', 'Étanchéité et divers', { rho: 1400, lambda: 0.20, c: 1400, mu: 1e4, gwp: 5.70, color: '#9AA7B0' });
MI('gravier', 'Grave / hérisson', 'Étanchéité et divers', { rho: 1700, lambda: 2.0, c: 1000, mu: 50, gwp: 0.004, color: '#A8A49B' });
MI('airNV', 'Lame d\'air non ventilée', 'Étanchéité et divers', { rho: 1.2, lambda: 0.025, c: 1000, mu: 1, R: 0.18, color: '#EAF4F8' });
MI('airFV', 'Lame d\'air faiblement ventilée', 'Étanchéité et divers', { rho: 1.2, lambda: 0.025, c: 1000, mu: 1, R: 0.09, color: '#EAF4F8' });
MI('enduit', 'Enduit ciment', 'Étanchéité et divers', { rho: 1800, lambda: 1.15, c: 1000, mu: 15, gwp: 0.20, color: '#E7E1D3' });
MI('ba13', 'Plaque de plâtre BA13', 'Étanchéité et divers', { rho: 800, lambda: 0.25, c: 1000, mu: 10, gwp: 0.39, color: '#F2F0EA' });

/* Matériau par défaut selon le type d'objet (aucun matériau saisi) */
const MAT_DEFAULT = { poutre: 'S235', mur: 'C25', poteau: 'S235', net: { PVC: 'PVC', PEHD: 'PE100', 'Fonte ductile': 'fonteGS', Acier: 'S235', 'Acier galvanisé': 'acierGalva', Inox: 'inox304', Béton: 'betonNA', Cuivre: 'cuivre' } };
const matOf = (id) => MATS[id] || null;
const cleanMatId = (v) => (typeof v === 'string' && MATS[v] ? v : '');
