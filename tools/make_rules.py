#!/usr/bin/env python3
"""Règles Firestore communes de Studio Prism : (re)génère le bloc ARCHIINDUS (collections ai*).

Le bloc est dérivé de celui d'ARCHIPLAN (cloud des projets, dossiers, partage par email ou par lien, quotas, bibliothèque),
exactement comme le bloc ARCHITRAFIC (at*) : mêmes règles, collections préfixées « ai » au lieu de « ap ».
Quota ARCHIINDUS : 10 Mo sans licence, 50 Mo avec une licence licenses/{uid}_archiindus active, 1 Go pour un administrateur.

L'ancien bloc ai* (v1/v2 : projets privés et dossiers imbriqués, ajouté en fin de fichier) est retiré s'il est présent.
Le résultat est contrôlé par tools/check_rules.py (garde-fou : tous les blocs de toutes les apps doivent être présents).

Usage : python3 tools/make_rules.py firebase/firestore.base.rules > firebase/firestore.rules
"""
import re, sys
src = open(sys.argv[1], encoding='utf-8').read()

# 1. retirer l'ancien bloc ai* (commentaires d'en-tête + fonctions/règles ai*), placé avant la règle finale « tout refusé »
old = src.find('// Bloc de règles Firestore « ai* » pour ARCHIINDUS')
if old != -1:
    start = src.rfind('\n// ====', 0, old) + 1
    end = src.index('    match /{document=**} {', old)
    src = src[:start] + src[end:]
# un bloc ARCHIINDUS déjà régénéré : on le remplace (idempotent)
mk = '    // ------------------------------------------------------------ ARCHIINDUS : cloud'
if mk in src:
    a = src.index(mk); b = src.index('    match /userSecrets/{uid}', a)
    src = src[:a] + src[b:]

# 2. dériver le bloc ARCHIPLAN
start = src.index('    // ------------------------------------------------------------ ARCHIPLAN : cloud')
end = src.index('    // ------------------------------------------------------------ ARCHITRAFIC : cloud')
blk = src[start:end]
blk = blk.replace('ARCHIPLAN : cloud des projets, dossiers, partage, quotas, bibliothèque, code PIN', 'ARCHIINDUS : cloud des projets, dossiers, partage, quotas, bibliothèque')
blk = re.sub(r'\bap(Projects|Folders|Shares|Grants|Usage|Library)\b', r'ai\1', blk)
blk = re.sub(r'\bap(Email|Verified|P|F|U|Quota|UsageOk|ShareRole|GrantOk|FolderRole|GuestRole|CanRead|CanEdit|ValidProject|ValidFolder|ValidShare|ValidGrant)\(', r'ai\1(', blk)
blk = blk.replace("licenses/$(uid + '_archiplan')", "licenses/$(uid + '_archiindus')")
blk = blk.replace('Quota : 10 Mo (gratuit), 50 Mo (licence ARCHIPLAN), 1 Go (administrateur).', 'Quota : 10 Mo (gratuit), 50 Mo (licence ARCHIINDUS), 1 Go (administrateur).')
blk = blk.replace('bibliothèque personnelle (matériaux, compositions de parois, familles)', 'bibliothèque personnelle (matériaux, composants, symboles)')
blk = blk.replace("    // userSecrets/{uid}          code PIN du compte, HACHÉ (PBKDF2) : lisible par son seul titulaire, jamais par un administrateur.\n", '')
assert not re.search(r'\bap[A-Z]', blk), 'renommage incomplet'
assert "_archiindus'" in blk, 'quota : licence ARCHIINDUS non trouvée'

# 3. insérer le bloc ai* avant le code PIN (après le bloc ARCHITRAFIC)
at = src.index('    match /userSecrets/{uid}')
sys.stdout.write(src[:at] + blk + src[at:])
