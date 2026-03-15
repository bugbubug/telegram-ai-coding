import { NotFoundError } from "../../core/errors.js";
import { TerminalSession, type TerminalSessionOptions } from "./session.js";

export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>();

  public create(options: TerminalSessionOptions): TerminalSession {
    const session = new TerminalSession(options);
    this.sessions.set(session.id, session);
    return session;
  }

  public get(id: string): TerminalSession {
    const session = this.sessions.get(id);
    if (!session) {
      throw new NotFoundError(`Terminal session "${id}" not found`);
    }

    return session;
  }

  public destroy(id: string): void {
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }

    session.dispose();
    this.sessions.delete(id);
  }

  public destroyAll(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
  }
}
