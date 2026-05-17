import type { Database } from "bun:sqlite"

type SqliteTransactionState = {
  depth: number
  nextSavepointId: number
}

const SQLITE_TRANSACTION_STATES = new WeakMap<Database, SqliteTransactionState>()

function getSqliteTransactionState(db: Database): SqliteTransactionState {
  const existing = SQLITE_TRANSACTION_STATES.get(db)
  if (existing) {
    return existing
  }

  const created: SqliteTransactionState = {
    depth: 0,
    nextSavepointId: 1,
  }
  SQLITE_TRANSACTION_STATES.set(db, created)
  return created
}

export async function runInSqliteTransaction<T>(
  db: Database,
  work: () => Promise<T> | T,
): Promise<T> {
  const state = getSqliteTransactionState(db)
  const isRootTransaction = state.depth === 0
  const savepointName = isRootTransaction
    ? undefined
    : `maomi_kernel_sp_${state.nextSavepointId++}`

  if (isRootTransaction) {
    db.exec("BEGIN")
  } else {
    db.exec(`SAVEPOINT ${savepointName}`)
  }

  state.depth += 1

  try {
    const result = await work()

    if (isRootTransaction) {
      db.exec("COMMIT")
    } else {
      db.exec(`RELEASE SAVEPOINT ${savepointName}`)
    }

    return result
  } catch (error) {
    if (isRootTransaction) {
      db.exec("ROLLBACK")
    } else {
      db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`)
      db.exec(`RELEASE SAVEPOINT ${savepointName}`)
    }

    throw error
  } finally {
    state.depth -= 1
  }
}
