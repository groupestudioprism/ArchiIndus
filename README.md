# ARCHIINDUS · Studio Prism

Application de conception de plans industriels et de réseaux techniques (réseaux humides, réseaux secs, structures industrielles, génie civil), de la suite **Studio Prism**. Elle reprend l'identité graphique d'ArchiPlan et vise la compatibilité avec les autres applications de l'écosystème.

> **État : éditeur 2D avec réseaux, nomenclature, PDF, et compte / cloud codés mais non activés.** Le bloc de règles `ai*` est publié dans le projet commun (v1 le 14/10/2026, v2 avec les dossiers le 15/10/2026 ; relecture en ligne identique au fichier testé à l'émulateur). Le SDK Firebase réel n'a été testé qu'à travers une simulation ; les règles l'ont été à l'émulateur. Rien n'a été testé sur téléphone ni dans un logiciel de CAO.

## Ce qui fonctionne (testé dans Chromium sans interface, `tests/e2e.py`)

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

### Limites connues

- Le DXF n'a pas été ouvert dans un logiciel de CAO : seule sa structure a été contrôlée. Les accents sont supprimés, les couleurs sont ramenées aux indices AutoCAD.
- Vue 3D / ArchiVision **n'existe pas encore** (phase 7). Les symboles sont des schémas de principe, pas des symboles normalisés ; pas de bibliothèque personnalisée, pas de jonction automatique des murs entre eux (chevauchements visibles). Phase 4 et nouveau panneau testés dans Chromium sans interface uniquement, pas sur un téléphone réel.
- Compte : pas de code PIN ni de verrouillage. Pas de partage de projets ou de dossiers (par email ou lien), pas de « Partagés avec moi », pas de miniatures de projets, pas de vérification d'email. Les règles n'empêchent pas un dossier d'être déplacé dans son propre sous-dossier (contrôlé par l'application seulement). Le lien projet courant ↔ projet cloud n'est gardé qu'en mémoire. Le compteur d'usage cloud dépend des règles ; non vérifié en production.
- L'export PDF n'a pas été ouvert dans tous les lecteurs (seulement qpdf, pypdf, poppler).
- Pas de gestion du tactile à deux doigts ; l'outil Main permet de déplacer la vue au doigt.
- Le stockage local est propre à un navigateur : vider les données du site efface le projet. Utiliser « Enregistrer » pour garder un fichier.

## Contenu du dépôt

| Fichier | Rôle |
| --- | --- |
| `src/parts/` | Structure de la page : en-tête (polices, thème) et corps (barre haute, outils, zone de dessin, panneau, barre d'état). |
| `src/css/tokens.css` | Charte Studio Prism : valeurs relevées dans ArchiPlan (`src/css/app.css`), thème clair et sombre. |
| `src/css/app.css`, `src/css/home.css` | Mise en page et composants ; connexion et accueil (repris d'`auth.css` / `home.css` d'ArchiPlan). |
| `src/engine/` | Moteur (script classique, fichiers concaténés dans l'ordre alphabétique) : `00-util`, `10-state`, `20-canvas`, `30-geometry`, `40-doc` (calques, historique, import validé), `50-snap`, `60-render`, `70-tools`, `75-io` (JSON, SVG, DXF), `76-pdf`, `77-bom`, `78-ui`, `79-cloudstore`, `79-account`, `79-home` (page de connexion et accueil), `80-main`. |
| `tools/build.py` | Assemble le tout : `python3 tools/build.py` → `index.html`. |
| `tests/e2e_3d.py` | Vue 3D et export GLB (WebGL logiciel ; Three.js servi depuis `THREE_DIR`, voir l'en-tête du test). |
| `tests/e2e_reseaux.py`, `tests/e2e_equip.py`, `tests/e2e_compte.py` | Tests Playwright des réseaux / nomenclature / PDF, des équipements / structures / panneau, et du compte / cloud (ce dernier avec `tests/fake-firebase-compat.js`, **simulation** du SDK, pas Firebase). |
| `tests/rules/` | Règles Firestore testées à l'émulateur contre les règles publiées d'ArchiPlan + le bloc `ai*` proposé : `cd tests/rules && npm install && PUBLISHED_RULES=<chemin firestore.rules> npm test`. |
| `tests/e2e.py` | Test de bout en bout (Playwright pour Python) : `pip install playwright`, `playwright install chromium`, puis `python3 tests/e2e.py`. |
| `firebase/firestore.ai.rules.proposed` | Bloc de règles `ai*` (projets, dossiers, quota) **déjà publié** dans le fichier de règles commun (v2, 15/10/2026), testé à l'émulateur (63 contrôles). Toute modification se publie en comparant d'abord au fichier de base. **Attention : le fichier de règles est commun à toutes les apps Studio Prism ; un déploiement depuis un autre dépôt qui ne contient pas le bloc `ai*` l'écrase et bloque le cloud d'ArchiIndus (« Enregistrement cloud refusé »). Cela s'est produit le 15/10/2026 (apparition d'un bloc ARCHITRAFIC) ; règles republiées le jour même (v3 = règles en ligne + bloc `ai*`).** |
| `index.html` | Version publiée (**générée, ne pas modifier à la main**). |

On modifie `src/`, on lance `python3 tools/build.py`, on enregistre (commit) : si GitHub Pages est activé sur la branche principale, le site se met à jour.

## Format du projet (`schemaVersion` 1)

JSON : `name`, `units` (`mm`), `layers` (`id`, `name`, `color`, `group`, `visible`, `locked`), `objects` (`id`, `type`, `layer` + géométrie), `active`, compteurs. Types d'objets : `line {a,b}`, `poly {pts,closed}`, `circle {c,r}`, `dim {a,b,off,h}`, `text {p,text,h}`, `sym {c,k,s,rot,tag}` (équipement ou poteau). Les lignes et polylignes peuvent porter `net {dn,mat,tag}` ou `st {kind: mur|poutre, w, prof, tag}`. Axe Y vers le haut. À l'ouverture, tout fichier est validé (types, nombres finis, tailles) ; un fichier invalide est refusé sans toucher au projet courant.

## Comptes et licences (codés, non activés)

Réalisé dans le code : comptes et licence. Reste à faire :

- Réutiliser les comptes Studio Prism (`users/{uid}`) et le code PIN, dans le projet Firebase commun.
- Licence propre : `licenses/{uid}_archiindus`. Une licence ArchiPlan ne donne pas droit à ArchiIndus.
- Données dans des collections préfixées `ai` (`aiProjects`, `aiFolders`, …), sur le modèle du préfixe `ap` d'ArchiPlan.
- Nécessite un bloc de règles Firestore `ai*` dans le fichier de règles commun au site et à ArchiPlan : **modification d'un service partagé : comparer les règles en ligne, publier les règles seules, relire en ligne.**

### Projets Firebase (14/10/2026)

| Rôle | Projet | Contenu |
| --- | --- | --- |
| Commun Studio Prism | `archivision-studioprism` | Comptes (`users`), PIN, licences, futures données `ai*`. Partagé avec le site et ArchiPlan. |
| Propre à ArchiIndus | `archiindus-studioprism` | Créé le 14/10/2026 : application web enregistrée, rien d'autre activé (ni Auth, ni Firestore, ni Hosting déployé). |

Un jeton d'authentification n'est valable que dans le projet qui l'a émis : les règles du projet `archiindus-studioprism` ne peuvent pas lire `users` ni `licenses` du projet commun. Le brouillon `ai*` est donc prévu pour le projet **commun**. Le bloc `ai*` a été ajouté aux règles publiées du projet commun le 14/10/2026 (v1) puis mis à jour le 15/10/2026 (v2, dossiers) ; les blocs existants sont inchangés et la relecture en ligne est identique au fichier fusionné testé à l'émulateur.

La configuration publique des deux projets est dans `src/engine/01-firebase-config.js` (clés d'application web, non secrètes ; chargée à la demande par le module Compte (SDK compat 10.12.2)). `.firebaserc` déclare les deux projets. **Ne jamais ajouter de clé privée ni de compte de service dans ce dépôt.**

## Conventions

- Unités du dessin : millimètres, axe Y vers le haut.
- Pas de framework : JavaScript natif, comme ArchiPlan. Aucune donnée utilisateur n'est insérée comme HTML (nœuds créés avec `textContent` / `value`).
- Toute évolution de la charte graphique commune se fait d'abord dans ArchiPlan, puis se recopie dans `tokens.css`.
