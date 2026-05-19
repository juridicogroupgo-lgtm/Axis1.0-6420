# Axis Capital — Design System

## Brand
- Name: Axis Capital
- Product: Crédito do Trabalhador (Consignado CLT)
- White-label: Never expose Go Fintech, Bankerize, Consiga

## Color Palette
- Background primary: #09090B (near-black)
- Background secondary: #111113
- Background card: #18181B
- Background elevated: #1C1C1F
- Border: #27272A
- Border subtle: #1F1F22
- Purple primary: #7C3AED (violet-700)
- Purple accent: #8B5CF6 (violet-500)
- Purple glow: #A78BFA (violet-400)
- Purple dim: #4C1D95 (violet-900)
- Text primary: #FAFAFA
- Text secondary: #A1A1AA
- Text muted: #52525B
- Green success: #22C55E
- Red danger: #EF4444
- Yellow warning: #F59E0B
- Blue info: #3B82F6
- Orange: #F97316

## Typography
- Font: 'Geist', 'Inter', system-ui (fallback)
- Display: 700 weight, tight tracking
- Heading: 600 weight
- Body: 400 weight, 1.6 line-height
- Mono: 'Geist Mono', 'Fira Code'

## Component Style
- Borders: 1px solid #27272A, radius 8px (cards), 6px (inputs), 4px (badges)
- Shadows: glow effects on accent elements
- Cards: bg #18181B, border #27272A, hover border #3F3F46
- Inputs: bg #111113, border #27272A, focus border #7C3AED, focus ring purple/20
- Buttons primary: bg #7C3AED, hover #6D28D9, text white
- Buttons secondary: bg transparent, border #27272A, hover bg #18181B
- Badges: pill shaped, colored by status
- Sidebar: #111113 bg, 240px wide

## Status Colors
- PAGA / PAGO: green (#22C55E)
- APROVADA / APROVADO: green (#22C55E)
- ASSINADA: blue (#3B82F6)
- EM ANÁLISE: yellow (#F59E0B)
- PENDÊNCIA: orange (#F97316)
- CANCELADA: red (#EF4444)
- REPROVADA: red (#EF4444)
- AGUARDANDO AVERBAÇÃO: violet (#8B5CF6)
- AGUARDANDO ASSINATURA: blue (#60A5FA)
- ENVIADA: violet (#A78BFA)
- default: zinc (#71717A)

## Layout
- Sidebar: fixed left, 240px, collapsible
- Main content: flex-1, padding 24px
- Dashboard: 4-col grid cards, then 2-col charts
- Esteira: horizontal scrollable kanban
- Tables: zebra rows, sticky header
- Mobile: stack layout, bottom nav

## Motion
- Page transitions: fade + slight upward (200ms ease-out)
- Card hover: border color transition 150ms
- Status badges: pulse animation on active states
- Real-time updates: flash animation on changed values

## Logo
- "AXIS" bold uppercase + "Capital" light weight
- Purple accent on "AXIS"
- Simple, premium wordmark
