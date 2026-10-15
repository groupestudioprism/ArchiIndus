# Noyau géométrique d'ARCHIINDUS

Fichiers publiés tels quels avec l'application (GitHub Pages) et chargés à la demande par le Web Worker du noyau
(`src/kernel/worker.js`, inséré dans la page par `tools/build.py`).

| Dossier | Contenu | Version | Licence |
| --- | --- | --- | --- |
| `vendor/replicad/` | replicad (`replicad.js`, `casting-*.js`) : API de modélisation au-dessus d'OpenCascade | 1.1.0 (npm `replicad`) | MIT |
| `vendor/occt/` | OpenCascade compilé en WebAssembly (`replicad_single.js`, `replicad_single.wasm`) | 1.1.0 (npm `replicad-opencascadejs`) | LGPL 2.1 (avec l'exception d'OpenCascade) |

Si ces fichiers ne répondent pas, l'application essaie les mêmes versions sur jsDelivr. Mise à jour : remplacer les fichiers par ceux
des paquets npm de même version, retirer les commentaires `sourceMappingURL`, puis lancer `tests/e2e_noyau.py`.
