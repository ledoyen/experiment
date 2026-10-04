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
- accompagnée d'un commentaire court si son unité ou son intention n'est pas évidente ;
- exprimée dans les unités du modèle.

Les fonctions de règles dans `src/data/` doivent rester **courtes : 20 lignes maximum**. Si une règle devient plus complexe, la découper en plusieurs fonctions nommées.

Le code de `src/model/` orchestre la simulation ; il ne doit pas devenir le lieu où sont cachées des règles économiques ou physiologiques.

L'objectif est qu'un contributeur économiste puisse ouvrir `src/data/`, comprendre les hypothèses et modifier une règle sans devoir comprendre toute l'architecture technique.
