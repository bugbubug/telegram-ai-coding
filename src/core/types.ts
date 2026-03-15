import type { AppConfig } from "../config/index.js";

export type TaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentSessionStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

export interface Workspace {
  taskId: string;
  sourcePath: string;
  path: string;
  branchName?: string;
}

export interface Task {
  id: string;
  userId: number;
  agentName: string;
  prompt: string;
  status: TaskStatus;
  workspaceSourcePath: string;
  workspacePath: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLogEntry {
  id: string;
  taskId: string;
  seq: number;
  content: string;
  createdAt: string;
}

export interface AgentSpawnOptions {
  taskId: string;
  prompt: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  abortSignal?: AbortSignal;
}

export interface AgentCompletionResult {
  exitCode: number | null;
  signal: number | null;
  cancelled: boolean;
  error?: Error;
}

export interface AgentSession {
  id: string;
  status: AgentSessionStatus;
  completion: Promise<AgentCompletionResult>;
  write(input: string): void;
  kill(): void;
  dispose(): void;
}

export interface AgentAdapter {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  spawn(options: AgentSpawnOptions): Promise<AgentSession>;
}

export interface LoggerLike {
  debug(bindings: object | string, message?: string): void;
  info(bindings: object | string, message?: string): void;
  warn(bindings: object | string, message?: string): void;
  error(bindings: object | string, message?: string): void;
}

export interface AgentCommandDefinition {
  name: string;
  description: string;
  agentName: string;
}

export interface CommandRegistry {
  registerAgentCommand(command: AgentCommandDefinition): void;
  listAgentCommands(): AgentCommandDefinition[];
}

export interface EventMap {
  "task:queued": { task: Task };
  "task:started": { task: Task };
  "task:output": { taskId: string; chunk: string };
  "task:completed": { task: Task };
  "task:failed": { task: Task; error: string };
  "task:cancelled": { task: Task };
  "queue:degraded": { reason: string };
  "plugin:registered": { name: string };
}

export interface ServiceRegistryLike {
  register<T>(name: string, value: T): void;
  get<T>(name: string): T;
  has(name: string): boolean;
  unregister(name: string): void;
}

export interface PluginContext {
  eventBus: EventBusLike;
  services: ServiceRegistryLike;
  commandRegistry: CommandRegistry;
  logger: LoggerLike;
  config: AppConfig;
}

export interface Plugin {
  name: string;
  dependencies?: string[];
  init(context: PluginContext): Promise<void> | void;
  destroy?(): Promise<void> | void;
}

export interface EventBusLike {
  emit<K extends keyof EventMap>(eventName: K, payload: EventMap[K]): void;
  on<K extends keyof EventMap>(eventName: K, listener: EventListener<K>): () => void;
  once<K extends keyof EventMap>(eventName: K, listener: EventListener<K>): () => void;
  off<K extends keyof EventMap>(eventName: K, listener: EventListener<K>): void;
}

export type EventListener<K extends keyof EventMap> = (payload: EventMap[K]) => void;

export const ServiceNames = {
  agentRegistry: "agentRegistry",
  commandRegistry: "commandRegistry",
  config: "config",
  eventBus: "eventBus",
  logger: "logger",
  pluginManager: "pluginManager",
  taskQueue: "taskQueue",
  taskRunner: "taskRunner",
  taskStore: "taskStore",
  terminalManager: "terminalManager",
  workspaceManager: "workspaceManager",
} as const;
