# Relève tactile Runner — 12 novembre 2026

Base : main 8e7e93a. Branche : fix/runner-completion-20261112.

## Parcours réalisé

L'écran Shift ouvre désormais la relève en direct : sortants à gauche, arrivants à
droite, poignée tactile, défilement près des bords et confirmation avant
l'enregistrement. Une sélection successive des deux personnes effectue la même
opération. Aucun planning publié n'est modifié.

- Équipe entrante prioritaire à T-30, alerte à +15 si l'arrivée n'est pas confirmée.
- Présent (vert), attendu/retard validé (orange), absent/retard dépassé (rouge), parti
  (neutre), avec libellés en complément des couleurs.
- Présence, retard motivé avec heure prévue, absence et départ enregistrables.
- Départ et arrivée d'une relève enregistrés ensemble avec auteur, heure, rôle et
  véhicule. Un départ seul laisse le poste vacant.
- Conducteur temporaire référent ; promotion manuelle d'un chargeur à partir de
  +15, avec motif. Pas de permutation automatique au retour du conducteur prévu.
- Conflits entre appareils détectés, actions conservées pour arbitrage local.
- Actions hors ligne persistantes, confirmation serveur distinguée de l'attente.
- Changements visibles côté bénévole avec accusé de lecture et « informé directement ».

## Livraison et limites

Le frontend, le moteur partagé, les tests et l'adaptateur Apps Script sont
sauvegardés dans cette branche, destinée à revue avant fusion.
Le serveur existant a été lu mais n'a pas été modifié : installer l'adaptateur et
son point d'entrée selon backend/INSTALLATION.md avant une mise en production.
La session Google a expiré pendant l'interruption ; la reconnexion est nécessaire.

La branche ne constitue pas la réalisation complète de tous les modules recensés
par l'audit. Les notifications système programmées T-30/T-5, l'intégration automatique
des arbitrages concerts et la correction globale de la confusion NC/conducteur
uniquement restent distinctes. Les retards sont actuellement validés explicitement
dans l'écran terrain. Aucune validation sur le téléphone physique de l'utilisateur
n'a été faite ; les gestes ont été exercés par des tests de composants JSDOM.

La première tentative locale (54ee58c) n'a pas été retrouvée et n'existait pas sur
GitHub. Le travail décrit ici a été reconstruit depuis main ; les autres fonctions
alors annoncées ne doivent pas être considérées comme récupérées.

## Vérifications

Contrôles syntaxiques et tests Node/JSDOM : seuils temporels et passage de minuit,
relève atomique, droits et contraintes conducteur, véhicule indisponible,
concurrence entre appareils, glissement tactile/annulation/confirmation, lecture
hors ligne après réouverture, ordre d'envoi, reprises et isolation des comptes.
Aucune campagne Playwright et aucune mutation de données réelles.
