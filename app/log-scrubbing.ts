/**
 * WHAT A LOG IS ALLOWED TO REMEMBER.
 *
 * Pulled out of error-log.ts so it can be tested by running it. That file
 * imports the Cloudflare runtime, which means a pure string function was
 * only reachable through a module that cannot load outside a worker — so
 * the one piece of security code most worth exercising directly was the
 * piece hardest to exercise at all.
 */

/* Tokens and keys must never be written into a log we then email around. */
const SECRETS = /\b(Bearer\s+[\w.\-]+|sk-[\w-]{8,}|key-[\w-]{8,}|gld-admin-[\w-]+|eyJ[\w.-]{20,})/gi;

/*
  D1714 · AND THE ONES THAT LIVE IN A QUERY STRING.

  The pattern above catches a credential that looks like a credential. It does
  not catch one that is simply the value of a parameter — and three of ours
  are exactly that:

    signature=   the HMAC on a staged-artwork URL, replayable for 30 minutes
    code=        an Etsy OAuth authorization code
    state=       the row that IS the credential for an OAuth flow

  Nothing writes them today. withErrorLog records `pathname` only, so the
  automatic path already drops every query string, and the single caller that
  passes `context` passes three ids. So this is not a leak; it is the
  difference between "no caller has done it yet" and "a caller cannot".

  The key is kept and the value redacted, because knowing a signature was
  present is diagnostic and knowing what it was is a loaded gun.
*/
const QUERY_SECRETS =
  /\b(signature|code|state|code_verifier|token|access_token|refresh_token|secret|api_key|apikey)=([^&\s"'\]}]+)/gi;
export function scrubSecrets(value: string) {
  return value
    .replace(SECRETS, "[redacted]")
    .replace(QUERY_SECRETS, (_whole, key: string) => `${key}=[redacted]`);
}

