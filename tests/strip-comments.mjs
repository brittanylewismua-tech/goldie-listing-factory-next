/**
 * Remove comments from source before grepping it.
 *
 * Written once, after four guards in a single session tripped on their own
 * explanations: a test that forbids `unsafe-inline` matched the comment
 * saying why it is absent, a test counting `.catch(` counted the comment
 * explaining a removed catch, and so on. The reasons live in comments and
 * the reasons quote the rules.
 *
 * The fifth failure was subtler and is why this is shared rather than
 * copied: `https://*.supabase.co` contains `//*`, which a naive block-comment
 * pattern reads as an opener and then swallows everything up to the next
 * `*​/` — in that case the whole rest of a Content-Security-Policy. So a
 * comment opener is only honoured when it is not part of a URL.
 */
export function stripComments(source) {
  return source
    /* A block comment, unless the slash is inside something like http:// */
    .replace(/(^|[^:/])\/\*[\s\S]*?\*\//g, "$1 ")
    /* A line comment, unless the slashes are a URL's */
    .replace(/(^|[^:/])\/\/[^\n]*/g, "$1 ");
}
