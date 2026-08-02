---
name: Emerald Artisan
colors:
  surface: '#121413'
  surface-dim: '#121413'
  surface-bright: '#383a38'
  surface-container-lowest: '#0d0f0e'
  surface-container-low: '#1a1c1b'
  surface-container: '#1e201f'
  surface-container-high: '#282a29'
  surface-container-highest: '#333534'
  on-surface: '#e2e3e0'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#e2e3e0'
  inverse-on-surface: '#2f312f'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#c0c9c2'
  on-secondary: '#2a322e'
  secondary-container: '#404944'
  on-secondary-container: '#aeb7b1'
  tertiary: '#68dba9'
  on-tertiary: '#003825'
  tertiary-container: '#3eb686'
  on-tertiary-container: '#00422c'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#dce5de'
  secondary-fixed-dim: '#c0c9c2'
  on-secondary-fixed: '#151d19'
  on-secondary-fixed-variant: '#404944'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#121413'
  on-background: '#e2e3e0'
  surface-variant: '#333534'
  surface-elevated: '#1A241F'
  status-pending: '#F59E0B'
  status-error: '#EF4444'
  text-muted: '#94A3B8'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-bold:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-padding: 1rem
  stack-gap: 1.5rem
  grid-gutter: 1rem
  inner-padding: 1.25rem
  component-height-lg: 3.5rem
---

## Brand & Style

The design system is crafted for the modern tradesperson—specifically professionals in the painting and services industry. It balances technical precision with approachable utility. The brand personality is **reliable, industrious, and high-performance**, evoking the feeling of a well-organized workshop.

The visual style is a sophisticated **Corporate Modern** approach blended with **Glassmorphism** for depth. It uses a "Deep Dark" foundation to reduce eye strain during long hours of administrative work, paired with high-energy emerald accents that signal growth and success. Every element is designed to feel high-contrast and legible, ensuring that data entry is effortless even in varied lighting conditions found on job sites.

## Colors

The palette is anchored by a near-black neutral base (`#0A0C0B`) to provide maximum contrast for functional elements.

- **Primary Emerald:** Used for high-priority actions, active states, and successful financial indicators.
- **Deep Surface:** The primary container color, providing a subtle green-tinted dark grey that feels more organic than pure black.
- **Named Accents:** Includes a warmer amber for "Pending" statuses and a sharp red for "Danger Zone" actions, ensuring critical information is never missed.

The system uses a monochromatic green scale for secondary UI elements to maintain a focused, professional environment.

## Typography

This design system utilizes **Inter** for its exceptional legibility and neutral, functional character. The hierarchy is tight and data-focused.

- **Headlines:** Bold and tight-tracked to feel impactful.
- **Body:** Standardized for maximum readability in both paragraphs and list items.
- **Data-Mono:** While Inter is used, numeric values (like financial totals) should utilize semi-tabular figures where possible to ensure columns of numbers align perfectly for the user.
- **Labels:** Small caps or bold uppercase labels are used for metadata to distinguish it from interactive content.

## Layout & Spacing

The system follows a **Fluid Grid** model optimized for PWA usage on mobile devices. 

- **Margins & Gutters:** A standard 16px (1rem) margin is applied to the screen edges. 
- **Rhythm:** An 8px linear scale governs all spacing.
- **Mobile First:** On mobile, components occupy the full width of the container. On tablets and desktops, cards should be constrained to a 12-column grid with content centered to maintain focus.
- **Touch Targets:** Minimum touch target size is 48x48px to accommodate users who may be using the app while working on-site.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** rather than heavy shadows.

- **Level 0 (Background):** Pure `#0A0C0B`.
- **Level 1 (Cards):** `#121A16` with a subtle 1px border of `#ffffff10`.
- **Level 2 (Modals/Popovers):** `#1A241F` with a soft ambient shadow (0px 10px 30px rgba(0,0,0,0.5)).
- **Emerald Glow:** Active elements or selected days in the calendar use a subtle emerald outer glow (`#10B981` at 20% opacity) to denote the "Active" state without cluttering the UI.

## Shapes

The shape language is **Rounded**, reflecting a modern and accessible tool.

- **Cards:** Use 1rem (16px) corner radius to create a friendly, approachable container.
- **Buttons & Inputs:** Use 0.5rem (8px) for a more precise, functional feel.
- **Pills/Chips:** Fully rounded (500px) to distinguish category labels from actionable buttons.

## Components

- **Cards:** Should have a dark surface and a subtle top-border highlight when containing primary information. They serve as the primary wrapper for all content modules.
- **Buttons:**
    - *Primary:* Solid Emerald with black text.
    - *Secondary:* Outlined Emerald with transparent background.
    - *Danger:* Solid red for "Clear Data" actions.
- **Input Fields:** Semi-transparent emerald-tinted backgrounds with a bottom-only border that glows emerald upon focus.
- **Status Chips:** Small, pill-shaped containers with low-opacity background fills and high-opacity text (e.g., a "Paid" chip has 10% emerald background and 100% emerald text).
- **Calendar Cells:** Circular indicators for "Active" or "Today," with subtle icons (Briefcase/People) placed as dots beneath the date to indicate work types.
- **Bottom Navigation:** Fixed blurred glass effect (`backdrop-filter: blur(10px)`) with emerald active icons and labels.