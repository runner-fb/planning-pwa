# Relève Runner — raccordement serveur

Le fichier RunnerHandover.gs contient le même moteur métier que js/handover.js,
puis un adaptateur pour le backend existant. Le code ne remplace pas Code.gs.

Dans le projet Apps Script Beauregard Runner 2027 :

1. Ajouter RunnerHandover.gs comme fichier de script.
2. Au début de `function mutate_(s, u, action, d, op) {` dans Code.gs, ajouter :

```js
  if (action === "runnerRelief") return runnerRelief_(s, u, d, op);
```

3. Enregistrer puis mettre à jour le déploiement existant, en conservant son URL
   et ses droits. Le frontend ne doit être fusionné dans main qu'après cette étape.

L'action utilise le verrou, la déduplication par opId et la sauvegarde déjà
présents dans l'API. Les deux états d'une relève sont préparés/validés avant
insertion. Ils restent dans la collection terrain et portent l'auteur, l'heure,
le dernier rôle, la personne relevée ou remplaçante et le véhicule.

Un conflit détecté bloque l'action locale. Le référent compare l'état synchronisé,
puis peut annuler cette action rejetée et saisir sa décision. Aucune action ne
remplace automatiquement un état concurrent.

État au 12 novembre 2026 : fichier préparé et testé localement ; raccordement
non installé dans Apps Script, car la session Google a expiré après interruption.
