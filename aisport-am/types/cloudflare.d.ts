// The Cloudflare runtime types are not checked into the repo: the wrangler
// config is generated during the build, so `wrangler types` cannot be run
// ahead of a type check. These are the pieces of the runtime this codebase
// actually touches, declared by hand rather than pulled in through
// `@cloudflare/workers-types`' global reference - that package replaces the
// DOM's Response/fetch types, which then break the browser-side components
// that share this tsconfig.
//
// The point of the file is to let `tsc --noEmit` run over app/, lib/ and
// components/ in CI, where it catches the class of mistake that once shipped
// a crashing /opinions/ page: an identifier that does not exist.

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

interface Fetcher {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

declare module "cloudflare:workers" {
  export const env: { DB?: D1Database } & Record<string, unknown>;
}
