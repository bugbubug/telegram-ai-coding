export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public override readonly cause?: unknown;

  public constructor(
    message: string,
    options: {
      code: string;
      statusCode?: number;
      isOperational?: boolean;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.isOperational = options.isOperational ?? true;
    this.cause = options.cause;
  }
}

const createErrorClass =
  (code: string, statusCode: number) =>
  class extends AppError {
    public constructor(message: string, cause?: unknown) {
      super(message, { code, statusCode, cause });
    }
  };

export class ValidationError extends createErrorClass("VALIDATION_ERROR", 400) {}
export class NotFoundError extends createErrorClass("NOT_FOUND", 404) {}
export class TimeoutError extends createErrorClass("TIMEOUT", 408) {}
export class AgentError extends createErrorClass("AGENT_ERROR", 500) {}
export class TerminalError extends createErrorClass("TERMINAL_ERROR", 500) {}
export class WorkspaceError extends createErrorClass("WORKSPACE_ERROR", 500) {}
export class TaskError extends createErrorClass("TASK_ERROR", 500) {}
export class ConfigError extends createErrorClass("CONFIG_ERROR", 500) {}
