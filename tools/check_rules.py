#!/usr/bin/env python3
"""Garde-fou avant toute publication des règles Firestore communes de Studio Prism.

Le fichier de règles est UNIQUE pour le site, ARCHIPLAN, ARCHITRAFIC et ARCHIINDUS : publier un fichier auquel il manque le bloc
d'une app bloque le cloud de cette app (incident du 15/10/2026 : le bloc ai* écrasé par une publication faite sans lui).
Ce script refuse un fichier incomplet. À lancer avant chaque publication (publier-regles.sh l'appelle).

Usage : python3 tools/check_rules.py firebase/firestore.rules   → code 0 si le fichier est publiable, 1 sinon (avec la liste des manques)
"""
import re, sys
REQUIRED = {
    'site Studio Prism': ['match /users/{uid}', 'match /licenses/', 'match /licenseKeys/', 'match /clientProfiles/', 'match /deletedAccounts/'],
    'ARCHIPLAN (ap*)': ['match /apProjects/{pid}', 'match /apFolders/{fid}', 'match /apShares/', 'match /apGrants/', 'match /apUsage/{uid}', 'match /apLibrary/{uid}'],
    'ARCHITRAFIC (at*)': ['match /atProjects/{pid}', 'match /atFolders/{fid}', 'match /atShares/', 'match /atGrants/', 'match /atUsage/{uid}', 'match /atLibrary/{uid}'],
    'ARCHIINDUS (ai*)': ['match /aiProjects/{pid}', 'match /aiFolders/{fid}', 'match /aiShares/', 'match /aiGrants/', 'match /aiUsage/{uid}', 'match /aiLibrary/{uid}'],
    'code PIN': ['match /userSecrets/{uid}'],
}

def check(text):
    errs = []
    for app, needles in REQUIRED.items():
        for n in needles:
            c = text.count(n)
            if c == 0: errs.append(f'{app} : « {n} » absent')
            elif c > 1: errs.append(f'{app} : « {n} » présent {c} fois (bloc en double ?)')
    if not text.lstrip().startswith("rules_version = '2';"): errs.append("première ligne « rules_version = '2'; » absente")
    code = re.sub(r'//[^\n]*', '', text)
    code = re.sub(r"'[^'\n]*'", "''", code)
    if code.count('{') != code.count('}'): errs.append(f'accolades déséquilibrées ({code.count("{")} ouvrantes, {code.count("}")} fermantes)')
    if 'match /{document=**}' not in code or code.rfind('match /{document=**}') < code.rfind('match /ai'):
        errs.append('la règle finale « tout refusé » (match /{document=**}) doit rester la dernière')
    if "uid + '_archiplan'" not in text: errs.append('quota ARCHIPLAN : licence _archiplan absente')
    if "uid + '_archiindus'" not in text: errs.append('quota ARCHIINDUS : licence _archiindus absente')
    return errs

if __name__ == '__main__':
    text = open(sys.argv[1], encoding='utf-8').read()
    errs = check(text)
    if errs:
        print('RÈGLES NON PUBLIABLES :'); [print(' -', e) for e in errs]; sys.exit(1)
    print(f'Règles complètes : site, ARCHIPLAN, ARCHITRAFIC, ARCHIINDUS, code PIN ({len(text.splitlines())} lignes).')
