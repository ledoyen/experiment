import fr from "./i18n/fr.json";
import en from "./i18n/en.json";

const dictionaries: Record<"fr" | "en", Record<string, string>> = { fr, en };
let currentLanguage: "fr" | "en" = "fr";

export function t(key: string): string {
  return dictionaries[currentLanguage][key] ?? key;
}

export function setLanguage(language: "fr" | "en"): void {
  currentLanguage = language;
}

export function getLanguage(): "fr" | "en" {
  return currentLanguage;
}
