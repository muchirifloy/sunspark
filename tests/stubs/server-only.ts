// `server-only` has no runtime behaviour to reproduce; it exists so Next can
// fail the build when a server module is pulled into a client bundle. Aliasing
// it to this empty module lets the server-side units be tested directly.
export {};
