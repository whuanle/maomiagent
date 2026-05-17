export interface ConversationRuntimePort<
  TSessionSummary,
  TSessionDetail,
  TStartTurnInput,
  TRunOutput,
  TAnswerInteractionInput = {
    interactionId: string;
    response: unknown;
  },
  TRejectInteractionInput = {
    interactionId: string;
    reason?: string;
  },
> {
  archiveSession(item: TSessionSummary): Promise<void>;
  startUserTurn(input: TStartTurnInput): Promise<TRunOutput>;
  answerInteraction(input: TAnswerInteractionInput): Promise<TRunOutput>;
  rejectInteraction(input: TRejectInteractionInput): Promise<TRunOutput>;
  loadSessionDetail(item: TSessionSummary): Promise<TSessionDetail>;
  dispose(): void;
}

export interface ConversationRuntimeFactoryPort<TCreateInput, TRuntime> {
  createConversationRuntime(input: TCreateInput): TRuntime;
}