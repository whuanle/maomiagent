export class ConversationSessionMutationQueues {
  private readonly queues = new Map<string, Promise<void>>();

  async run<TValue>(
    sessionId: string,
    work: () => Promise<TValue>,
  ): Promise<TValue> {
    const key = sessionId.trim();
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.then(work, work);
    const settled = next.then(() => undefined, () => undefined);
    this.queues.set(key, settled);

    try {
      return await next;
    } finally {
      if (this.queues.get(key) === settled) {
        this.queues.delete(key);
      }
    }
  }
}
