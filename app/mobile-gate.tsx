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
        <div className="approved-wm">Gold<span className="approved-i">&#305;<span>&#10022;</span></span>e</div>
        <div className="approved-sub">Listing Factory</div>
      </div>
      <div className="mobile-card">
        <div className="mobile-command">&#8984;</div>
        <h1>Oops, this one needs a bigger screen.</h1>
        <p>Goldie Listing Factory is built for desktop. Hop onto your computer and sign in. Your saved work will be waiting for you.</p>
        <div className="mobile-saved">&#10003; Your progress is saved automatically.</div>
      </div>
      <div className="mobile-footer">Powered by Goldie AI &middot; &copy; 2026 Be A Wolf Biz</div>
    </section>
  );
}
