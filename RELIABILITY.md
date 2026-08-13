# Goldie Listing Factory reliability contract

These rules are requirements, not optional optimizations.

## Artwork integrity

- Goldie must send the original PNG or JPEG bytes unchanged.
- Goldie must never decode, resize, crop, recompress, flatten, recolor, or change transparency.
- Goldie must never treat DPI metadata as additional image detail.
- Any future artwork optimization must be a separate, explicit seller choice and must never replace the original silently.

## Memory and throughput

- The browser processes one file at a time.
- Artwork moves as a streamable Blob; the browser never creates a pixel canvas.
- Goldie's server stages the original stream in temporary object storage.
- Printify receives a short-lived signed URL, which is its recommended method for files larger than 5 MB.
- Goldie's server never buffers or base64-expands the full artwork.
- The file header is validated as PNG or JPEG before temporary storage without decoding the image.

## Safety and recovery

- Account, token, shop, template, variants, and placements are preflighted before a batch starts.
- Each design has a deterministic idempotency record so a retry cannot duplicate a successful draft.
- Temporary network, rate-limit, image-registration, and remote-download errors retry with bounded waits.
- Permanent file, account, and template errors fail only the affected stage and provide an owner diagnostic.
- Every request has a deadline; no UI state may wait forever.
- Temporary artwork is bound to the signed-in member, deleted after the Printify operation, denied after expiry, and purged opportunistically after an interrupted process.
- A temporary Printify outage must never delete a valid saved connection.
- Token encryption and decryption use one validated implementation everywhere.
- If a browser loses a draft response, Goldie reconciles the existing server job before attempting another creation.
- Retry progress always uses the retry set as its denominator; full-batch progress always uses the full batch.
- Editor links open directly from the seller's click; no timed cross-page redirect is allowed.
- Support submissions are authenticated and proxied through Goldie's server; integration credentials are not shipped in the customer bundle.

## Regression rule

No change may ship unless the production build, lint, workflow tests, security assertions, and failure-path tests all pass as one release. Artwork must remain undecoded in the browser, unbuffered on the server, member-bound in temporary storage, and idempotent through uncertain retries.
