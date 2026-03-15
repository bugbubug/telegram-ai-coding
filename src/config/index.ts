import "dotenv/config";

import path from "node:path";
import { z } from "zod";

const parseCsv = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const parseArgList = (value: string): string[] =>
  value
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_ALLOWED_USERS: z.string().transform((value, ctx) => {
    const ids = parseCsv(value).map((entry) => Number(entry));
    if (ids.some((id) => Number.isNaN(id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TELEGRAM_ALLOWED_USERS must be a comma-separated list of numbers",
      });
      return z.NEVER;
    }

    return ids;
  }),
  CODEX_CLI_PATH: z.string().min(1),
  CODEX_CLI_ARGS: z.string().default("").transform(parseArgList),
  CLAUDE_CODE_CLI_PATH: z.string().min(1),
  CLAUDE_CODE_CLI_ARGS: z.string().default("").transform(parseArgList),
  WORKSPACE_BASE_DIR: z.string().min(1).transform((value) => path.resolve(value)),
  DEFAULT_WORKSPACE_SOURCE_PATH: z.string().min(1).transform((value) => path.resolve(value)),
  GIT_BRANCH_ISOLATION: z
    .enum(["true", "false"])
    .transform((value) => value === "true"),
  REDIS_URL: z.string().min(1),
  TASK_CONCURRENCY: z.coerce.number().int().positive(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export type AppConfig = Readonly<z.infer<typeof schema>>;

export const config: AppConfig = Object.freeze(parsed.data);
