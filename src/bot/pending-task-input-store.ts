export interface PendingTaskInput {
  agentName: string;
  createdAt: number;
}

export class PendingTaskInputStore {
  private readonly pendingInputs = new Map<number, PendingTaskInput>();

  public set(userId: number, agentName: string): void {
    this.pendingInputs.set(userId, {
      agentName,
      createdAt: Date.now(),
    });
  }

  public get(userId: number): PendingTaskInput | null {
    return this.pendingInputs.get(userId) ?? null;
  }

  public consume(userId: number): PendingTaskInput | null {
    const pendingInput = this.get(userId);
    if (pendingInput) {
      this.pendingInputs.delete(userId);
    }

    return pendingInput;
  }

  public clear(userId: number): void {
    this.pendingInputs.delete(userId);
  }
}
