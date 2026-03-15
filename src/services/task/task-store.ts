import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { DEFAULT_TASK_LOG_LIMIT } from "../../shared/constants.js";
import { generateId } from "../../shared/utils.js";
import { NotFoundError } from "../../core/errors.js";
import type { Task, TaskLogEntry, TaskStatus } from "../../core/types.js";

interface TaskRow {
  id: string;
  user_id: number;
  agent_name: string;
  prompt: string;
  status: TaskStatus;
  workspace_source_path: string;
  workspace_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskLogRow {
  id: string;
  task_id: string;
  seq: number;
  content: string;
  created_at: string;
}

export class TaskStore {
  private readonly db: Database.Database;
  private readonly insertTask;
  private readonly getTaskStatement;
  private readonly updateTaskStatusStatement;
  private readonly updateWorkspacePathStatement;
  private readonly listTasksByUserStatement;
  private readonly listTasksByStatusesStatement;
  private readonly latestTaskByUserStatement;
  private readonly nextLogSeqStatement;
  private readonly insertLogStatement;
  private readonly getLogsStatement;

  public constructor(dbPath = path.resolve("data/tasks.db")) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        agent_name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        workspace_source_path TEXT NOT NULL,
        workspace_path TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS task_logs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id)
      );
    `);

    this.insertTask = this.db.prepare(`
      INSERT INTO tasks (
        id, user_id, agent_name, prompt, status, workspace_source_path,
        workspace_path, error_message, created_at, updated_at
      )
      VALUES (
        @id, @user_id, @agent_name, @prompt, @status, @workspace_source_path,
        @workspace_path, @error_message, @created_at, @updated_at
      )
    `);
    this.getTaskStatement = this.db.prepare("SELECT * FROM tasks WHERE id = ?");
    this.updateTaskStatusStatement = this.db.prepare(`
      UPDATE tasks
      SET status = @status, error_message = @error_message, updated_at = @updated_at
      WHERE id = @id
    `);
    this.updateWorkspacePathStatement = this.db.prepare(`
      UPDATE tasks
      SET workspace_path = @workspace_path, updated_at = @updated_at
      WHERE id = @id
    `);
    this.listTasksByUserStatement = this.db.prepare(`
      SELECT * FROM tasks
      WHERE user_id = ?
      ORDER BY created_at DESC
    `);
    this.listTasksByStatusesStatement = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status IN (SELECT value FROM json_each(?))
      ORDER BY created_at DESC
    `);
    this.latestTaskByUserStatement = this.db.prepare(`
      SELECT * FROM tasks
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    this.nextLogSeqStatement = this.db.prepare(`
      SELECT COALESCE(MAX(seq), 0) + 1 AS seq
      FROM task_logs
      WHERE task_id = ?
    `);
    this.insertLogStatement = this.db.prepare(`
      INSERT INTO task_logs (id, task_id, seq, content, created_at)
      VALUES (@id, @task_id, @seq, @content, @created_at)
    `);
    this.getLogsStatement = this.db.prepare(`
      SELECT * FROM task_logs
      WHERE task_id = ?
      ORDER BY seq DESC
      LIMIT ?
    `);
  }

  public createTask(input: {
    userId: number;
    agentName: string;
    prompt: string;
    workspaceSourcePath: string;
  }): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: generateId(),
      userId: input.userId,
      agentName: input.agentName,
      prompt: input.prompt,
      status: "queued",
      workspaceSourcePath: input.workspaceSourcePath,
      workspacePath: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };

    this.insertTask.run(this.serializeTask(task));
    return task;
  }

  public getTask(id: string): Task {
    const row = this.getTaskStatement.get(id) as TaskRow | undefined;
    if (!row) {
      throw new NotFoundError(`Task "${id}" not found`);
    }

    return this.deserializeTask(row);
  }

  public updateTaskStatus(id: string, status: TaskStatus, errorMessage?: string | null): Task {
    const updatedAt = new Date().toISOString();
    this.updateTaskStatusStatement.run({
      id,
      status,
      error_message: errorMessage ?? null,
      updated_at: updatedAt,
    });
    return this.getTask(id);
  }

  public updateWorkspacePath(id: string, workspacePath: string): Task {
    this.updateWorkspacePathStatement.run({
      id,
      workspace_path: workspacePath,
      updated_at: new Date().toISOString(),
    });
    return this.getTask(id);
  }

  public listTasksByUser(userId: number, statuses?: TaskStatus[]): Task[] {
    const rows = this.listTasksByUserStatement.all(userId) as TaskRow[];
    return rows
      .map((row) => this.deserializeTask(row))
      .filter((task) => !statuses || statuses.includes(task.status));
  }

  public listTasksByStatuses(statuses: TaskStatus[]): Task[] {
    const placeholders = statuses.map(() => "?").join(", ");
    const statement = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status IN (${placeholders})
      ORDER BY created_at DESC
    `);
    const rows = statement.all(...statuses) as TaskRow[];
    return rows.map((row) => this.deserializeTask(row));
  }

  public getLatestTaskForUser(userId: number): Task | null {
    const row = this.latestTaskByUserStatement.get(userId) as TaskRow | undefined;
    return row ? this.deserializeTask(row) : null;
  }

  public appendLog(taskId: string, content: string): TaskLogEntry {
    const seqResult = this.nextLogSeqStatement.get(taskId) as { seq: number };
    const entry: TaskLogEntry = {
      id: generateId(),
      taskId,
      seq: seqResult.seq,
      content,
      createdAt: new Date().toISOString(),
    };
    this.insertLogStatement.run({
      id: entry.id,
      task_id: entry.taskId,
      seq: entry.seq,
      content: entry.content,
      created_at: entry.createdAt,
    });
    return entry;
  }

  public getLogs(taskId: string, limit = DEFAULT_TASK_LOG_LIMIT): TaskLogEntry[] {
    const rows = this.getLogsStatement.all(taskId, limit) as TaskLogRow[];
    return rows.reverse().map((row) => ({
      id: row.id,
      taskId: row.task_id,
      seq: row.seq,
      content: row.content,
      createdAt: row.created_at,
    }));
  }

  public close(): void {
    this.db.close();
  }

  private serializeTask(task: Task): Record<string, string | number | null> {
    return {
      id: task.id,
      user_id: task.userId,
      agent_name: task.agentName,
      prompt: task.prompt,
      status: task.status,
      workspace_source_path: task.workspaceSourcePath,
      workspace_path: task.workspacePath,
      error_message: task.errorMessage ?? null,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    };
  }

  private deserializeTask(row: TaskRow): Task {
    return {
      id: row.id,
      userId: row.user_id,
      agentName: row.agent_name,
      prompt: row.prompt,
      status: row.status,
      workspaceSourcePath: row.workspace_source_path,
      workspacePath: row.workspace_path,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
