import { config } from "./config/index.js";
import { EventBus, PluginManager, ServiceNames, ServiceRegistry } from "./core/index.js";
import { createChildLogger, logger } from "./shared/logger.js";
import { createBot } from "./bot/bot.js";
import { InMemoryCommandRegistry } from "./bot/command-registry.js";
import { MessageHistoryStore } from "./bot/message-history-store.js";
import { PendingTaskInputStore } from "./bot/pending-task-input-store.js";
import { RepositorySelectionStore } from "./bot/repository-selection-store.js";
import { createRuntimeHealthServer } from "./runtime/health-server.js";
import { AgentRegistry } from "./services/agent/agent-registry.js";
import { ClaudeCodeAgent } from "./services/agent/claude-code-agent.js";
import { CodexAgent } from "./services/agent/codex-agent.js";
import { TaskQueue } from "./services/task/task-queue.js";
import { TaskRunner } from "./services/task/task-runner.js";
import { TaskStore } from "./services/task/task-store.js";
import { TerminalManager } from "./services/terminal/terminal-manager.js";
import { RepositoryCatalog } from "./services/workspace/repository-catalog.js";
import { WorkspaceManager } from "./services/workspace/workspace-manager.js";
import pluginClaudeCode from "./plugins/plugin-claude-code/index.js";
import pluginCodex from "./plugins/plugin-codex/index.js";
import pluginMcp from "./plugins/plugin-mcp/index.js";

const bootstrap = async (): Promise<void> => {
  const appLogger = createChildLogger("app");
  const eventBus = new EventBus();
  const services = new ServiceRegistry();
  const commandRegistry = new InMemoryCommandRegistry();
  const messageHistoryStore = new MessageHistoryStore();
  const pendingTaskInputStore = new PendingTaskInputStore();
  const repositorySelectionStore = new RepositorySelectionStore();
  const terminalManager = new TerminalManager();
  const agentRegistry = new AgentRegistry();
  const runtimeHealthServer = await createRuntimeHealthServer({
    host: config.RUNTIME_HEALTH_HOST,
    port: config.RUNTIME_HEALTH_PORT,
    logger: appLogger,
  });
  const repositoryCatalog = new RepositoryCatalog(config.DEFAULT_WORKSPACE_SOURCE_PATH);
  const workspaceManager = new WorkspaceManager(
    config.WORKSPACE_BASE_DIR,
    config.GIT_BRANCH_ISOLATION,
  );
  const taskStore = new TaskStore();
  const taskQueue = await TaskQueue.create(
    config.REDIS_URL,
    config.TASK_CONCURRENCY,
    eventBus,
    appLogger,
  );
  const taskRunner = new TaskRunner(
    taskStore,
    taskQueue,
    workspaceManager,
    agentRegistry,
    eventBus,
    appLogger,
  );
  const pluginManager = new PluginManager([pluginCodex, pluginClaudeCode, pluginMcp]);

  services.register(ServiceNames.config, config);
  services.register(ServiceNames.logger, logger);
  services.register(ServiceNames.eventBus, eventBus);
  services.register(ServiceNames.commandRegistry, commandRegistry);
  services.register(ServiceNames.messageHistoryStore, messageHistoryStore);
  services.register(ServiceNames.pendingTaskInputStore, pendingTaskInputStore);
  services.register(ServiceNames.repositorySelectionStore, repositorySelectionStore);
  services.register(ServiceNames.terminalManager, terminalManager);
  services.register(ServiceNames.agentRegistry, agentRegistry);
  services.register(ServiceNames.repositoryCatalog, repositoryCatalog);
  services.register(ServiceNames.workspaceManager, workspaceManager);
  services.register(ServiceNames.taskStore, taskStore);
  services.register(ServiceNames.taskQueue, taskQueue);
  services.register(ServiceNames.taskRunner, taskRunner);
  services.register(ServiceNames.pluginManager, pluginManager);

  agentRegistry.register(
    new CodexAgent(
      terminalManager,
      eventBus,
      config.CODEX_CLI_PATH,
      config.CODEX_CLI_ARGS,
    ),
    true,
  );
  agentRegistry.register(
    new ClaudeCodeAgent(
      terminalManager,
      eventBus,
      config.CLAUDE_CODE_CLI_PATH,
      config.CLAUDE_CODE_CLI_ARGS,
    ),
  );

  await pluginManager.loadAll({
    eventBus,
    services,
    commandRegistry,
    logger: appLogger,
    config,
  });

  const bot = createBot({
    config,
    logger: appLogger,
    eventBus,
    taskStore,
    taskQueue,
    taskRunner,
    agentRegistry,
    commandRegistry,
    messageHistoryStore,
    pendingTaskInputStore,
    repositoryCatalog,
    repositorySelectionStore,
  });

  const shutdown = async (signal: string): Promise<void> => {
    appLogger.info({ signal }, "Shutting down");
    runtimeHealthServer.setStopping();
    void bot.stop();
    await taskRunner.shutdown();
    terminalManager.destroyAll();
    taskStore.close();
    await pluginManager.destroyAll();
    await runtimeHealthServer.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await taskRunner.start();
  await bot.start({
    onStart: () => {
      runtimeHealthServer.setReady();
      appLogger.info("Telegram AI Manager started");
    },
  });
};

void bootstrap();
