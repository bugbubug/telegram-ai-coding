import http, { type IncomingMessage, type ServerResponse } from "node:http";

import type { LoggerLike } from "../core/types.js";

export interface RuntimeHealthServerOptions {
  host: string;
  port: number;
  logger: LoggerLike;
}

interface HealthPayload {
  status: "starting" | "ready" | "stopping";
  pid: number;
  startedAt: string;
}

export interface RuntimeHealthServer {
  readonly port: number;
  readonly host: string;
  setReady(): void;
  setStopping(): void;
  close(): Promise<void>;
}

const createPayload = (status: HealthPayload["status"], startedAt: string): HealthPayload => ({
  status,
  pid: process.pid,
  startedAt,
});

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  payload: HealthPayload,
): void => {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
};

export const createRuntimeHealthServer = async (
  options: RuntimeHealthServerOptions,
): Promise<RuntimeHealthServer> => {
  const startedAt = new Date().toISOString();
  let state: HealthPayload["status"] = "starting";

  const server = http.createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.url !== "/healthz") {
      response.statusCode = 404;
      response.end("not found");
      return;
    }

    const payload = createPayload(state, startedAt);
    writeJson(response, state === "ready" ? 200 : 503, payload);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;

  options.logger.info(
    {
      host: options.host,
      port,
    },
    "Runtime health server listening",
  );

  return {
    host: options.host,
    port,
    setReady(): void {
      state = "ready";
    },
    setStopping(): void {
      state = "stopping";
    },
    close(): Promise<void> {
      state = "stopping";
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
};
