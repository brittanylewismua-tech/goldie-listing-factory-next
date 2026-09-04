/* D479 - three times now a fix has been described as live when it was still
   sitting on GitHub, and the only way to tell was to guess from behaviour or
   go hunting for a CSS class in the built stylesheet. This string is bumped
   with every deployable commit and served from /api/version, so "is my fix
   actually live" is one request with a yes or no answer. */
/* D868 removes the redundant autosave label from every workflow action bar. */
export const BUILD_MARKER = "D1088";

/* D629 - and then it went stale for two deploys running, which is the exact
   failure D479 built it to prevent: D627 and D628 both shipped while this file
   still said D626, so /api/version answered D626 for code that was not D626.
   Verifying a deploy meant fetching the minified chunk and grepping it for a
   string literal.
   The cost is not only mine. NewBuildNotice compares this value against the
   server's to tell a seller her tab is behind - so every deploy where the bump
   is forgotten is a deploy where nobody working in an open tab is ever told to
   reload, which is D542 all over again.
   Vercel sets this on every build. It cannot be forgotten, because nobody types
   it. The hand-written marker stays as the readable label; the commit is the
   part that has to be right. Empty when the variable is absent, in which case
   the comparison falls back to the marker and behaves exactly as it did. */
/* D630 - D629 read VERCEL_GIT_COMMIT_SHA. This project builds with Vinext on
   Vite and deploys to Cloudflare; nothing sets that variable, so production
   answered {"build":"D629","commit":""} and the half of D629 meant to remove the
   human step did nothing at all. The build resolves the commit now - git first,
   CI variables after - and Vite inlines it here. Read through `typeof` so a
   context without the define gets "" instead of a ReferenceError, which is the
   same empty string D629 already degrades safely from. */
export const BUILD_COMMIT: string =
  typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : (process.env.VERCEL_GIT_COMMIT_SHA ?? "");
