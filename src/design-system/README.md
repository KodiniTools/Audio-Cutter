# Design-System · Tokens v2

Design Tokens des Audio Cutters. Sie sind eine unveränderte Kopie der v2-Tokens des Collage Makers
(`KodiniTools/Collage-Maker`, `src/design-system/`, Stand `9dc4eca`), die ihrerseits aus dem
Playlist Generator stammen. So teilen alle drei Apps auf kodinitools.com dieselbe Palette, dieselben
Radien, dieselbe Schrift und dieselbe Motion. Werte werden dort gepflegt und hierher übernommen;
`__tests__/tokens-v2.spec.ts` hält JSON und CSS konsistent und prüft den Kontrast (WCAG AA).

## Dateien

| Datei                         | Zweck                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tokens-v2.css`               | **Laufzeit-Quelle.** CSS Custom Properties `--ds-*`, Dark auf `:root`, Light auf `.light-theme` und `:root[data-theme='light']`. |
| `tokens-v2.json`              | Maschinenlesbare Fassung (W3C-Design-Tokens-nah), `$extensions.css` nennt die Variable.                                          |
| `tokens-v2.ts`                | Typisierter Zugriff für TS, z. B. `themeColorsV2('light')` für die Waveform-Zeichnung.                                           |
| `__tests__/tokens-v2.spec.ts` | Konsistenz JSON ↔ CSS, Light-Spiegelung, Namespace, Kontrast-Audit, Einbindung.                                                  |
| `__tests__/tokenTestUtils.ts` | CSS-Block-Parser, Token-Walker, Kontrastberechnung.                                                                              |

Die UI-Schrift Supreme liegt in `src/assets/fonts/` (Regular 400, Medium 500, Bold 700) und wird in
`src/style.css` per `@font-face` eingebunden; Vite bündelt sie mit Hash unter `/audio-cutter/assets/`.

## Theme-Mechanik

`src/stores/settings.ts` setzt `html[data-theme]` (für Tokens und SSI-Partials), `body.light-theme`
(Parität zum Playlist Generator) und `html.dark` (Altbestand für externe Skripte). Ein Inline-Skript in
`index.html` setzt `data-theme` vor dem ersten Paint aus `localStorage.theme`, damit es keinen
Dark-Flash gibt. Standard ist Light. Der Store wird in `src/main.ts` vor dem Einhängen der Partials
gestartet; schaltet die globale Nav das Theme (sie setzt nur `data-theme`), übernimmt ein
MutationObserver den Wert in den Store, der die übrigen Marker nachzieht. Die Waveform liest ihre
Farben über `themeColorsV2(settings.theme)` und zeichnet bei jedem Wechsel neu.

## SSI-Partials und Modals

`src/style.css` gleicht Nav und Footer (Geschwister von `#app`) an die Tokens an: Hintergründe
transparent, Text `--ds-text`, Links `--ds-link` (Hover `--ds-accent`), Dropdowns auf `--ds-surface-1`;
der Cookie-Banner bleibt ausgenommen und liegt auf `z-index: 10000`. Modals werden per
`<Teleport defer to="#modal-portal">` in `#modal-portal` (in `App.vue`) gerendert, das mit
`--ds-z-backdrop` über der Nav (100/200) liegt.

## Tailwind-Brücke

Tailwind bleibt als Utility-Schicht für Layout. Farben, Radien, Schatten und Dauern kommen aus den
Tokens (`tailwind.config.js`, identisch zum Collage Maker), es gibt keine `dark:`-Varianten:

| Rolle                        | Klasse                                                                                                          | Variable                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Seite, Panel, Eingabe, Hover | `bg-surface-0` … `bg-surface-3`                                                                                 | `--ds-surface-0…3`                        |
| Rahmen, Feldrahmen           | `border-line`, `border-line-strong` (auch nur `border`)                                                         | `--ds-border`, `--ds-border-strong`       |
| Text 1–3                     | `text-ink`, `text-ink-2`, `text-ink-3`                                                                          | `--ds-text`, `--ds-text-2`, `--ds-text-3` |
| Primäraktion                 | `bg-accent hover:bg-accent-hover text-on-accent`                                                                | `--ds-accent*`, `--ds-on-accent`          |
| Auswahl, aktive Fläche       | `bg-accent-soft border-accent`                                                                                  | `--ds-accent-soft`                        |
| Link, Status                 | `text-link`, `text-success`, `text-warning`, `text-danger`, `text-info`                                         | `--ds-link`, `--ds-success` … `--ds-info` |
| Radien                       | `rounded-sm` (6) · `rounded-md` (10) · `rounded-lg` (16) · `rounded-full`                                       | `--ds-radius-*`                           |
| Schatten                     | `shadow-overlay` (nur Dialoge) · `shadow-focus`                                                                 | `--ds-shadow-overlay`, `--ds-focus-ring`  |
| Motion                       | `transition-colors` (150 ms) · `duration-slow` (250 ms)                                                         | `--ds-duration*`, `--ds-ease`             |
| Schriftgrade                 | `text-xs` 12 · `text-sm` 13 · `text-md` 14 · `text-lg` 16 · `text-xl` 20 · `text-2xl` 24 · `text-3xl` 32 (Hero) | `--ds-text-xs…3xl`, `--ds-leading*`       |
| Schrift, Gewichte            | `font-sans`, `font-mono`, `font-medium` 500 · `font-semibold` 600 · `font-bold` 700                             | `--ds-font-*`, `--ds-weight-*`            |

## Audio-spezifische Rollen

Der Audio Cutter führt keine eigenen Variablen ein, sondern bildet seine Funktionsfarben auf
vorhandene Tokens ab:

| Rolle                               | Token                           |
| ----------------------------------- | ------------------------------- |
| Auswahlanfang (Kante, START-Felder) | `--ds-warning`                  |
| Auswahlende (Kante, ENDE-Felder)    | `--ds-danger`                   |
| Wellenform                          | `--ds-info`                     |
| Auswahlbereich in der Waveform      | `--ds-accent-soft`              |
| Abspielmarker                       | `--ds-text`                     |
| Waveform-Fläche, Achse              | `--ds-surface-1`, `--ds-border` |
| Auswahl gültig                      | `--ds-success`                  |

Regeln wie im Collage Maker: Gold ist Vollfläche nur für die Primäraktion (Schneiden, Abspielen,
Download), Fokus und aktive Zustände. Ein Rahmen (1 px), drei Radien, Schatten nur für Overlays. Hover
ändert Farbe, nie Größe. Destruktive Aktionen sind textbasiert (`text-danger`) auf einer flachen
Fläche. `tests/designTokens.spec.ts` verhindert die Rückkehr der alten Color-Extractor-Palette, von
`dark:`-Varianten, Gradients, Blur, Karten-Schatten und Emoji.
