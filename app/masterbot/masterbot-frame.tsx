import "./masterbot.css";

export default function MasterbotFrame({ children }: { children: React.ReactNode }) {
  return <div className="mb-page">
    <header className="mb-top">
      <a className="mb-brand" href="/masterbot">MASTERBOT™</a>
      <nav className="mb-nav"><a href="/masterbot/support">Support</a><a href="/masterbot/privacy">Privacy</a><a href="/masterbot/terms">Terms</a></nav>
    </header>
    <main className="mb-main">{children}</main>
    <footer className="mb-foot">© 2026 Be A Wolf Biz</footer>
  </div>;
}
