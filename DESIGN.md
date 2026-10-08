# Nuxt design system

> Extracted by [Inspo](https://github.com/Nutlope/inspo) (open source, MIT, powered by Together AI). Reference material for *intentional* design decisions: adapt, don't copy.

> Save this as `DESIGN.md` in your project and re-reference it as you build; re-fetch anytime at https://inspomcp.dev/d/nuxt-com/DESIGN.md

- **Source:** https://nuxt.com
- **Captured:** 2026-05-04
- **Mode:** dark
- **Macrostructure:** Feature Stack

## Tone

The page uses a stark, dark color palette with a focus on typography and code snippets. The layout is structured with distinct sections, creating a sense of organized information delivery. Visual hierarchy is established through size and weight of text.  ·  vue framework, nuxt js, javascript framework, developer tools, dark ui, code examples, technical website, minimalist design, javascript, web development

## Colors

| Hex | Role (heuristic) |
|---|---|
| `#04d982` | support |
| `#048454` | support |
| `#7cfcc8` | accent |
| `#6e7c94` | support |
| `#b4b4bc` | support |

Color words: *muted*, *high-contrast*, *monochrome*

## Typography

Detected typefaces: **Public Sans**

| Role | Family | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| h1 | Public Sans | 72px | 700 | 1 | -1.8px |
| h2 | Public Sans | 18px | 500 | 1.56 | 0 |
| h3 | Public Sans | 14px | 600 | 1.43 | 0 |
| body | Public Sans | 16px | 400 | 1.5 | 0 |
| caption | Public Sans | 14px | 500 | 1.43 | 0 |
| button | Public Sans | 12px | 600 | 1 | 0 |

## Spacing scale

`6px` · `12px` · `16px` · `32px` · `48px` · `64px` · `80px` · `96px` · `128px` · `160px`

Base step looks like **4px**.

## Border radius

`0px` · `4px` · `6px` · `8px` · `12px` · `16px`

## Container

Max content width: **1440px**

## CSS variables exposed by the source

```css
:root {
  --color-sky-500: oklch(68.5% .169 237.323);
  --color-pink-500: oklch(65.6% .241 354.308);
  --color-neutral-600: oklch(44.6% 0.043 257.281);
  --color-blue-700: oklch(48.8% .243 264.376);
  --color-old-neutral-800: oklch(26.9% 0 none);
  --color-old-neutral-600: oklch(43.9% 0 none);
  --color-neutral-300: oklch(86.9% 0.022 252.894);
  --text-base--line-height: 1.5;
  --color-gray-300: oklch(87.2% .01 258.338);
  --color-yellow-400: oklch(85.2% .199 91.936);
  --font-mono: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
  --color-primary-500: #00c16a;
  --color-green-500: #00c16a;
  --color-white: #fff;
  --color-slate-400: oklch(70.4% .04 256.788);
  --font-weight-bold: 700;
  --color-gray-100: oklch(96.7% .003 264.542);
  --text-xs--line-height: 1.33333;
  --color-neutral-700: oklch(37.2% 0.044 257.287);
  --color-old-neutral-950: oklch(14.5% 0 none);
  --color-green-900: #0a5331;
  --text-xl: 1.25rem;
  --color-neutral-100: oklch(96.8% 0.007 247.896);
  --color-green-600: #00a155;
  --color-green-950: #052e16;
  --text-2xl--line-height: 1.33333;
  --spacing: .25rem;
  --text-xl--line-height: 1.4;
  --color-old-neutral-100: oklch(97% 0 none);
  --text-sm: .875rem;
  --color-green-400: #00dc82;
  --color-gray-950: oklch(13% .028 261.692);
  --color-gray-600: oklch(44.6% .03 256.802);
  --color-green-200: #b3f5d1;
  --color-old-neutral-200: oklch(92.2% 0 none);
  --color-black: #000;
  --color-neutral-400: oklch(70.4% .04 256.788);
  --text-4xl--line-height: 1.11111;
  --color-old-neutral-400: oklch(70.8% 0 none);
  --text-2xl: 1.5rem;
  --color-indigo-400: oklch(67.3% .182 276.935);
  --text-7xl: 4.5rem;
  --text-lg: 1.125rem;
  --color-neutral-500: oklch(55.4% 0.046 257.417);
  --color-pink-400: oklch(71.8% .202 349.761);
  --text-5xl--line-height: 1;
  --color-green-100: #d9fbe8;
  --color-old-neutral-500: oklch(55.6% 0 none);
  --text-lg--line-height: 1.55556;
  --color-red-400: oklch(70.4% .191 22.216);
  --color-red-500: oklch(63.7% .237 25.331);
  --text-6xl: 3.75rem;
  --text-7xl--line-height: 1;
  --color-old-neutral-900: oklch(20.5% 0 none);
  --color-gray-800: oklch(27.8% .033 256.848);
  --color-green-50: #effdf5;
  --color-slate-950: oklch(12.9% .042 264.695);
  --color-green-800: #016538;
  --font-weight-semibold: 600;
  --color-blue-500: oklch(62.3% .214 259.815);
}
```

## Components present

- hero with cta
- logo cloud
- feature trio
- sticky nav

## Notes for the agent

- **Adapt, don't copy.** The type ramp is a *starting point*. Scale it to your project's base size; preserve the *ratio*, not the literal pixels.
- **Color roles are heuristic** (luminance + dominance). Verify against the source URL before committing tokens.
- **Spacing** assumes a constant base step; round detected values to your project's scale (4 / 8 / 16) when implementing.
- **CSS variables** dumped above (when present) are the source's *actual* tokens - those are higher signal than guesses.
- This page's macrostructure is **Feature Stack**.

---

*Generated by Inspo. Open source under MIT, owned and operated by [Together AI](https://www.together.ai). Original site copyright remains with its authors.*