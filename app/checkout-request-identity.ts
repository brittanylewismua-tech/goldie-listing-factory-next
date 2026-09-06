/** Stripe requires every retry with the same key to have identical parameters.
 * Include the complete checkout configuration, so changing a price or trial
 * cannot reuse an incompatible session. Hashes keep account IDs out of keys. */
export async function checkoutRequestIdentity(params: URLSearchParams, day = new Date().toISOString().slice(0, 10)) {
  const entries = [...params.entries()].filter(([key]) => key !== "integration_identifier").sort(([a], [b]) => a.localeCompare(b));
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([day, entries]))));
  const hash = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  const suffix = [...bytes.slice(0, 8)].map(value => String.fromCharCode(97 + value % 26)).join("");
  return { idempotencyKey: `goldie-checkout-v2-${hash}`, integrationIdentifier: `goldie_${suffix}` };
}
