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

## Safety and recovery

- Account, token, shop, template, variants, and placements are preflighted before a batch starts.
- Each design has a deterministic idempotency record so a retry cannot duplicate a successful draft.
- Temporary network, rate-limit, image-registration, and remote-download errors retry with bounded waits.
- Permanent file, account, and template errors fail only the affected stage and provide an owner diagnostic.
- Every request has a deadline; no UI state may wait forever.
- Temporary artwork is deleted after the Printify operation and expires automatically if a process is interrupted.

## Regression rule

No change may ship unless tests confirm artwork is never decoded in the browser, never base64-buffered on the server, and retries remain idempotent.
