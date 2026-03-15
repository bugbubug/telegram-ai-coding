import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";
const isPretty = process.env.NODE_ENV !== "production";

export const logger = pino({
  level,
  transport: isPretty
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
        },
      }
    : undefined,
});

export const createChildLogger = (name: string) => logger.child({ module: name });
