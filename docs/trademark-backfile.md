# Trademark historical ingestion — what was actually blocking it

The backfile was described as blocked by the USPTO rate limiting us. It was
not. It was blocked by this codebase's own zip reader, and the 429 handling
built for it (D1574) was correct code solving a problem that was not the one
stopping the queue.

## What was happening

`/api/trademark/ingest-tick` returned 500 with **"Trailing bytes after end of
compressed data"** on every historical file. Measured 2026-09-17 on D1642:

```
files: { done: 27, skipped: 3, waiting: 88 }
lastCompletedAt: 12 hours ago
progressing: true        <- the probe said this
registerComplete: false
```

Three separate faults, each hiding the next:

1. **The zip reader.** Its own comment claimed everything after the entry
   "sits past the deflate stream's own end, and the decompressor stops there
   on its own, so it costs nothing to ignore." `DecompressionStream` does not
   stop — it reads the data descriptor and central directory and throws. This
   only bites when the local header declares a compressed size of zero, a zip
   written as a stream with its size in a descriptor after the data. The
   USPTO **daily** files carry a real size and were fine. The **historical**
   files do not. That asymmetry is exactly why daily progress looked healthy
   while the backfile never moved.

2. **The permanent-failure classifier** matched three hardcoded error strings.
   "Trailing bytes after end of compressed data" matched none, so all 88 files
   were treated as transient, went back in the queue in the same order, and
   were retried forever — the precise failure that list was added to prevent,
   reached through a message it did not know.

3. **The health probe** asked "when did a file last finish", which cannot tell
   a daily file from a historical one. A daily file arrives every day, so
   `progressing` read true throughout.

## The fixes

- A trailing-bytes error **after real output** is read as the end of the
  entry, because the deflate stream ends exactly where the entry does and the
  complaint is about what follows. The same error with no output still throws:
  that is a corrupt entry, not a complete one with a directory behind it.
- A file that fails the **same way three times** is parked whatever its
  message says. Rate limits are exempt and keep their escalating backoff.
- The probe measures the **backfile separately**: its own last completion, its
  own waiting count, and six hours without one finishing while work is queued
  reads as broken.

## Verified live

D1646, within minutes of deploy:

| | before | after |
|---|---|---|
| files done | 27 | **31** |
| waiting | 88 | **82** |
| marks in register | 192,321 | **192,669** |

The first historical marks added since 2026-09-14. 82 files remain and the
queue advances on its own from here.
