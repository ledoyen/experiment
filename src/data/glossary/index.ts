/**
 * GLOSSAIRE DE LA SIMULATION
 *
 * Catégories :
 * - calendar.ts   : calendrier et saisons
 * - heating.ts    : chauffage et consommation hivernale
 * - production.ts : saisonnalité de la production
 * - market.ts     : formation des prix et mobilité
 *
 * Les constantes sont les hypothèses modifiables.
 * Les fonctions exportées sont pures et testables indépendamment du moteur.
 */

export * from "./calendar";
export * from "./heating";
export * from "./production";
export * from "./market";

export * from "./budget";
export * from "./distribution";
