declare module "upng-js" {
  type Decoded = { width: number; height: number } & Record<string, unknown>;
  const UPNG: {
    decode(buffer: ArrayBuffer): Decoded;
    toRGBA8(decoded: Decoded): ArrayBuffer[];
    quantize(buffers: ArrayBuffer[], colors: number): { bufs: ArrayBuffer[] };
    encode(buffers: ArrayBuffer[], width: number, height: number, colors: number): ArrayBuffer;
  };
  export default UPNG;
}
