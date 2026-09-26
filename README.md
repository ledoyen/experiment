# Economic God Game

Prototype navigateur d'une simulation économique émergente.

## Stack

- TypeScript strict
- Vite
- Canvas 2D
- HTML/CSS pour l'interface

## Développement

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Le build de production est généré dans `dist/`.

## GitHub Pages

Chaque push sur `main` déclenche automatiquement :

1. installation des dépendances ;
2. vérification TypeScript + build Vite ;
3. publication de `dist/` comme artefact GitHub Pages ;
4. déploiement sur l'environnement `github-pages`.

Workflow : `.github/workflows/deploy-pages.yml`.

URL attendue : https://ledoyen.github.io/experiment/
