# Frame design principles

Frame is a desktop-first editing workspace with a responsive web interface. Favor clear media controls, generous preview space and stable layouts over adding more panels. The original inspiration was Nuxt's restrained typography and surfaces; Frame now has its own violet/blue palette and island layout.

## Tokens and themes

`src/styles/tokens.css` is the source of truth. Use semantic CSS variables instead of hard-coded colors in components:

| Token              | Purpose                   | Dark default |
| ------------------ | ------------------------- | ------------ |
| `--bg`             | App background            | `#0b0c12`    |
| `--surface`        | Islands and panels        | `#181a23`    |
| `--surface-raised` | Menus and raised controls | `#202330`    |
| `--border`         | Panel boundaries          | `#303548`    |
| `--text`           | Primary text              | `#edeef7`    |
| `--muted`          | Secondary text            | `#a9adc5`    |
| `--accent`         | Actions and selection     | `#9b91ff`    |
| `--audio`          | Audio visualization       | `#a5c8fa`    |

Public Sans is bundled locally. System appearance is the default, with Light, Dark and High contrast previews in Settings. High contrast uses near-black surfaces, white text and clearly visible borders. New surfaces must remain legible in every theme.

## Layout and interaction

- Keep workflow navigation and project actions in the header; use a hamburger disclosure on phones.
- Let the player and timeline share available height, with bounded resizable islands and internal scrolling.
- Keep the Effects catalogue stable. Additions create timeline bars; clicking a bar opens a full-height modeless inspector overlay.
- Use direct frame manipulation for captions and overlays, with keyboard/touch alternatives and separate usable handles on very short bars.
- Conversion has its own queue/settings/results layout. The compact desktop converter reuses the same settings in a frameless corner window.
- Use a shared footer loading beam and clear status text instead of competing progress bars. Transient notices expire after five seconds; actionable results/downloads remain accessible.

Animations should preserve geometry: title-bar expansion and fullscreen transitions must not shift or shake the content. Cursor-responsive border lighting is relative to the whole app. Respect `prefers-reduced-motion`; decorative motion must never be required to understand state.

## Accessibility

Provide meaningful control labels, visible keyboard focus, sufficient contrast, accessible slider/separator values and predictable dialog dismissal. Do not use color alone to explain status. Space routes to playback outside text entry, while Escape cancels gestures or closes the current overlay. Keep minimum hit areas separate from the precise media duration they represent.
