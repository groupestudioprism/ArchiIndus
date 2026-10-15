# ARCHIINDUS · Studio Prism

Application de conception de plans industriels, de réseaux techniques et de pièces 3D (réseaux humides, réseaux secs, CVC, construction métallique, génie civil), de la suite **Studio Prism**. Même compte, même charte et mêmes règles que ARCHIPLAN et ARCHITRAFIC.

> **État (15/10/2026)** : poste CAO sur noyau géométrique **OpenCascade** (booléens, congés, coques, STEP), compte Studio Prism commun (code PIN, fiche client, Particulier / Entreprise, partage, mode découverte), outils métier (hydraulique, profil en long, conflits, calcul de charpente), échanges IFC4 / DXF / STEP / STL. **354 contrôles automatiques** dans Chromium sans interface (`tests/`), plus les règles Firestore à l'émulateur dans l'intégration continue. Rien n'a encore été essayé sur un téléphone réel ni dans un logiciel de CAO tiers (sauf l'IFC, relu par IfcOpenShell).
> **À faire par le propriétaire** : publier les règles Firestore communes (`firebase/firestore.rules`, voir « Règles Firestore » ci-dessous) ; activer GitHub Pages sur la branche principale ; créer la fiche produit `archiindus` dans l'administration du site.

## Noyau géométrique OpenCascade (`kernel/`, `src/kernel/worker.js`, `src/engine/42-kernel.js`) — `tests/e2e_noyau.py`

- **OpenCascade** (B-rep, le noyau de FreeCAD) compilé en WebAssembly, via **replicad** 1.1.0 ; il tourne dans un **Web Worker** : la reconstruction ne bloque jamais l'interface. Chargé à la demande (première fonction 3D), depuis la copie publiée avec l'app (`kernel/vendor/`, 23 Mo, mise en cache par le navigateur), sinon depuis jsDelivr. Sans noyau (hors ligne au premier chargement), affichage approché comme avant.
- **Fonctions** : bossage extrudé (fusion avec le corps touché, ou nouveau corps), **enlèvement extrudé** (perçage « à travers tout »), révolution (ajout ou enlèvement), **congé**, **chanfrein** (toutes les arêtes, verticales, horizontales, dessus, dessous), **coque** (face ouverte au choix), **répétition** linéaire ou circulaire, **symétrie** (d'une fonction ou du corps), **tuyauterie 3D** (section circulaire balayée le long d'un réseau du plan, coudes cintrés). Cercles exacts (plus de polygones à 48 côtés).
- **Arbre de création** : barre de **retour arrière** (glisser, flèches du clavier), **glisser-déposer** pour réordonner, désactivation, fonctions en erreur signalées avec un message lisible (rayon de congé trop grand, etc.), menu contextuel (clic droit).
- **Équations** : variables du projet et **formules** dans tous les champs (`=L/2+10`, `sqrt`, `min`, `max`, trigonométrie en degrés) ; modifier une variable recalcule les cotes et le modèle.
- **Vue 3D** : pré-sélection au survol, **sélection dans la vue** (synchronisée avec l'arbre), **barre contextuelle** près du curseur, **double-clic sur une face plane → esquisse sur la face** (contour de la face rappelé et accrochable), **vue normale à la face**, **cube de vue**, **coupe dynamique**, zoom molette maîtrisé (même réglage qu'ARCHIPLAN) centré sur le curseur.
- **Propriétés de masse** exactes (volume, centre de gravité, surface) et **matrice d'inertie** ; **détection des interférences** entre corps, composants, réseaux, murs, poutres et équipements (raccordements voulus ignorés), avec jeu minimal.
- **Mise en plan** : vues de face, dessus et gauche projetées depuis le corps (arêtes vues et cachées), projection européenne, encombrements cotés, échelle proposée pour un A3, cartouche ; téléchargement SVG.
- **Exports** : **STEP** (AP214, solides B-rep : SolidWorks, Inventor, CATIA, FreeCAD), **STL** binaire (impression 3D).

## Outils métier et échanges — `tests/e2e_metiers.py`

- **Hydraulique** (`src/engine/82-networks.js`) : réseaux gravitaires (Manning-Strickler à pleine section, débit capable, vitesse, remplissage, alertes de pente et d'autocurage) et en charge (Darcy-Weisbach, λ de Swamee-Jain, pertes, HMT) ; export CSV.
- **Profil en long** du réseau sélectionné : fil d'eau, génératrice, terrain naturel IGN si le site est chargé, pentes, PK, profondeurs ; SVG.
- **Conflits entre réseaux** : distance 3D entre génératrices (altitudes comprises), seuil réglable, localisation dans le plan.
- **Calcul de structure filaire** (`src/engine/83-frame.js`) : méthode des déplacements 3D (6 ddl/nœud) sur les profilés de l'assemblage et les poutres du plan, jonctions automatiques (traverse posée sur un poteau), pieds encastrés ou articulés, poids propre + charge répartie ; efforts, contraintes, flambement (courbe b), flèches, taux de travail colorés en 3D. Vérifié sur des cas de référence (qL²/12, qL²/2, équilibre des réactions). **Indicatif : pas une note de calcul aux Eurocodes.**
- **Liste de débit** (mécano-soudure) des profilés : repères, longueurs, quantités, masses ; CSV.
- **IFC4** (`src/engine/84-interop.js`) : `IfcPipeSegment` / `IfcCableSegment` par tronçon, équipements, murs, poutres et poteaux (profils en I), corps 3D triangulés, matériaux et propriétés (DN, débit, pression, pente). Relu sans erreur par IfcOpenShell (géométrie comprise).
- **Import DXF** : LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, TEXT, MTEXT ; unités ($INSUNITS), calques recréés, accents Windows-1252. **Export DXF** : accents désormais conservés (Windows-1252 déclaré).
- **Dessin 2D** : décaler (O), ajuster (A), prolonger (X), symétrie (I), rotation (Q, angle au clavier), échelle (U, facteur au clavier) ; **gestes de souris** (clic droit glissé : ligne, rectangle, cercle, cote, polyligne, ajuster, sélection, tout voir) ; **pincement à deux doigts** sur tablette ; **barre de raccourcis** (touche S, chiffres 1 à 0).

## Compte Studio Prism, cloud et licence (`src/js/`) — `tests/e2e_compte.py`

Module **commun** aux apps du studio (repris d'ARCHIPLAN, comme ARCHITRAFIC), sur le projet Firebase commun `archivision-studioprism` :
connexion et création de compte (comptes **Particulier** et **Entreprise** distincts, validation des entreprises par un administrateur), bouton **« Afficher »** sur les mots de passe, **fiche client**, **code PIN** (haché, commun au compte, Face ID / empreinte en option, verrouillage), accueil **« Mes projets » / « Partagés avec moi »**, dossiers, **partage** par email ou par lien, miniatures, **enregistrement automatique**, licence `licenses/{uid}_archiindus` (clé de licence acceptée), **mode découverte** sans licence (tous les outils, cloud 10 Mo, exports réservés aux licences), suppression du compte sur le site Studio Prism (pour toutes les apps). Un compte supprimé ou désactivé par l'administration est déconnecté et oublié de l'appareil.
Quotas : 10 Mo sans licence, 50 Mo avec licence, 1 Go administrateur. Collections `aiProjects`, `aiFolders`, `aiShares`, `aiGrants`, `aiUsage`, `aiLibrary`.

`dist/archiindus-demo.html` (produit par `tools/build.py`) est une démo autonome : comptes et cloud simulés dans le navigateur (un email contenant « decouverte » montre le mode découverte ; une clé commençant par ARCH active une licence).

## Règles Firestore (fichier COMMUN au site, à ARCHIPLAN, ARCHITRAFIC et ARCHIINDUS)

- `firebase/firestore.rules` : règles complètes à publier, produites par `python3 tools/make_rules.py firebase/firestore.base.rules > firebase/firestore.rules` (le bloc ARCHIINDUS est dérivé du bloc ARCHIPLAN, comme le bloc ARCHITRAFIC). `firebase/firestore.base.rules` = règles publiées relevées le 15/10/2026 (dépôts archiplan et ArchiTraffic, identiques).
- **Garde-fou** : `python3 tools/check_rules.py firebase/firestore.rules` refuse tout fichier auquel il manque un bloc (site, ARCHIPLAN, ARCHITRAFIC, ARCHIINDUS, code PIN). À lancer avant **chaque** publication, depuis n'importe quelle app : c'est ce manque qui a bloqué le cloud d'ArchiIndus le 15/10/2026.
- Testées à l'émulateur dans l'intégration continue (`tests/rules/`, `.github/workflows/tests.yml`) : cycle de vie, quotas, partage, confidentialité, et non-régression des blocs ap* et at*.
- Les projets ArchiIndus créés avant le partage (v1/v2) restent lisibles ; le champ manquant `linkMode` est ajouté à leur prochain enregistrement.

## Poste de conception (type SolidWorks / Inventor / Revit) — testé dans Chromium sans interface, `tests/e2e_cao.py`

- **Ruban à onglets** : Esquisse, Fonctions 3D, Assemblage, Métiers, Site, Matériaux, Analyse, Affichage ; **arbre de création** à gauche (plans Dessus / Face / Droite, esquisses, fonctions, composants, site ; affiché par défaut à partir de 1440 px de large, bouton à gauche des onglets sinon) ; **propriétés** à droite selon l'élément sélectionné.
- **Esquisses sur plans** (`src/engine/41-model.js`) : nouvelle esquisse sur Dessus (X·Y), Face (X·Z) ou Droite (Y·Z), décalable ; le dessin 2D se fait dans l'esquisse (bandeau « Quitter l'esquisse »). Les esquisses de face et de droite n'apparaissent pas dans la vue en plan ni dans ses exports.
- **Fonctions 3D** : **bossage extrudé** (contours fermés, un contour intérieur fait un trou ; sens normal, opposé ou symétrique) et **révolution** autour d'une ligne de l'esquisse (angle). Paramétriques : modifier l'esquisse, la profondeur ou l'angle régénère le volume. Volume exact (aire × profondeur ; règle de Guldin pour la révolution ; cercles approchés par des polygones de 48 côtés), masse selon le matériau. Pas d'enlèvement de matière (pas de booléens) pour l'instant.
- **Assemblage** : bibliothèque de pièces paramétriques (profilé acier IPE / HEA / HEB / UPN, platine percée, dalle, massif, cuve, regard, groupe motopompe, garde-corps), position, rotation, matériau ; **contraintes** fixe, posé sur, axe aligné, décalage (résolues dans l'ordre des dépendances, cycles signalés). La 3D se met à jour en direct.
- **Générateur de bâtiment d'activité** : portiques (poteaux HEA/HEB sur massifs, traverses IPE), sablières, dallage, bardage périphérique en composition ; tout est lié par des contraintes « posé sur » et s'annule d'un seul Ctrl+Z. Structure de principe (sans pente, pannes ni contreventement).
- **Site réel** (même système qu'ARCHITRAFFIC, `src/engine/49-site.js`) : adresse (géocodage IGN), relief NGF (IGN RGE ALTI®), bâtiments et hauteurs (IGN BD TOPO®, OSM en repli), voirie (OpenStreetMap) ; origine du projet au point d'adresse, cote 0 à l'altitude du terrain ; cache 30 jours sur l'appareil. L'export GLB contient le lieu au format d'ARCHIPLAN (`extras.archiplan.lieu`) pour qu'ARCHITRAFFIC place la maquette à son adresse. **Testé uniquement avec des réponses simulées** des services IGN et Overpass.
- **Matériaux** (`src/engine/12-materials.js`, 47 matériaux) : propriétés mécaniques (E, G, ν, fy / fk, fu, α) tirées des Eurocodes et normes produits (EN 1993-1-1, EN 1993-1-4, EN 1999-1-1, EN 1992-1-1, EN 338, EN 14080, EN 1563…), thermiques (λ, c, μ), carbone ; valeurs « typiques » signalées comme telles (plastiques, cuivre).
- **Profilés** (`src/engine/13-sections.js`) : catalogue IPE 100 à 400, HEA / HEB 160 à 240, UPN 160 (dimensions, aire, masse, inerties, module) ; cohérence vérifiée par le test (aire et masse à 1 % près de la géométrie, I tabulé ≥ I sans congés) ; sections réelles des poutres en 3D.
- **Compositions de parois** (`src/engine/14-physics.js`, méthodes d'ARCHIPLAN) : bardages simple / double peau, panneaux sandwich, voiles BA, parpaing, dallages industriels, toitures bac acier : U (EN ISO 6946), déphasage (EN ISO 13786), Rw (loi de masse), condensation (Glaser), masse, carbone. Application aux murs sélectionnés (épaisseur = somme des couches).
- **Analyse** (`src/engine/48-analysis.js`) : poutres (flèche, moment, effort tranchant, contrainte, taux de travail ; appuis simples, encastrés ou console ; charge saisie + poids propre), poteaux (flambement d'Euler, élancement réduit), réseaux (dilatation thermique) ; carte « Taux » en 3D. **Pré-dimensionnement indicatif** : ni coefficients partiels, ni déversement, ni assemblages — ne remplace pas une note de calcul aux Eurocodes.
- **Nomenclature** complétée : composants d'assemblage (quantités, masses) et volumes des fonctions 3D (écran, CSV, PDF).

## Ce qui fonctionne aussi (testé dans Chromium sans interface, `tests/e2e.py` et suivants)

- **Dessin 2D en millimètres** : ligne, polyligne, rectangle, cercle, cote alignée, texte.
- **Édition** : sélection (clic, fenêtre, capture), déplacer, copier, supprimer, annuler / rétablir (100 niveaux).
- **Accroches** : extrémité, centre, milieu, intersection, grille ; mode orthogonal (F8) ; accroches activables (F3).
- **Saisie au clavier** pendant le tracé : une longueur (`1500`) ou longueur et angle (`1500<45`) puis Entrée.
- **Calques** : 9 calques de départ (réseaux humides, réseaux secs, structures, équipements, cotations…), couleur, visibilité, verrouillage, ajout, renommage, suppression des calques vides.
- **Propriétés** de la sélection : longueur, périmètre, rayon, surface, changement de calque.
- **Fichiers** : enregistrement automatique dans le navigateur (localStorage), projet `.archiindus.json` (enregistrer / ouvrir, avec validation stricte), export **SVG** et export **DXF** (R12, ASCII, cotes éclatées en lignes et texte).
- **Réseaux** : case « Réseau » dans le panneau (diamètre DN en mm, matériau, repère) appliquée aux lignes et polylignes ouvertes ; halo à l'échelle du DN, étiquette, propriétés modifiables.
- **Nomenclature** (calques visibles) : longueurs par DN / matériau, autres objets, export CSV (séparateur `;`, virgule décimale).
- **Export PDF** vectoriel (A4 / A3, échelle au choix, cartouche, nomenclature), écrit à la main ; contrôlé avec qpdf, pypdf et poppler.
- **Page de connexion et accueil « Mes projets »** (comme ArchiPlan) : connexion / création de compte / mot de passe oublié sur une page plein écran, « Continuer sans compte » pour travailler en local ; accueil avec carte de stockage, **dossiers imbriqués** (5 maximum par compte, limite côté application), projets, renommer, déplacer, supprimer, import `.json`, enregistrement du dessin actuel. Un projet ouvert depuis le cloud s'**enregistre automatiquement** (2,5 s après la dernière modification) ; l'historique annuler/rétablir est vidé à l'ouverture pour qu'un « annuler » ne puisse pas écraser un projet cloud.
- **Compte Studio Prism et projets cloud** (boutons Compte / Cloud) : connexion, création de compte, licence `licenses/{uid}_archiindus`, quota 10 Mo / 50 Mo (licence active) / 1 Go (admin), valeurs confirmées par le propriétaire le 15/10/2026. Données dans `aiProjects`, `aiFolders`, `aiUsage` du projet commun.
- **Équipements et poteaux** (outil « Équip. », touche E) : 13 symboles de principe en plan (pompe, vanne, clapet, regard, cuve, compteur, coffret, moteur, ventilateur, échangeur, poteau carré, poteau rond, semelle), taille, rotation (`[` et `]` : 15°), repère. Modifiables après pose depuis le panneau.
- **Murs et poutres** : mode de tracé « Mur » (épaisseur, matériau) ou « Poutre » (largeur, profilé) ; la ligne ou polyligne tracée devient une bande d'épaisseur réelle avec étiquette. Applicable aussi à une sélection existante. Un objet ne peut pas être à la fois réseau et structure (le réseau l'emporte).
- **Propriétés techniques extensibles** (`src/engine/46-props.js`, table `PROP_DEFS`) : altitudes amont / aval, profondeur, débit, pression, température (réseaux), altitude et hauteur (structures), altitude, débit, pression, température (équipements). Pente moyenne calculée (réseaux), affichée dans l'étiquette, le panneau et la nomenclature (écran, CSV, PDF). Valeurs saisies par l'utilisateur : aucune conformité à une norme n'est vérifiée.
- **Bibliothèque de 20 symboles** dont réseaux secs (chambres de tirage / raccordement, candélabre, armoire) et fluides (filtre, ballon, poteau incendie).
- **Vue 3D Three.js** (mode « 3D » de la barre haute, comme ArchiPlan : Three.js r160 chargé depuis jsDelivr par importmap, `src/view3d/scene3d.js`) : réseaux en cylindres (rayon DN/2, altitudes amont → aval), murs et poutres extrudés, équipements en volumes de principe, poteaux de 3 m ; orbite, vues ISO / Dessus / Face / Droite, styles Ombré / Filaire / Rayons X. **Lecture seule** : le dessin se modifie en mode Plan. Poutre : la hauteur est lue dans le nom du profilé (IPE 300 → 300 mm), la propriété « altitude » est le dessus de la poutre ; mur : c'est sa base. Volumes de principe, pas de sections réelles de profilés. Au-delà de 20 000 éléments, l'affichage est tronqué (signalé). Hors ligne (Three.js non chargé), repli sur un aperçu en fil de fer.
- **Export 3D (.glb)** (menu Exporter) : même géométrie que la vue 3D, mètres, Y vers le haut, pour Archi Vision et les visionneuses 3D. Non essayé dans Archi Vision lui-même.
- **Corps de métier** (menu « Métier » au-dessus du dessin) : Réseaux humides, Réseaux secs, CVC et fluides, Construction métallique, Génie civil. Chaque métier filtre la bibliothèque de symboles, les modes de tracé (réseau / mur / poutre), les matériaux proposés et la liste des calques (rangés par métier, autres métiers repliés) ; « + Calques du métier » crée les calques usuels. Préfabrication, bâtiments logistiques, façades : listés « à venir », aucun outil pour l'instant. Le métier est un réglage d'affichage, non enregistré dans le projet.
- **Paramètres du projet** (bouton « Projet ») : nom, format de feuille, cartouche.
- Panneau contextuel : résumé du projet si rien n'est sélectionné, répartition par type et longueur cumulée pour une sélection multiple ; sous 900 px de large, le panneau devient un tiroir (bouton « Options »).
- Barre haute et rail d'outils refaits sur le modèle d'ArchiPlan : accueil, modes Plan / 3D, annuler / rétablir, menu Fichier (nouveau, importer .json, enregistrer, paramètres, thème), Nomenclature, Exporter (PDF, DXF, SVG, CSV, GLB), compte ; rail d'outils à icônes avec libellés et raccourcis.
- Équipements et structures sont repris dans les exports SVG, DXF, PDF et dans la nomenclature (écran et CSV).
- **Panneau d'options** refondu : sections repliables (état mémorisé dans le navigateur), calques avec boutons œil / cadenas, mode de tracé en un seul sélecteur, bibliothèque de symboles en vignettes. Tests : `tests/e2e_equip.py`.
- Thème clair et sombre.

## Format du projet (`schemaVersion` 1)

JSON : `name`, `units` (`mm`), `layers`, `objects` (`line`, `poly`, `circle`, `dim`, `text`, `sym` ; `net`, `st`, `props`, `sk`), `sketches` (`plane` : top, front, right ou **custom** {o, u, n} pour une esquisse sur face), `features` (extrude, cut, revolve, fillet, chamfer, shell, pattern, mirror, pipe ; `ex` : formules par champ), `vars` (variables {n, e}), `rollback` (barre de retour arrière), `comps`, `site`, `sheet`. À l'ouverture, tout fichier est validé ; un fichier invalide est refusé sans toucher au projet courant.

### Limites connues

- Rien n'a été essayé sur un téléphone ou une tablette réels, ni dans AutoCAD, SolidWorks ou Revit (STEP et DXF : structure contrôlée ; IFC : relu par IfcOpenShell).
- Noyau : pas encore de solveur de contraintes d'esquisse (cotes pilotantes, tangences), de balayage d'un profil quelconque, de lissage, de tôlerie, de dépouille ; congés et chanfreins par familles d'arêtes (pas encore à l'arête cliquée).
- Calculs (structure, hydraulique, analyse) : pré-dimensionnement indicatif ; pas d'éléments finis volumiques, pas de cinématique.
- Mise en plan : une feuille, trois vues, cotes d'encombrement seulement.
- Logo : version texte en attendant les fichiers définitifs (le logo du Drive « Ingénierie des réseaux » n'est pas encore intégré).

## Contenu du dépôt

| Fichier | Rôle |
| --- | --- |
| `src/parts/` | Structure de la page : en-tête (polices, thème) et corps (barre haute, outils, zone de dessin, panneau, barre d'état). |
| `src/css/tokens.css` | Charte Studio Prism : valeurs relevées dans ArchiPlan (`src/css/app.css`), thème clair et sombre. |
| `src/css/app.css`, `src/css/home.css` | Mise en page et composants ; connexion et accueil (repris d'`auth.css` / `home.css` d'ArchiPlan). |
| `src/engine/` | Moteur (script classique, fichiers concaténés dans l'ordre alphabétique), dont `02-expr` (formules), `31-edit2d` (outils 2D), `42-kernel` (pont avec le noyau), `78c-cad` (poste CAO), `81-sample` (exemple), `82-networks`, `83-frame`, `84-interop`, et : `00-util`, `10-state`, `20-canvas`, `30-geometry`, `40-doc` (calques, historique, import validé), `50-snap`, `60-render`, `70-tools`, `75-io` (JSON, SVG, DXF), `76-pdf`, `77-bom`, `78-ui`, `80-main`. |
| `src/js/` | Compte Studio Prism, cloud, partage, accueil (module commun, repris d'ARCHIPLAN). |
| `src/kernel/worker.js` | Noyau géométrique (Web Worker) : fonctions, maillage, masse, interférences, STEP / STL, projections. |
| `kernel/vendor/` | replicad 1.1.0 (MIT) et OpenCascade compilé (LGPL 2.1, licence jointe), publiés avec l'app. |
| `tools/build.py` | Assemble le tout : `python3 tools/build.py` → `index.html` (en ligne) et `dist/archiindus-demo.html` (démo, tests). |
| `tools/make_rules.py`, `tools/check_rules.py` | Règles Firestore communes : génération du bloc ai*, garde-fou avant publication. |
| `tests/helpers.py` | Serveur HTTP local, Chromium, contournement de l'écran de compte pour les tests. |
| `tests/e2e_noyau.py`, `tests/e2e_metiers.py` | Noyau OpenCascade et poste CAO ; outils métier et échanges (IFC relu par IfcOpenShell). |
| `tests/e2e_cao.py` | Poste de conception : ruban, arbre, esquisses, fonctions, assemblage, générateur, matériaux, analyse, site (réponses IGN / OSM simulées), GLB avec lieu, import validé. |
| `tests/e2e_3d.py` | Vue 3D et export GLB (WebGL logiciel ; Three.js servi depuis `THREE_DIR`, voir l'en-tête du test). |
| `tests/e2e_reseaux.py`, `tests/e2e_equip.py`, `tests/e2e_compte.py` | Tests Playwright des réseaux / nomenclature / PDF, des équipements / structures / panneau, et du compte / cloud (ce dernier avec `tests/fake-firebase-compat.js`, **simulation** du SDK, pas Firebase). |
| `tests/rules/` | Règles Firestore testées à l'émulateur contre les règles publiées d'ArchiPlan + le bloc `ai*` proposé : `cd tests/rules && npm install && PUBLISHED_RULES=<chemin firestore.rules> npm test`. |
| `tests/e2e.py` | Test de bout en bout (Playwright pour Python) : `pip install playwright`, `playwright install chromium`, puis `python3 tests/e2e.py`. |
| ~~`firebase/firestore.ai.rules.proposed`~~ (retiré : remplacé par `firebase/firestore.rules`) | Bloc de règles `ai*` (projets, dossiers, quota) **déjà publié** dans le fichier de règles commun (v2, 15/10/2026), testé à l'émulateur (63 contrôles). Toute modification se publie en comparant d'abord au fichier de base. **Attention : le fichier de règles est commun à toutes les apps Studio Prism ; un déploiement depuis un autre dépôt qui ne contient pas le bloc `ai*` l'écrase et bloque le cloud d'ArchiIndus (« Enregistrement cloud refusé »). Cela s'est produit le 15/10/2026 (apparition d'un bloc ARCHITRAFIC) ; règles republiées le jour même (v3 = règles en ligne + bloc `ai*`).** |
| `index.html` | Version publiée (**générée, ne pas modifier à la main**). |

On modifie `src/`, on lance `python3 tools/build.py`, on enregistre (commit) : si GitHub Pages est activé sur la branche principale, le site se met à jour.

## Format du projet (`schemaVersion` 1)

JSON : `name`, `units` (`mm`), `layers` (`id`, `name`, `color`, `group`, `visible`, `locked`), `objects` (`id`, `type`, `layer` + géométrie), `active`, compteurs. Types d'objets : `line {a,b}`, `poly {pts,closed}`, `circle {c,r}`, `dim {a,b,off,h}`, `text {p,text,h}`, `sym {c,k,s,rot,tag}` (équipement ou poteau). Les lignes et polylignes peuvent porter `net {dn,mat,tag}` ou `st {kind: mur|poutre, w, prof, tag}`. Axe Y vers le haut. À l'ouverture, tout fichier est validé (types, nombres finis, tailles) ; un fichier invalide est refusé sans toucher au projet courant.

## Conventions

- Unités du dessin : millimètres, axe Y vers le haut.
- Pas de framework : JavaScript natif, comme ArchiPlan. Aucune donnée utilisateur n'est insérée comme HTML (nœuds créés avec `textContent` / `value`).
- Toute évolution de la charte graphique commune se fait d'abord dans ArchiPlan, puis se recopie dans `tokens.css`.
