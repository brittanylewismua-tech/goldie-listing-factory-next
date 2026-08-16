# Goldie 10× Product Uplevel Map

This is the permanent implementation and QA checklist for the premium Goldie experience.

## 1. Brand promise and messaging

- Lead new users with the outcome: turn finished designs into ready-to-publish Etsy listings without rebuilding products by hand.
- Show the three concrete benefits before asking for a token: up to 20 listings, size-by-size profitable pricing, and titles/tags/Etsy details/images in one workflow.
- Keep step names literal and kindergarten-clear, while making supporting copy sound sharp, capable, reassuring, and distinctly Goldie.
- Replace generic SaaS language with outcome language: designs checked, margins visible, validated keywords used, listings ready.
- Never imply Goldie invents keyword phrases; titles use only seller-validated keyword banks.

## 2. Locked visual identity

- Palette: midnight plum, blackberry, mulberry, warm lilac, muted orchid, luminous pearl, restrained blush only inside gradients.
- Exclude cool blue-purple, peach, gold, candy pink, large white fields, noisy glass effects, and concentrated gradient blobs.
- Signature gradient should resemble light through amethyst: controlled, directional, and used only for active navigation, current progress, primary actions, selected cards, subtle environmental light, and completion moments.
- Use calm information surfaces and reserve visual drama for decisions and progress.

## 3. Canonical component system

- One primary button, secondary button, tertiary/text action, destructive action, and disabled treatment.
- Sentence-case primary actions; uppercase only for small categories and metadata.
- One card system, input system, notification position, loading pattern, modal pattern, spacing scale, radius scale, and shadow scale.
- Active and disabled controls must remain readable and accessible.
- Connect Printify and Connect Etsy use the same button component, with hierarchy—not arbitrary styling—distinguishing them.

## 4. Global shell and navigation

- Simplify header branding; remove the redundant permanent “Listing + Mockup Factory” subtitle.
- Group navigation into primary work, resources, and account areas.
- Make the command field wider and useful: “Search Goldie or start a workflow…”
- Keep navigation readable at common laptop widths; collapse secondary destinations cleanly when space is limited.
- Keep the account/sign-out destination obvious.
- Remove artificial page height and stranded footer space.

## 5. Workflow and sidebar

- Keep the sidebar sticky on desktop and horizontally usable on small screens.
- Increase inactive-step contrast without making unavailable steps look active.
- Each step shows a meaningful state: account connected, product selected, designs ready, prices approved, drafts created, titles complete, Etsy details ready, images chosen, ready to publish.
- Completed circles glow softly in warm lilac; current circle uses a dark plum gradient and subtle breathing motion.
- Advance a subtle vertical progress rail through completed steps.
- Final destination becomes unmistakably “Ready to publish.”
- Preserve back navigation and autosaved work.

## 6. Main surfaces and hierarchy

- Replace the pale generic SaaS card with a luminous-pearl surface: lavender-gray base, plum tint, controlled top-left light, dimensional border, quiet inner highlight, and restrained shadow.
- Eliminate random hover gradient blobs and excessive surface color shifts.
- Increase small-text legibility, reduce unnecessary letter spacing, and use fewer tiny uppercase labels.
- Improve spacing between heading, explanation, controls, feedback, and progression actions.
- Keep dense numeric pages—especially pricing—the calmest and least intimidating surfaces.

## 7. Trust and connection experience

- Replace the detached decorative “Secure workspace” badge with functional trust copy inside the relevant card.
- Explicitly state that the token is encrypted, saved securely, and never displayed again.
- Explain why Printify is required now and why Etsy is only required before final publishing.
- Keep the required progression action visually primary; optional/future actions remain secondary.

## 8. Contextual Goldie intelligence

- Surface recommendations exactly where decisions happen, never in a generic chatbot bubble.
- Examples: usual shipping profile, upload completion, low DPI at largest size, product-to-Etsy-category match, size-wide pricing propagation, repeated mockup selections.
- Goldie insights explain what was noticed and what action—if any—the seller should take.
- Do not fill optional Etsy attributes merely to make the form look complete.

## 9. Progress and value receipts

- After meaningful actions, state exactly what Goldie accomplished.
- Upload: number checked and original resolution preserved.
- Pricing: variants calculated and profit-target exceptions.
- Titles: unique titles, validated keyword phrases, matching tags, zero invented keywords.
- Final batch: listings published, tags generated, mockups prepared, variants approved, estimated time saved, direct Etsy links.
- Motion communicates state change only: uploads arrive, completed checks resolve, prices recalculate, titles populate, final review assembles.
- Respect reduced-motion settings.

## 10. New-user and returning-user experiences

- New user sees the product promise, complete outcome, connection guidance, and security reassurance before setup.
- Returning user lands on a command center with resume last batch, repeat last product, recent products, keyword banks, mockup sets, monthly output, and account alerts.
- Do not make a returning user emotionally start from zero.
- Command search supports starting batches, reusing products, opening keyword banks, and finding recent work.

## 11. Responsive and accessibility

- Validate common laptop, tablet, and mobile widths.
- Maintain readable text contrast, visible focus states, touch-sized actions, logical keyboard order, and understandable disabled states.
- Never hide the workflow map on mobile; adapt it.
- No clipped headings, overlapping panels, stranded actions, or horizontal overflow.

## 12. Acceptance criteria

- A first-time seller can explain Goldie’s value within five seconds.
- The required next action is obvious on every step.
- Every control style is canonical and consistent.
- The experience feels premium, warm, intelligent, and operational—not decorative or juvenile.
- Every workflow state has success, loading, empty, error, and retry behavior.
- All routes use the same brand and navigation system.
- Build and full test suite pass; the live preview is visually audited before deployment.
