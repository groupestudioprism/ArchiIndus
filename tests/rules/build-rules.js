/* Fusionne les règles Firestore PUBLIÉES (fichier commun au site et à ArchiPlan) avec le bloc proposé ai*, sans rien publier.
   PUBLISHED_RULES : chemin du fichier de règles publié (par défaut : copie du dépôt ArchiPlan voisin, ../../../archiplan/firebase/firestore.rules).
   Le bloc est inséré juste avant la dernière règle « match /{document=**} » (tout refusé). Sortie : .generated/firestore.rules */
const fs = require('fs'), path = require('path');
const pub = process.env.PUBLISHED_RULES || path.resolve(__dirname, '../../../archiplan/firebase/firestore.rules');
const block = fs.readFileSync(path.resolve(__dirname, '../../firebase/firestore.ai.rules.proposed'), 'utf8');
const base = fs.readFileSync(pub, 'utf8');
const marker = '    match /{document=**} {';
const i = base.lastIndexOf(marker);
if (i < 0) throw new Error('Règle finale « match /{document=**} » introuvable dans ' + pub);
if (/match \/aiProjects\//.test(base)) throw new Error('Le fichier de règles contient déjà un bloc aiProjects : rien à fusionner.');
fs.mkdirSync(path.resolve(__dirname, '.generated'), { recursive: true });
fs.writeFileSync(path.resolve(__dirname, '.generated/firestore.rules'), base.slice(0, i) + block + '\n' + base.slice(i));
console.log('Règles fusionnées :', pub, '+ bloc ai* ->', '.generated/firestore.rules');
