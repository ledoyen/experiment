# Règles de contribution à la simulation

Ce projet doit rester compréhensible par une personne qui connaît l'économie mais peu le code.

## Règle principale

Les **valeurs qui définissent les règles de la simulation** (valeurs par défaut, ratios, coefficients, seuils, prix de référence, durées, besoins, calibrations, etc.) doivent être placées dans `src/data/`.

Les fonctions de calcul qui utilisent ces valeurs et qui ne dépendent pas de l'état mutable du monde doivent également être dans `src/data/` et être **pures** :
- mêmes entrées → même résultat ;
- aucun accès ou changement de `World`, DOM, horloge, hasard ou état global mutable ;
- pas d'effet de bord.

## Lisibilité

Une valeur ou une règle doit être :
- **simple** ;
- **bien nommée** ;
- accompagnée d'un commentaire indiquant la justification de la valeur et un lien web vers la source ou référence externe ; exception : les fonctions pures dont le calcul est immédiatement évident n'ont pas besoin de source ;
- exprimée dans les unités du modèle.

Les fonctions de règles dans `src/data/` doivent rester **courtes : 20 lignes maximum**. Si une règle devient plus complexe, la découper en plusieurs fonctions nommées.

Le code de `src/model/` orchestre la simulation ; il ne doit pas devenir le lieu où sont cachées des règles économiques ou physiologiques.

L'objectif est qu'un contributeur économiste puisse ouvrir `src/data/`, comprendre les hypothèses et modifier une règle sans devoir comprendre toute l'architecture technique.

## Simulation CLI et GitHub Actions

La simulation CLI utilise **exactement le même `World` que l'interface graphique**. Elle ne constitue pas un second modèle : elle crée un `World` avec les paramètres initiaux, avance d'un jour à la fois aussi vite que possible et exporte l'historique analytique en CSV.

Commande locale :

```bash
npm run simulate -- \
  --population 200 \
  --initial-money 100 \
  --money-enabled false \
  --mobility 0.2 \
  --price-sensitivity 0.15 \
  --productivity-variance 0.2 \
  --money-introduction-day "" \
  --duration-days 365 \
  --output simulation.csv
```

Les six paramètres initiaux correspondent aux valeurs de `defaultParameters()` dans `src/data/defaults.ts`. Le workflow GitHub reproduit volontairement ces valeurs dans ses champs par défaut : **si les valeurs par défaut de la simulation changent, mettre aussi à jour les défauts du workflow**.

Pour lancer une expérience sans argent, laisser `money-introduction-day` vide. Pour introduire l'argent au début d'un jour donné, mettre par exemple `178`. `money-enabled=true` signifie que l'argent est actif dès le début ; il ne doit pas être combiné avec une date d'introduction.

Le workflow `.github/workflows/run-simulation.yml` est déclenché manuellement avec **Run workflow**. Il expose tous les paramètres initiaux, la durée et le jour d'introduction de l'argent. La vitesse n'est pas un paramètre : la CLI avance directement d'une journée à l'autre, sans rendu graphique. À la fin, le fichier `simulation.csv` est disponible comme artefact GitHub Actions téléchargeable.

Pour une itération de recherche, privilégier ce workflow et l'analyse du CSV plutôt que d'ajouter du code temporaire ou des paramètres de diagnostic au modèle.
