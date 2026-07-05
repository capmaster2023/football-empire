# ⚽ Football Empire: World Simulation

Simulation de football mondiale **100 % simulée** (aucun match jouable manuellement), jouable **hors ligne**, compilable en **APK Android via GitHub Actions**.

## Données réelles intégrées (FC26, mise à jour 21/09/2025)

| | |
|---|---|
| Joueurs réels | **18 405** (nom complet, âge, notes, potentiel, valeur, salaire, contrat, 20+ attributs) |
| Clubs réels | **662** |
| Championnats | **51** ligues dans 35+ pays (Europe, Amériques, Asie, Afrique, Océanie) |
| Divisions | Jusqu'à 4 niveaux avec **promotions/relégations** (Angleterre : PL → Championship → League One → League Two) |

## Le monde vit tout seul

Chaque jour simulé, **tous les championnats du monde jouent** (≈ 10 400 matchs par saison), même si vous ne les regardez pas :

- 🏆 **Coupe des Champions** (32 clubs, groupes + phases finales)
- 🏆 **Coupe Nationale** de votre pays (élimination directe)
- 💰 **Mercato mondial IA** : les clubs achètent, vendent, recrutent des agents libres — avec fenêtres réelles (été / janvier)
- 📊 **Économie** : droits TV selon la richesse du championnat, billetterie, sponsors, masse salariale, **ventes forcées** en cas de crise financière
- 📈 **Progression / vieillissement / retraites** : les jeunes grandissent selon potentiel + temps de jeu, les stars déclinent après 30 ans
- 🌱 **Académies (regens)** : chaque club produit des jeunes chaque saison, avec des noms adaptés au pays (dont Burundi 🇧🇮)
- 📰 **News dynamiques** : transferts officiels, rumeurs, champions, retraites de légendes, crises financières

## Modes de jeu

- **Coach** : dirigez n'importe lequel des 662 clubs. Matchs en direct (commentaires texte, vitesse x1/x2/x4) ou résultat instantané. Notes des joueurs style FC26, buteurs, cartons, blessures, VAR.
- **Spectateur** : regardez le monde vivre sans intervenir.

## Fonctionnalités

### Nouveautés v1.1

- Correction du bug **montant invalide** : les offres acceptent `10M`, `10.5M`, `10 000 000`, `750k`, etc.
- Correction de la recherche mercato sur mobile : la liste se met à jour sans casser le champ texte ni le clavier.
- Négociations réelles en 2 étapes : directeur sportif/président du club vendeur, puis agent + joueur.
- Statuts joueur : **normal**, **intransférable**, **à vendre**, **à prêter**.
- Offres reçues améliorées : achat, prêt, acceptation, refus, contre-offre.
- Choix de carrière : **Coach** ou **Président**.
- Nouvel onglet **Club** avec politique mercato, centre de formation et investissement académie.

- Effectif complet avec profils détaillés (attributs, forme, condition, moral, stats saison)
- Classements de tous les championnats + meilleurs buteurs
- Mercato : recherche parmi 18 405 joueurs, offres, négociations, liste de transferts, offres reçues de l'IA
- Finances détaillées du club
- Palmarès multi-saisons (histoire du monde)
- **Sauvegarde locale robuste** + export/import `.json`
- 🎮 **Manette PS4/PS5** : navigation dans les menus (croix = déplacer, X = valider, O = retour)
- Interface mobile sombre, tactile, en français

## Compilation APK

1. Pousser ce repo sur GitHub
2. L'action **Build APK** se lance automatiquement (Node 20 + JDK 21)
3. Télécharger l'artifact `football-empire-apk`

```bash
# En local (Termux) :
npm install
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Architecture

```
www/
  index.html          Point d'entrée
  css/style.css       Thème sombre mobile
  data/               Base FC26 (players.json 3.4 Mo, clubs.json, leagues.json)
  js/engine/
    util.js           RNG, formats, générateur de noms
    db.js             Chargement + index de la base
    calendar.js       Fixtures round-robin 51 ligues + coupes
    match.js          Moteur de match (xG, buteurs, cartons, blessures, notes)
    league.js         Classements, promotions/relégations
    transfers.js      Mercato IA mondial + négociations du joueur
    finance.js        Économie + progression/vieillissement/regens + news
    game.js           Boucle temporelle : le monde avance jour par jour
    save.js           Sauvegarde diff compacte, export/import
  js/ui/ui.js         Tous les écrans + support manette
```

## Tests

Un test headless simule 2 saisons complètes en ~4 s (Node) : voir l'historique de développement. Toutes les sauvegardes sont round-trip vérifiées.

---
v1.1 — Base FC26 · Capacitor 7 · Vanilla JS · Hors ligne · Mercato négocié

## v1.2 - Coach vs Président, Académie vivante

Cette version ajoute une séparation réelle des pouvoirs : le Coach demande, recommande et dépend de sa crédibilité; le Président tranche, contrôle le budget et peut forcer les ventes. Le centre de formation utilise maintenant un vivier de jeunes U6-U19, avec talents cachés, découvertes progressives, scouting, promotions et création continue de nouveaux profils au fil des saisons.


## Correctif v1.3 — transferts non instantanés
- Les demandes Coach → Président ne placent plus le joueur directement dans l’effectif.
- Une demande approuvée crée maintenant un dossier de transfert avec délai : quelques jours, plusieurs semaines ou jusqu’à la fin du mercato selon joueur, prix, club vendeur et crédibilité.
- Le dossier progresse par étapes : contact club vendeur, prix/clauses, contrat joueur, visite médicale/papiers.
- Le Coach peut demander l’arrêt d’un dossier qui traîne ; le Président accepte ou refuse selon crédibilité, avancement et intérêt du club.
- Le Président peut annuler directement un dossier en cours.

### v1.4 - Académie corrigée
- Jeune repéré = pas encore dans le centre. Il faut cliquer sur `Recruter au centre`.
- En mode Président : recrutement direct si budget suffisant.
- En mode Coach : demande au Président, acceptée ou refusée selon crédibilité et intérêt sportif.
- Jeune du centre de 16 ans ou plus : bouton `Monter en équipe première`.
- Les prêts et ventes de jeunes demandent maintenant que le joueur soit officiellement au centre.


### Nouveauté v6.1
- Choix propriétaire normal / propriétaire riche au début de carrière.
- Injection possible : 50 M€, 100 M€, 250 M€, 500 M€ ou 1 Md€.
- Argent total du club séparé du budget mercato autorisé.
- Fair-play financier avec limites, alertes et sanctions.
- Écran investissements : stade, formation, entraînement, médical, staff, scouting, marketing, dettes, réserve et mercato.
- Section Centre de formation séparée dans la navigation mobile.
- Catégories U6, U9, U12, U15, U17, U19 et réserve/B.
