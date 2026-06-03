import { AsyncLocalStorage } from "node:async_hooks"
import type { Database } from "bun:sqlite"

type SqliteTransactionState = {
  depth: number
  nextSavepointId: number
  queue: Promise<void>
  ownerToken?: symbol
}

const SQLITE_TRANSACTION_STATES = new WeakMap<Database, SqliteTransactionState>()
const SQLITE_TRANSACTION_OWNER = new AsyncLocalStorage<symbol>()

function getSqliteTransactionState(db: Database): SqliteTransactionState {
  const existing = SQLITE_TRANSACTION_STATES.get(db)
  if (existing) {
    return existing
  }

  const created: SqliteTransactionState = {
    depth: 0,
    nextSavepointId: 1,
    queue: Promise.resolve(),
  }
  SQLITE_TRANSACTION_STATES.set(db, created)
  return created
}

async function executeSqliteTransaction<T>(
  db: Database,
  state: SqliteTransactionState,
  work: () => Promise<T> | T,
): Promise<T> {
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

export async function runInSqliteTransaction<T>(
  db: Database,
  work: () => Promise<T> | T,
): Promise<T> {
  const state = getSqliteTransactionState(db)
  const activeOwnerToken = SQLITE_TRANSACTION_OWNER.getStore()
  const isNestedTransaction = state.depth > 0 && activeOwnerToken === state.ownerToken

  if (isNestedTransaction) {
    return executeSqliteTransaction(db, state, work)
  }

  const previous = state.queue
  let releaseQueue: (() => void) | undefined
  const current = new Promise<void>((resolve) => {
    releaseQueue = resolve
  })
  state.queue = previous.then(() => current, () => current)

  await previous

  const ownerToken = Symbol("sqlite-transaction-owner")
  state.ownerToken = ownerToken

  try {
    return await SQLITE_TRANSACTION_OWNER.run(ownerToken, () =>
      executeSqliteTransaction(db, state, work))
  } finally {
    if (state.ownerToken === ownerToken) {
      state.ownerToken = undefined
    }
    releaseQueue?.()
  }
}
