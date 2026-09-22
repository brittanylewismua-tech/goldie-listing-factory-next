/*
  THE WORDMARK.

  This was a gear glyph plus "Goldie Suite / SELLER TOOLS", written while the
  umbrella product had no name. It has one, and the approved design draws it
  as a wordmark - GOLDIE in white, SUITE in pink beside it - with no icon,
  because a mark nobody has drawn is a placeholder, and a placeholder in the
  corner of every page is how a temporary thing quietly becomes permanent.

  The two words are separate elements so the second carries its own colour and
  tracking without a nested font stack.
*/
export default function SuiteBrand() {
  return <a className="suite-brand approved-brand" href="/home" aria-label="Goldie Suite home">
    <span className="suite-wordmark"><b>GOLDIE</b><i>SUITE</i></span>
  </a>;
}
