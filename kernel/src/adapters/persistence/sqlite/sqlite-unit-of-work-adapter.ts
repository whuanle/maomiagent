import type { Database } from "bun:sqlite"
import type { UnitOfWorkPort } from "../../../core"
import { applySqliteKernelSchema } from "./schema"
import { runInSqliteTransaction } from "./sqlite-transaction"

export class SqliteUnitOfWorkAdapter implements UnitOfWorkPort {
  constructor(private readonly db: Database) {
    applySqliteKernelSchema(db)
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    return runInSqliteTransaction(this.db, work)
  }
}
