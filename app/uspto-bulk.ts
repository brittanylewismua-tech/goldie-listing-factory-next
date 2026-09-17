/**
 * READING THE FEDERAL REGISTER, ONE BULK FILE AT A TIME.
 *
 * USPTO publishes no keyword search API for trademarks — patents have one,
 * trademarks do not (measured, not assumed: /api/v1/patent/applications/search
 * answers 200, every trademark spelling answers "Missing Authentication
 * Token", which is API Gateway for "no such route"). The only sanctioned way
 * to hold the register is to download the bulk XML and keep our own index.
 *
 * The files are zips of one enormous XML each. Nothing here ever holds a whole
 * file in memory: the zip's single entry is unwrapped by hand, handed to the
 * platform's raw-deflate decompressor, and the XML is cut into <case-file>
 * blocks as the bytes arrive. Memory stays at roughly one record plus a
 * carry-over buffer, whatever the file weighs.
 */

/** Where the product's file list lives. */
export const productFilesUrl = (product: string, from: string, to: string) =>
  `https://api.uspto.gov/api/v1/datasets/products/${product}` +
  `?fileDataFromDate=${from}&fileDataToDate=${to}`;

export type BulkFile = {
  name: string;
  bytes: number;
  url: string;
  /** The day the data covers, which is what makes a daily file orderable. */
  to: string;
};

type ProductResponse = {
  bulkDataProductBag?: Array<{
    productFileBag?: {
      fileDataBag?: Array<{
        fileName?: string;
        fileSize?: number;
        fileDownloadURI?: string;
        fileDataToDate?: string;
      }>;
    };
  }>;
};

export function filesFromProduct(payload: unknown): BulkFile[] {
  const bag = (payload as ProductResponse)?.bulkDataProductBag?.[0]?.productFileBag?.fileDataBag ?? [];
  return bag
    /*
      NOT EVERYTHING IN A PRODUCT IS DATA.

      USPTO ships the DTD documentation alongside the data — a .doc file sat in
      the applications product — and the ingest queued it like any other file,
      failed with "Not a zip", put it back in the queue, and picked it again.
      The register stopped loading for nine hours behind one Word document.
    */
    .filter(file => /\.zip$/i.test(String(file.fileName ?? "")))
    .filter(file => file.fileName && file.fileDownloadURI)
    .map(file => ({
      name: String(file.fileName),
      bytes: Number(file.fileSize ?? 0),
      url: String(file.fileDownloadURI),
      to: String(file.fileDataToDate ?? ""),
    }));
}

/**
 * Unwrap a zip that holds exactly one entry, without reading the whole thing.
 *
 * A zip entry starts with a 30-byte local header, then the name, then an
 * extra field, then the compressed bytes. Everything after that — data
 * descriptor, central directory — sits past the deflate stream's own end, and
 * the decompressor stops there on its own, so it costs nothing to ignore.
 */
export async function singleEntryDeflateStream(
  body: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array>> {
  const reader = body.getReader();
  let head = new Uint8Array(0);

  const grow = async (): Promise<boolean> => {
    const { value, done } = await reader.read();
    if (done || !value) return false;
    const next = new Uint8Array(head.length + value.length);
    next.set(head);
    next.set(value, head.length);
    head = next;
    return true;
  };

  /* 30 bytes is the fixed part; the name and extra lengths live inside it. */
  while (head.length < 30) if (!(await grow())) throw new Error("Truncated zip");
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (view.getUint32(0, true) !== 0x04034b50) throw new Error("Not a zip");
  const method = view.getUint16(8, true);
  if (method !== 8) throw new Error(`Zip entry is not deflate (method ${method})`);
  /* Zero means the size was not known when the file was written and follows
     the data instead; then the decompressor's own end is the only marker. */
  const compressedSize = view.getUint32(18, true);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const start = 30 + nameLength + extraLength;
  while (head.length < start) if (!(await grow())) throw new Error("Truncated zip header");

  const remainder = head.slice(start);
  let fed = 0;
  /* Hand the decompressor the bytes we over-read, then the rest of the body,
     and NOT ONE BYTE MORE. Past the entry sit the data descriptor and the
     central directory; feeding those makes the decompressor throw "Trailing
     bytes after end of compressed data" at the very end of an otherwise
     perfect read, which is a maddening way to lose a whole file. */
  const take = (chunk: Uint8Array): Uint8Array | null => {
    if (!compressedSize) return chunk;
    if (fed >= compressedSize) return null;
    const room = compressedSize - fed;
    const slice = chunk.length > room ? chunk.slice(0, room) : chunk;
    fed += slice.length;
    return slice;
  };

  const compressed = new ReadableStream<Uint8Array>({
    start(controller) {
      const first = remainder.length ? take(remainder) : null;
      if (first && first.length) controller.enqueue(first);
      if (compressedSize && fed >= compressedSize) controller.close();
    },
    async pull(controller) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        if (!value) continue;
        const slice = take(value);
        if (!slice) {
          controller.close();
          return reader.cancel().catch(() => undefined);
        }
        if (slice.length) {
          controller.enqueue(slice);
          if (compressedSize && fed >= compressedSize) {
            controller.close();
            return reader.cancel().catch(() => undefined);
          }
          return;
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  /* The platform types for these transforms disagree about the exact byte
     view; the runtime pair is correct, so the cast stays narrow. */
  const inflated = compressed.pipeThrough(
    new DecompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  );
  return endsCleanlyOnTrailingBytes(inflated);
}

/*
 * THE COMMENT ABOVE WAS WRONG, AND IT COST THE WHOLE BACKFILE.
 *
 * "Everything after the entry sits past the deflate stream's own end, and the
 * decompressor stops there on its own, so it costs nothing to ignore." It does
 * not stop. DecompressionStream reads the trailing data descriptor and central
 * directory and throws "Trailing bytes after end of compressed data".
 *
 * That only happens when the local header declares a compressed size of zero —
 * a zip written as a stream, with the size in a descriptor after the data — so
 * the bound that protects every other file does not exist and everything is
 * fed through. Most USPTO daily files carry a real size and were fine. The
 * historical backfile does not, so every one of the 88 waiting files failed
 * this way, was classified as a transient error, went back in the queue in the
 * same order, and was retried forever. The register looked like it was
 * progressing because the daily files kept landing behind it.
 *
 * The error arrives AFTER the decompressor has emitted every byte of real
 * output — the deflate stream ends exactly where the entry does, and the
 * complaint is about what follows. So the honest reading is: the entry is
 * complete, and the bytes after it are not ours. Anything else — a truncated
 * stream, a corrupt entry — still throws, because it throws before or instead
 * of producing the output.
 */
const TRAILING = /trailing bytes after end/i;

export function endsCleanlyOnTrailingBytes(
  stream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let produced = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) { controller.close(); return; }
        if (value?.length) { produced = true; controller.enqueue(value); }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        /* Only after real output, and only for this one complaint. A stream
           that produced nothing and then said this is a broken entry, not a
           complete one with a directory behind it. */
        if (produced && TRAILING.test(message)) { controller.close(); return; }
        throw error;
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}

/**
 * Cut a stream of XML into the blocks between <tag> and </tag>.
 *
 * The register's records are small and the file is not, so this yields one
 * record at a time and never keeps more than the record being assembled.
 */
export async function* blocks(
  stream: ReadableStream<Uint8Array>,
  tag: string,
): AsyncGenerator<string> {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const reader = stream
    .pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>)
    .getReader();
  let carry = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) carry += value;
    for (;;) {
      const from = carry.indexOf(open);
      if (from < 0) break;
      const until = carry.indexOf(close, from);
      if (until < 0) break;
      yield carry.slice(from, until + close.length);
      carry = carry.slice(until + close.length);
    }
    /* Anything before an opening tag is noise (DTD, root element, whitespace)
       and would otherwise grow without bound on a file with no records. */
    const keep = carry.lastIndexOf(open);
    if (keep > 0) carry = carry.slice(keep);
    if (done) return;
  }
}

/** First value of a simple element, or "" — the register nests, so scope it. */
export const field = (xml: string, tag: string): string => {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : "";
};

export const allFields = (xml: string, tag: string): string[] =>
  [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map(m => m[1].trim());
