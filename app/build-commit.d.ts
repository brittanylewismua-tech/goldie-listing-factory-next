/* D630 · Replaced verbatim by Vite at build time. Declared so the source that
   reads it typechecks, and read through `typeof` so a context without the
   define - plain node, a test importing the module - gets "" rather than a
   ReferenceError. */
declare const __BUILD_COMMIT__: string;
