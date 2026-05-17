declare module "bun:sqlite" {
  export type SqliteRunResult = {
    changes?: number
    lastInsertRowid?: number | bigint
  }

  export interface SqliteQuery<T = unknown> {
    run(...params: unknown[]): SqliteRunResult
    get(...params: unknown[]): T | null
    all(...params: unknown[]): T[]
  }

  export class Database {
    constructor(
      filename?: string,
      options?: {
        readonly?: boolean
        create?: boolean
        strict?: boolean
        safeIntegers?: boolean
      },
    )

    query<T = unknown>(sql: string): SqliteQuery<T>
    exec(sql: string): unknown
    close(throwOnError?: boolean): void
  }
}