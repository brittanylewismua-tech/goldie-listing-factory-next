declare module "upng-js" {
  const UPNG: {
    encode(buffers: ArrayBuffer[], width: number, height: number, colors: number): ArrayBuffer;
  };
  export default UPNG;
}
