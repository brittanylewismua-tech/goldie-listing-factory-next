# Active AI and email — verified September 5

## AI

The active title/tag and Etsy-details routes call `openrouter/router/vision`
through fal with model `google/gemini-2.5-flash`. This is Google Gemini, not
OpenAI, and payment must fund the current fal account, not Google AI Studio.
Titles use exact phrases from the seller's keyword bank. Artwork is read for
context; the retired FAL image-generation feature is not part of this forecast.

At the latest billing inspection the fal account still showed $1.39 in credits
and no saved payment method. No card, top-up, auto-recharge or budget was changed.

## Email

Live Supabase project `ywncfltxrnrchicjwcse` has custom SMTP enabled with host
`smtp.resend.com`. The app's email sign-in uses `signInWithOtp`, including new
email accounts. Google OAuth sign-in does not require sending that email.
The other verified direct Resend use is a trial-ending reminder, scheduled for
one day before the trial ends. These share the Resend account's sending quota.

The verified Free plan allows 100 emails/day and 3,000/month. This is NOT a
100-user limit: returning users and resends consume email too, while Google
sign-ins do not. The Pro chooser offers $20/month, 50,000 emails/month, no daily
email limit, with additional emails listed at $0.90/1,000. Do not describe this
as unlimited monthly email or enable pay-as-you-go silently.

The subsequent live Usage page confirms Transactional Pro, 32/50,000 monthly
emails, unlimited daily sending, and renewal October 5. Transactional
pay-as-you-go is OFF; automation overages and the optional domain add-on are OFF.
The user completed the upgrade while this work was in progress.
Authentication also has its own Supabase rate-limit settings, separate from
Resend's plan. An email-plan upgrade alone does not prove those are adequate.

Sources: production source, authenticated Supabase SMTP settings, fal billing,
and Resend billing/transactional-plan chooser. No payment was submitted by the
agent during these checks.
