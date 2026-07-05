# Améliorations implémentées - v1.2 Coach vs Président

## Mercato

- Séparation stricte entre mode Coach et mode Président.
- En mode Coach, le joueur ne négocie plus directement : il envoie une demande au Président.
- Le Président IA accepte ou refuse une demande selon crédibilité du Coach, besoin sportif, budget et profil du joueur.
- Ajout d'une jauge de crédibilité Coach visible dans l'en-tête et le mercato.
- La crédibilité évolue selon les résultats, les demandes validées et les ventes forcées.
- Vente forcée possible en mode Coach uniquement avec crédibilité très élevée.
- Vente forcée toujours disponible en mode Président.
- Les offres reçues sont traitées différemment selon le rôle : le Coach recommande, le Président décide.
- Ajout de demandes Coach → Président avec historique et score Président.
- Ajout shortlist et watchlist sur les joueurs ciblés.
- Recherche mercato filtrée selon le rôle : besoins Coach, prêts jeunes, libres, potentiel, rentabilité, budget.
- Ajout de cartes de rôle dans l'écran mercato.
- Deadline Day signalé visuellement pendant les derniers jours de mercato.
- Prêts améliorés avec suivi de prêt et possibilité de rappel.
- Rappel de prêt soumis au pouvoir du rôle et à la crédibilité en mode Coach.
- Agents libres soumis à validation Président en mode Coach.
- Ajout d'offres d'autres clubs pour le Coach selon sa crédibilité.

## Centre de formation / regens

- Ajout du fichier `www/data/academy_pool.json` basé sur les 20 000 joueurs U6-U19 fournis.
- Ajout du moteur `www/js/engine/academy.js`.
- Les jeunes peuvent être dans une académie ou non découverts dans le monde.
- Initialisation d'un vivier de 900 jeunes cachés ou répartis dans les clubs au lancement d'une carrière.
- Chaque saison, les jeunes vieillissent, progressent, sont découverts ou montent en pro.
- Chaque saison, de nouveaux profils U6-U15 sont créés pour garder le monde vivant après 2, 5, 10 saisons et plus.
- Ajout d'un écran Académie avec pipeline jeunes, talents non découverts et scouting.
- En mode Président, investissement direct dans le scouting jeunes.
- En mode Coach, demande de rapport jeunes au Président.
- Rapports d'académie avec meilleurs jeunes, potentiel estimé et apparition pro prévue.
- Possibilité de préparer un prêt futur pour un jeune.
- En mode Président, possibilité de vendre un jeune avant contrat pro.
- L'académie est reliée au mercato : jeunes à prêter, vendre ou promouvoir.

## Validation rapide

- Tous les fichiers JavaScript passent `node --check`.
- Test de démarrage exécuté : chargement DB, nouvelle carrière Coach, initialisation académie, demande de recrutement, rapport scouting.


## Correctif v1.3 — transferts non instantanés
- Les demandes Coach → Président ne placent plus le joueur directement dans l’effectif.
- Une demande approuvée crée maintenant un dossier de transfert avec délai : quelques jours, plusieurs semaines ou jusqu’à la fin du mercato selon joueur, prix, club vendeur et crédibilité.
- Le dossier progresse par étapes : contact club vendeur, prix/clauses, contrat joueur, visite médicale/papiers.
- Le Coach peut demander l’arrêt d’un dossier qui traîne ; le Président accepte ou refuse selon crédibilité, avancement et intérêt du club.
- Le Président peut annuler directement un dossier en cours.

## v1.4 - Académie : recrutement au centre et promotion équipe première

- Les jeunes repérés par le scouting ne sont plus considérés automatiquement comme intégrés au centre : ils passent par le statut `scouted`.
- Ajout du bouton `Recruter au centre` en mode Président.
- Ajout du bouton `Demander recrutement au centre` en mode Coach, avec décision du Président selon crédibilité, âge et potentiel.
- Ajout du bouton `Monter en équipe première` pour les jeunes du centre âgés de 16 ans ou plus.
- En mode Coach, la montée en équipe première devient une demande soumise au Président et à la crédibilité du Coach.
- Les prêts et ventes de jeunes sont bloqués tant que le joueur n’est pas officiellement dans le centre.
- Les rapports académie indiquent clairement si un joueur est seulement repéré ou déjà dans le centre.
- Correction mobile : la barre du haut respecte mieux la zone système du téléphone.

## v6.1 — Propriétaire, Fair-play financier et Centre de formation séparé

### Propriétaire au début de carrière
- Ajout d’un écran de choix après le club : propriétaire normal ou propriétaire riche.
- Propriétaire normal : aucun argent spécial, budget réaliste du club.
- Propriétaire riche : injection sélectionnable de 50 M€, 100 M€, 250 M€, 500 M€ ou 1 Md€.
- L’injection entre dans la caisse globale du club, pas directement dans le mercato.
- Ajout d’une pression propriétaire plus forte si l’injection est énorme.

### Finances et fair-play financier
- Ajout du module `owner.js`.
- Séparation claire entre argent total du club et budget mercato autorisé.
- Calcul d’une limite de fair-play financier selon revenus, salaires, ventes, achats, réserve, dette et injection propriétaire durable.
- Ajout des statuts : conforme, attention, danger, sanction.
- Blocage des transferts si la limite FPF ou le budget mercato autorisé est dépassé.
- Ajout d’un écran “Fair-play financier”.
- Ajout d’un contrôle financier en fin de saison.
- Sanctions possibles : amende, budget réduit, interdiction de recruter, retrait de points, exclusion européenne.

### Investissements du propriétaire
- Ajout d’un écran d’investissements séparés.
- Catégories : stade, centre de formation, entraînement, médical, staff, scouting, marketing, données/performance, dettes, réserve financière et mercato autorisé.
- Les investissements ont des effets progressifs sur plusieurs saisons.
- Stade et marketing augmentent les revenus mensuels.
- Centre de formation et scouting améliorent l’académie.
- Centre médical réduit les blessures existantes.
- Entraînement aide une partie des jeunes joueurs pros.
- Les clubs très riches subissent une inflation des prix demandés par les vendeurs.

### Section centre de formation séparée
- Ajout d’un onglet mobile dédié “Formation” dans la navigation basse.
- L’écran académie n’est plus juste caché dans “Club”.
- Ajout des catégories U6, U9, U12, U15, U17, U19 et réserve/B.
- Ajout d’un écran “U19 & Réserve” avec matchs, minutes, buts, moral et fatigue.
- Ajout de nouveaux champs jeunes : poste secondaire, moral, école, pression familiale, fatigue, blessure, minutes saison, type de contrat.
- Ajout de plans d’entraînement plus détaillés : technique, physique, mental, finition, défense, passes, vitesse, endurance et gardien.
- Les jeunes progressent selon moral, école, fatigue, blessures, temps de jeu et infrastructures.
- Les jeunes trop fatigués risquent une blessure.

### Compatibilité
- Les anciennes sauvegardes reçoivent des valeurs par défaut pour les nouveaux systèmes.
- Les données restent en JSON strict.
- Les nouveaux systèmes sont sauvegardés dans la sauvegarde globale existante.
