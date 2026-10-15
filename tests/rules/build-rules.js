/* Prépare le fichier de règles testé : firebase/firestore.rules (fichier COMMUN au site, à ARCHIPLAN, ARCHITRAFIC et ARCHIINDUS,
   généré par tools/make_rules.py et contrôlé par tools/check_rules.py). Sortie : .generated/firestore.rules */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const src = path.resolve(__dirname, '../../firebase/firestore.rules');
execFileSync('python3', [path.resolve(__dirname, '../../tools/check_rules.py'), src], { stdio: 'inherit' });
fs.mkdirSync(path.resolve(__dirname, '.generated'), { recursive: true });
fs.copyFileSync(src, path.resolve(__dirname, '.generated/firestore.rules'));
console.log('Règles copiées :', src, '-> .generated/firestore.rules');
