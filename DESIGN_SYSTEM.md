# Goldie Design System — Frozen Checkpoint

This is the permanent visual baseline for Listing Factory. Future visual changes must be compared against the checkpoint image in `design-checkpoints/` and must not introduce a second version of an existing component.

## Fixed palette

- Background: `#151021` / `#100c19`
- Primary gradient: `#70498a → #945b9e → #b66f9b`
- Plum label: `#8f4f78`
- Dark text: `#211a2e`
- Muted text: `#6f6980`
- Main surface: `#fbfaff`
- Soft surface: `#f3eff7`
- Card gradient: `#e5dfec → #ddd4e6 → #d6cbe0`
- Border: `#d8d0e3`
- Danger: `#a83932`

The signature gradient is reserved for primary actions, active navigation, the current step, selected cards, and completion moments. Inputs and dense information surfaces remain calm.

## Canonical components

- Primary action: plum gradient, uppercase 11px label, 10px radius.
- Secondary action: pale neutral surface, plum text, matching size and radius.
- Destructive action: solid danger red. Never use the primary gradient for deletion or irreversible actions.
- Disabled: 52% opacity, reduced saturation, no lift or shadow.
- Card: 18px radius, one subtle border, no radial color pools.
- Field: white surface, 9px radius, plum focus ring.
- Status: compact pill; neutral, success, or attention only.
- Notification: one fixed, centered overlay position near the action context.
- Loading: one small bordered spinner plus a plain-language status and count.
- Modal: centered, dimmed backdrop, one clear primary decision.

## Spacing scale

Use only 4, 8, 12, 16, 24, or 32px for component spacing.

## Motion rules

- Motion communicates state change only.
- Completed steps resolve once; the current step breathes subtly.
- Lists enter in a short sequence when generated.
- Processing buttons acknowledge the click immediately with changed text.
- Completion may use one restrained arrival animation; no confetti.
- Every animation must honor `prefers-reduced-motion`.

## Visual-change protocol

1. Capture the affected state before editing.
2. Change the canonical component or token—never patch one isolated instance unless its meaning is unique.
3. Compare against the frozen checkpoint at desktop and mobile widths.
4. Verify contrast, focus, disabled, loading, error, and success states.
5. Update the checkpoint only after explicit approval.
