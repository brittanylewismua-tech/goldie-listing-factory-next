export default function SuiteBrand({current=false}:{current?:boolean}) {
  return <a className="suite-brand approved-brand" href="/home" aria-label="The Goldie Suite home">
    <span className="suite-brand-mark suite-brand-g current-wordmark" aria-hidden="true">g</span>
    <span className="suite-brand-copy">{current?<strong className="current-logo-text">The Goldie Suite</strong>:<><strong>The Goldie Suite</strong><small>SELLER TOOLS</small></>}</span>
  </a>;
}
