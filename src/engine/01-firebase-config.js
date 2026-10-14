// Configuration Firebase PUBLIQUE d'ARCHIINDUS (clés d'application web : elles identifient le projet, elles ne
// sont pas des secrets ; la sécurité repose sur les règles Firestore). Ne jamais ajouter ici de clé privée,
// de compte de service ni de mot de passe.
//
// Deux projets, deux rôles :
//  - COMMUN  (archivision-studioprism) : comptes Studio Prism (users/{uid}, PIN), licences (licenses/{uid}_archiindus)
//    et données ai* (aiProjects, aiUsage…). C'est le projet partagé avec le site et ArchiPlan.
//  - APP     (archiindus-studioprism)  : projet propre à ArchiIndus (hébergement, stockage de fichiers, mesure).
// Un jeton d'authentification n'est valable que dans le projet qui l'a émis : tout ce qui dépend du compte ou de
// la licence doit donc passer par le projet COMMUN. Rien de ceci n'est encore utilisé par le moteur.
var AI_FIREBASE = {
  common: {
    projectId: 'archivision-studioprism',
    appId: '1:226072216517:web:0aeef645a4f1481fe801ac',
    apiKey: 'AIzaSyAAD5rrHuVh6_PC2_45L3y9F7zWe5ACW6E',
    authDomain: 'archivision-studioprism.firebaseapp.com',
    storageBucket: 'archivision-studioprism.firebasestorage.app',
    messagingSenderId: '226072216517'
  },
  app: {
    projectId: 'archiindus-studioprism',
    appId: '1:345361461484:web:914f5c3bb5e85e91d6f5c9',
    apiKey: 'AIzaSyCJmVYZFu6xxZeJF3nxqqmYf5xX_ApO90s',
    authDomain: 'archiindus-studioprism.firebaseapp.com',
    storageBucket: 'archiindus-studioprism.firebasestorage.app',
    messagingSenderId: '345361461484'
  }
};
