export type ThemeDefinition = {
  id: string;
  label: string;
  dark: boolean;
  swatch: [string, string, string];
};

export const THEMES: ThemeDefinition[] = [
  { id: "midnight", label: "Midnight", dark: true, swatch: ["#1b2033", "#7aa2f7", "#9ece6a"] },
  { id: "ocean", label: "Ocean", dark: true, swatch: ["#152736", "#5fd3d8", "#63d69f"] },
  { id: "forest", label: "Forest", dark: true, swatch: ["#16261d", "#6ddc9a", "#c9dd6d"] },
  { id: "sunset", label: "Sunset", dark: true, swatch: ["#2b1a14", "#f4a261", "#e76f51"] },
  { id: "mocha", label: "Mocha", dark: true, swatch: ["#261f18", "#d9b382", "#8fc8a0"] },
  { id: "grape", label: "Grape", dark: true, swatch: ["#221530", "#c78ff0", "#8fa8f0"] },
  { id: "slate", label: "Slate", dark: true, swatch: ["#22252a", "#cfd3d8", "#7fb8c9"] },
  { id: "nord", label: "Nord", dark: true, swatch: ["#3b4252", "#88c0d0", "#a3be8c"] },
  { id: "light", label: "Clair", dark: false, swatch: ["#fbfbfd", "#3a6ff0", "#37b98a"] },
  { id: "rose", label: "Rose", dark: false, swatch: ["#fff7f7", "#d9455f", "#c25ba0"] },
  { id: "sand", label: "Sable", dark: false, swatch: ["#fbf8ef", "#3f7a54", "#c0873f"] },
];

export const DEFAULT_THEME = "midnight";

export function applyTheme(themeId: string, density: string) {
  if (typeof document === "undefined") return;
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]!;
  const root = document.documentElement;
  root.dataset["theme"] = theme.id;
  root.dataset["density"] = density === "compact" ? "compact" : "comfortable";
  root.classList.toggle("dark", theme.dark);
  root.style.colorScheme = theme.dark ? "dark" : "light";
}
