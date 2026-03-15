import fs from "node:fs";
import path from "node:path";

type PersistedMessageHistory = Record<string, number[]>;

export class MessageHistoryStore {
  private readonly messagesByChat = new Map<number, number[]>();

  public constructor(
    private readonly maxMessagesPerChat = 200,
    private readonly filePath = path.resolve(process.cwd(), "data/message-history.json"),
  ) {
    this.load();
  }

  public track(chatId: number, messageId: number): void {
    const messages = this.messagesByChat.get(chatId) ?? [];
    messages.push(messageId);
    if (messages.length > this.maxMessagesPerChat) {
      messages.splice(0, messages.length - this.maxMessagesPerChat);
    }
    this.messagesByChat.set(chatId, messages);
    this.persist();
  }

  public list(chatId: number): number[] {
    return [...(this.messagesByChat.get(chatId) ?? [])];
  }

  public clear(chatId: number): void {
    this.messagesByChat.delete(chatId);
    this.persist();
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) {
      return;
    }

    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedMessageHistory;
      for (const [chatId, messageIds] of Object.entries(parsed)) {
        if (!Array.isArray(messageIds)) {
          continue;
        }

        const normalizedIds = messageIds.filter((messageId): messageId is number =>
          Number.isInteger(messageId),
        );
        if (normalizedIds.length > 0) {
          this.messagesByChat.set(Number(chatId), normalizedIds);
        }
      }
    } catch {
      this.messagesByChat.clear();
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const serialized: PersistedMessageHistory = {};
    for (const [chatId, messageIds] of this.messagesByChat.entries()) {
      serialized[String(chatId)] = [...messageIds];
    }

    fs.writeFileSync(this.filePath, JSON.stringify(serialized), "utf8");
  }
}
