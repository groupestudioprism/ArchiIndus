# ARCHIINDUS · Studio Prism

Application de conception de plans industriels et de réseaux techniques (réseaux humides, réseaux secs, structures industrielles, génie civil), de la suite **Studio Prism**. Elle reprend l'identité graphique d'ArchiPlan et vise la compatibilité avec les autres applications de l'écosystème.

> **État : éditeur 2D de démarrage, local au navigateur.** Pas de compte, pas de licence, pas de cloud : Firebase n'est pas branché (voir plus bas). Rien n'a été testé sur téléphone ni dans un logiciel de CAO.

## Ce qui fonctionne (testé dans Chromium sans interface, `tests/e2e.py`)

- **Dessin 2D en millimètres** : ligne, polyligne, rectangle, cercle, cote alignée, texte.
- **Édition** : sélection (clic, fenêtre, capture), déplacer, copier, supprimer, annuler / rétablir (100 niveaux).
- **Accroches** : extrémité, centre, milieu, intersection, grille ; mode orthogonal (F8) ; accroches activables (F3).
- **Saisie au clavier** pendant le tracé : une longueur (`1500`) ou longueur et angle (`1500<45`) puis Entrée.
- **Calques** : 9 calques de départ (réseaux humides, réseaux secs, structures, équipements, cotations…), couleur, visibilité, verrouillage, ajout, renommage, suppression des calques vides.
- **Propriétés** de la sélection : longueur, périmètre, rayon, surface, changement de calque.
- **Fichiers** : enregistrement automatique dans le navigateur (localStorage), projet `.archiindus.json` (enregistrer / ouvrir, avec validation stricte), export **SVG** et export **DXF** (R12, ASCII, cotes éclatées en lignes et texte).
- Thème clair et sombre.

### Limites connues

- Le DXF n'a pas été ouvert dans un logiciel de CAO : seule sa structure a été contrôlée. Les accents sont supprimés, les couleurs sont ramenées aux indices AutoCAD.
- Les nomenclatures, les symboles de réseaux (diamètres, sections), les équipements, la mise en page et le PDF **n'existent pas encore**.
- Pas de gestion du tactile à deux doigts ; l'outil Main permet de déplacer la vue au doigt.
- Le stockage local est propre à un navigateur : vider les données du site efface le projet. Utiliser « Enregistrer » pour garder un fichier.

## Contenu du dépôt

| Fichier | Rôle |
| --- | --- |
| `src/parts/` | Structure de la page : en-tête (polices, thème) et corps (barre haute, outils, zone de dessin, panneau, barre d'état). |
| `src/css/tokens.css` | Charte Studio Prism : valeurs relevées dans ArchiPlan (`src/css/app.css`), thème clair et sombre. |
| `src/css/app.css` | Mise en page et composants. |
| `src/engine/` | Moteur (script classique, fichiers concaténés dans l'ordre alphabétique) : `00-util`, `10-state`, `20-canvas`, `30-geometry`, `40-doc` (calques, historique, import validé), `50-snap`, `60-render`, `70-tools`, `75-io` (JSON, SVG, DXF), `78-ui`, `80-main`. |
| `tools/build.py` | Assemble le tout : `python3 tools/build.py` → `index.html`. |
| `tests/e2e.py` | Test de bout en bout (Playwright pour Python) : `pip install playwright`, `playwright install chromium`, puis `python3 tests/e2e.py`. |
| `index.html` | Version publiée (**générée, ne pas modifier à la main**). |

On modifie `src/`, on lance `python3 tools/build.py`, on enregistre (commit) : si GitHub Pages est activé sur la branche principale, le site se met à jour.

## Format du projet (`schemaVersion` 1)

JSON : `name`, `units` (`mm`), `layers` (`id`, `name`, `color`, `group`, `visible`, `locked`), `objects` (`id`, `type`, `layer` + géométrie), `active`, compteurs. Types d'objets : `line {a,b}`, `poly {pts,closed}`, `circle {c,r}`, `dim {a,b,off,h}`, `text {p,text,h}`. Axe Y vers le haut. À l'ouverture, tout fichier est validé (types, nombres finis, tailles) ; un fichier invalide est refusé sans toucher au projet courant.

## Comptes et licences (à faire, rien de branché)

Prévu, non réalisé :

- Réutiliser les comptes Studio Prism (`users/{uid}`) et le code PIN, dans le projet Firebase commun.
- Licence propre : `licenses/{uid}_archiindus`. Une licence ArchiPlan ne donne pas droit à ArchiIndus.
- Données dans des collections préfixées `ai` (`aiProjects`, `aiFolders`, …), sur le modèle du préfixe `ap` d'ArchiPlan.
- Nécessite un bloc de règles Firestore `ai*` dans le fichier de règles commun au site et à ArchiPlan : **modification d'un service partagé, à valider avant toute publication.**

La configuration Firebase publique n'est volontairement pas encore ajoutée ici. **Ne jamais ajouter de clé privée ni de compte de service dans ce dépôt.**

## Conventions

- Unités du dessin : millimètres, axe Y vers le haut.
- Pas de framework : JavaScript natif, comme ArchiPlan. Aucune donnée utilisateur n'est insérée comme HTML (nœuds créés avec `textContent` / `value`).
- Toute évolution de la charte graphique commune se fait d'abord dans ArchiPlan, puis se recopie dans `tokens.css`.
