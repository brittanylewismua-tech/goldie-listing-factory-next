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
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const start = 30 + nameLength + extraLength;
  while (head.length < start) if (!(await grow())) throw new Error("Truncated zip header");

  const remainder = head.slice(start);
  /* Hand the decompressor the bytes we over-read, then the rest of the body. */
  const compressed = new ReadableStream<Uint8Array>({
    start(controller) {
      if (remainder.length) controller.enqueue(remainder);
    },
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) controller.close();
      else if (value) controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  /* The platform types for these transforms disagree about the exact byte
     view; the runtime pair is correct, so the cast stays narrow. */
  return compressed.pipeThrough(
    new DecompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  );
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
