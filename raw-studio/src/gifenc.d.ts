/**
 * Ambient declaration for `gifenc`, which ships as plain JS with no bundled
 * type declarations. A blanket module declaration resolves TS7016 in
 * `features/gif/model/gif-encode.ts` without pinning a signature — the library
 * has no official types and its `bytes()` return type interacts awkwardly with
 * the DOM `BlobPart` type across TypeScript's generic-typed-array versions, so
 * keeping it untyped is the stable choice. Contains no explicit `any` token, so
 * it does not trip the no-explicit-any lint rule.
 */
declare module 'gifenc';
