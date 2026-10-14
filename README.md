# ARCHIINDUS · Studio Prism

Application de conception de plans industriels et de réseaux techniques (réseaux humides, réseaux secs, structures industrielles, génie civil), de la suite **Studio Prism**. Elle reprend l'identité graphique d'ArchiPlan et vise la compatibilité avec les autres applications de l'écosystème.

> **État : squelette de démarrage.** Seuls la coquille de l'application, la charte graphique et un canevas 2D de base (grille, déplacement, zoom) existent. **Aucune fonction de conception n'est encore opérationnelle** : pas de calques, de dessin, de cotation, d'export, de compte ni de cloud.

## Contenu du dépôt

| Fichier | Rôle |
| --- | --- |
| `src/parts/` | Structure de la page : en-tête (polices, thème) et corps (barre haute, outils, zone de dessin, panneau, barre d'état). |
| `src/css/tokens.css` | Charte Studio Prism : valeurs relevées dans ArchiPlan (`src/css/app.css`), thème clair et sombre. |
| `src/css/app.css` | Mise en page et composants de l'application. |
| `src/engine/` | Moteur (script classique, fichiers concaténés dans l'ordre alphabétique) : outils communs, état, canevas 2D, point d'entrée. |
| `tools/build.py` | Assemble le tout : `python3 tools/build.py` → `index.html`. |
| `index.html` | Version publiée (**générée, ne pas modifier à la main**). |

On modifie `src/`, on lance `python3 tools/build.py`, on enregistre (commit) : si GitHub Pages est activé sur la branche principale, le site se met à jour.

## Comptes et licences (à faire, rien de branché)

Prévu, non réalisé :

- Réutiliser les comptes Studio Prism (`users/{uid}`) et le code PIN, dans le projet Firebase commun.
- Licence propre : `licenses/{uid}_archiindus`. Une licence ArchiPlan ne donne pas droit à ArchiIndus.
- Données dans des collections préfixées `ai` (`aiProjects`, `aiFolders`, …), sur le modèle du préfixe `ap` d'ArchiPlan.
- Nécessite un bloc de règles Firestore `ai*` dans le fichier de règles commun au site et à ArchiPlan : **modification d'un service partagé, à valider avant toute publication.**

La configuration Firebase publique n'est volontairement pas encore ajoutée ici. **Ne jamais ajouter de clé privée ni de compte de service dans ce dépôt.**

## Conventions

- Unités du dessin : millimètres, axe Y vers le haut.
- Pas de framework : JavaScript natif, comme ArchiPlan.
- Toute évolution de la charte graphique commune se fait d'abord dans ArchiPlan, puis se recopie dans `tokens.css`.
