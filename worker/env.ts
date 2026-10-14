// Minimal Cloudflare D1 types, so the Worker has no type dependencies.
// (Run `npx wrangler types` if you want the full generated types instead.)

export interface D1Meta {
  changes: number;
  last_row_id: number;
  rows_read?: number;
  rows_written?: number;
}

export interface D1Result<T = any> {
  results: T[];
  success: boolean;
  meta: D1Meta;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface Env {
  DB: D1Database;
}
