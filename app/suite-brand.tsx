export default function SuiteBrand() {
  return <a className="suite-brand approved-brand" href="/home" aria-label="Home">
    <span className="suite-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M25.2 6.8l-2.8 2.8M9.6 22.4l-2.8 2.8" />
        <circle cx="16" cy="16" r="7.5" />
        <circle cx="16" cy="16" r="2.5" />
      </svg>
      <i />
    </span>
    <span className="suite-brand-copy"><strong>goldie <em>suite</em></strong><small>SELLER COMMAND CENTER</small></span>
  </a>;
}
