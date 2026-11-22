---
name: "OpenWA Artha - Obsidian Omnichannel"
description: "Dark-first, Revolut & Linear-inspired obsidian zinc design system with channel-specific accents for WhatsApp, Instagram, Facebook, and Google Business Profile."
---

## Overview

OpenWA / Artha is a modern, mobile-first omnichannel business messaging and reputation platform. Inspired by Revolut and Linear, the interface pairs a deep obsidian canvas (`#09090B`) with elevated translucent zinc-900 cards, crisp 1px zinc-800 hairline borders, and disciplined channel-coded accents. The aesthetic is precise, high-contrast, and ergonomically tuned for one-handed thumb navigation.

## Colors

The system follows a strict **60/30/10** color distribution in dark mode:
- **60% Obsidian Ground (`surface`):** `#09090B` (zinc-950) provides a deep, glare-free canvas.
- **30% Elevated Cards (`surface-container`):** `#18181B` (zinc-900) with 80% translucency and backdrop blur, framed by `outline-variant` (`#27272A`, zinc-800) borders.
- **10% Channel & Action Accents:** Emerald (`#10B981`) for WhatsApp and the primary "Connect Channel" action; Purple-Pink (`#A855F7` to `#EC4899`) for Instagram Business; Meta Blue (`#3B82F6`) for Facebook Page; Amber (`#F59E0B`) for Google Business Profile.

```yaml
colors:
  primary: "#10B981"
  on-primary: "#022C22"
  primary-container: "#064E3B"
  on-primary-container: "#6EE7B7"
  surface: "#09090B"
  surface-container-lowest: "#09090B"
  surface-container-low: "#121215"
  surface-container: "#18181B"
  surface-container-high: "#27272A"
  on-surface: "#FAFAFA"
  on-surface-variant: "#A1A1AA"
  outline: "#71717A"
  outline-variant: "#27272A"
  whatsapp: "#10B981"
  on-whatsapp: "#022C22"
  instagram-purple: "#A855F7"
  instagram-pink: "#EC4899"
  facebook: "#3B82F6"
  on-facebook: "#1E1E1E"
  google-amber: "#F59E0B"
  on-google-amber: "#451A03"
  neural-indigo: "#6366F1"
  neural-violet: "#8B5CF6"
  voice-cyan: "#06B6D4"
  error: "#EF4444"
  on-error: "#1C1C1C"
```

## Typography

A single modern sans-serif (**Inter**) across the entire interface, constrained to four deliberate hierarchy levels for maximum scannability on mobile screens. Numeric metrics, ratings, and timestamps use `tabular-nums`.

```yaml
typography:
  display:
    fontFamily: "Inter"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 32px
    letterSpacing: -0.48px
  section:
    fontFamily: "Inter"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: -0.25px
  body:
    fontFamily: "Inter"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0px
  micro:
    fontFamily: "Inter"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.2px
```

## Layout & Spacing

A mobile-first single-column fluid layout (`390px` target width) with `16px` horizontal page padding and a `4px`/`8px` spatial rhythm. The bottom navigation dock and floating action button sit in the lower thumb zone with safe bottom clearance (`88px`+ bottom padding on `<main>`). Horizontal metric carousels snap cleanly with edge-to-edge bleed.

```yaml
spacing:
  gutter-xs: 4px
  gutter-sm: 8px
  gutter-md: 12px
  gutter-lg: 16px
  gutter-xl: 24px
  section: 24px
  page-margin: 16px
```

## Elevation & Depth

Depth is achieved through subtle tonal stepping (`#09090B` ground to `#18181B` at 80% opacity with `backdrop-blur-md`) and crisp `1px` hairline borders (`#27272A`), rather than heavy drop shadows. The sole glowing shadow is reserved for the primary Floating Action Button (`shadow-[0_0_24px_rgba(16,185,129,0.45)]`) and live status indicators.

## Shapes

Generous, modern `16px` (`rounded-2xl`) corners on all channel cards, metric cards, and activity containers, paired with `12px` (`rounded-xl`) inner icon containers and `full` (`9999px`) pills for status badges, workspace selectors, and the Floating Action Button.

```yaml
rounded:
  sm: 8px
  DEFAULT: 12px
  md: 12px
  lg: 16px
  xl: 20px
  full: 9999px
```

## Motion & Micro-interaction

Snappy, Linear-inspired transitions (`150ms ease-out`) on card hover/press states and subtle `animate-pulse` / `animate-ping` solely on the live system status indicator and active WhatsApp Cloud API "WORKING" dot.

```yaml
motion:
  state-change:
    duration: 150ms
    delay: 0ms
    timingFunction: ease-out
  surface-enter:
    duration: 220ms
    delay: 0ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
```

## Voice & Content Strategy

Concise, operational, and data-first. Channel statuses use clear uppercase micro-badges (`WORKING`, `CONNECTED`, `ON`, `ACTIVE`). Numbers are formatted compactly (`142.8k`, `24.5k`, `4.8 ★`, `99.8%`) with `tabular-nums`.

## Components

Component implementations live as individual HTML sticker sheet files in
`components/`. Each file contains the canonical, styled HTML components with
`<!-- COMPONENT: name -->` comment markers. Read each file before use.

- **Badge** → `@components/badge.html`: `badge-numeric`, `badge-dot`
- **Button** → `@components/button.html`: `button-primary`, `button-icon`, `button-with-icon`
- **Card** → `@components/card.html`: `card-elevated`, `card-action`, `card-interactive`, `card-interactive-2`
- **Typography** → `@components/typography.html`: `typography-display`, `typography-body`, `typography-label`
