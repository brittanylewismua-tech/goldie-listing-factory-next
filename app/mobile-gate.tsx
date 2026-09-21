/* ============================================================================
 * D828 · THE DESKTOP GATE, ON EVERY PAGE THAT RENDERS THE SHELL
 *
 * approved-functional.css carries, at (max-width:820px) and (pointer:coarse):
 *
 *   .app-shell > :not(.mobile-gate){display:none!important}
 *
 * Before D818 only the workflow rendered `.app-shell`, and it rendered this
 * card, so the rule had something to leave visible. D818 put Batch History,
 * Keyword Banks, Usage + Plan, Goals and the 404 inside the same shell and did
 * not bring the card with them, so on a phone that rule hides the sidebar AND
 * the main pane and leaves nothing behind it.
 *
 * Verified on an emulated Pixel 8 at 375px, on the deployed build:
 *   (max-width:820px) and (pointer:coarse)  ->  matches
 *   .app-shell > .topbar                    ->  display:none
 *   .app-shell > .factory-main              ->  display:none
 *   document.querySelector('.mobile-gate')  ->  null
 * A blank pink screen, with horizontal overflow, on every interior page.
 *
 * One component, so the two surfaces cannot drift apart the way the two
 * sidebars did in D823.
 * ==========================================================================*/
export default function MobileGate() {
  return (
    <section className="mobile-gate" aria-label="Desktop required">
      <div className="mobile-brand">
        {/* This gate belongs to the Listing Factory, so it says so — and says
            nothing about an umbrella product that has no name yet. */}
        <a className="approved-wm" href="/home">Goldie Suite</a>
      </div>
      <div className="mobile-card">
        <div className="mobile-command">&#8984;</div>
        <h1>Create listings on a computer.</h1>
        <p>Listing Factory’s artwork and bulk editors need a larger screen. You can still browse your saved batches and manage your account here.</p>
        <nav className="mobile-work-links"><a href="/batches">Batch History</a><a href="/home">All tools</a></nav><div className="mobile-saved">&#10003; Your progress is saved automatically.</div>
      </div>
      <div className="mobile-footer">&copy; 2026 Be A Wolf Biz</div>
    </section>
  );
}
