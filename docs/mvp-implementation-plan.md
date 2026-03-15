# Telegram AI Manager — MVP 全量实现计划

## 背景

项目脚手架已存在于 `/Users/bugbubug/Desktop/codex-project/telegram-ai-coding/`，包含完整目录结构、CLAUDE.md、AGENTS.md、subagents、commands 和配置文件——但零实现代码。全部 10 个 .ts 文件仅有注释占位。package.json 无任何依赖。本计划实现完整 MVP：一个通过 Telegram Bot UI 桥接本地 Codex CLI 和 Claude Code CLI 终端会话的系统。

规模： 41 个源码文件，1,900 行代码，外加 8 个测试文件（500 行）。

## 关键设计决策

全部使用相对路径导入（不使用 @core/* 别名）——别名保留在 tsconfig 中供 IDE 使用，实际 import 使用 ../../core/types.js 形式，避免 node dist/ 运行时路径解析失败
Redis 降级方案 —— TaskQueue 同时实现 RedisTaskQueue 和 InMemoryTaskQueue；启动时自动检测 Redis 可用性，不可用则降级为内存队列
node-pty 用于终端桥接（需要本地编译工具链）
函数优先于类，除非需要状态管理（EventBus、ServiceRegistry、各 Manager）
import 路径必须带 .js 扩展名（ESM "type": "module" 要求）

## 执行批次

### Batch 0：安装依赖

更新 package.json，安装全部依赖，创建 src/config/ 目录。

```bash
pnpm add grammy node-pty bullmq ioredis better-sqlite3 pino pino-pretty dotenv zod strip-ansi eventemitter3 proper-lockfile uuid
pnpm add -D typescript tsx vitest eslint @types/node @types/better-sqlite3 @types/proper-lockfile @types/uuid
mkdir -p src/config
```

同时在 .gitignore 中追加 data/（SQLite 数据库存储目录）。

### Batch 1：共享工具层（无内部依赖，可并行）

| 文件 | 实现要点 |
|------|----------|
| src/shared/constants.ts | TG_MAX_MESSAGE_LENGTH=4096、DEFAULT_TIMEOUT_MS=30_000、OUTPUT_DEBOUNCE_MS=500、PTY 默认列/行等常量 |
| src/shared/logger.ts | pino 单例 + createChildLogger(name) 工厂函数；直接读 process.env.LOG_LEVEL（因为 logger 需要在 config 校验前初始化，这是唯一的例外） |
| src/shared/utils.ts | stripAnsiCodes() 封装 strip-ansi、chunkMessage() 按换行切分+超长行硬切（上限 4096 字符）、withTimeout() 超时包装、generateId() uuid 封装、delay() |
| src/config/index.ts | zod schema 校验 .env.example 中所有字段；顶部 import 'dotenv/config'；导出冻结的 config 对象；校验失败时 fail fast |

### Batch 2：核心抽象层（顺序执行，依赖 Batch 1）

| 序号 | 文件 | 实现要点 |
|------|------|----------|
| 1 | src/core/errors.ts | AppError 基类（code、statusCode、isOperational、cause）+ 子类：ValidationError、NotFoundError、TimeoutError、AgentError、TerminalError、WorkspaceError、TaskError、ConfigError |
| 2 | src/core/types.ts | 核心契约：Plugin、PluginContext、AgentAdapter、AgentSpawnOptions、AgentSession、AgentSessionStatus、Workspace、Task、TaskStatus、EventMap（全部事件类型）、CommandHandler、ServiceNames 常量。保持传输层无关——不引入 grammY 类型 |
| 3 | src/core/event-bus.ts | 类封装 eventemitter3，提供泛型约束的 emit<K>、on<K>、once<K>、off<K>，类型约束到 EventMap 的 key |
| 4 | src/core/service-registry.ts | Map<string, unknown> + 带类型的 get<T>(name)、register()、has()、unregister() |
| 5 | src/core/plugin-manager.ts | 接收 Plugin[]，按 dependencies 拓扑排序（Kahn 算法），顺序 init()，逆序 destroy() |
| 6 | src/core/index.ts | 桶导出（barrel re-exports） |

### Batch 3：业务服务层（子批次可并行）

#### 3A：终端服务（顺序执行）

src/services/terminal/output-buffer.ts —— 500ms 防抖 + 清理 ANSI + 按 4096 字符分片；通过 onFlush 回调输出
src/services/terminal/session.ts —— 封装 node-pty.spawn()；将 data 事件接入 OutputBuffer，处理 exit 事件；提供 write()、kill()、dispose()
src/services/terminal/terminal-manager.ts —— Map<id, TerminalSession>；create/get/destroy/destroyAll

#### 3B：Agent 服务（顺序执行，依赖 3A）

src/services/agent/base-agent.ts —— 抽象类实现 AgentAdapter；公共 spawn() 逻辑：创建 TerminalSession → output 接入 EventBus → AbortSignal 接入 kill；抽象方法 buildArgs()
src/services/agent/codex-agent.ts —— 继承 BaseAgent；name='codex'；buildArgs() → ['--quiet', '--prompt', prompt, '--approval-mode', 'full-auto']
src/services/agent/claude-code-agent.ts —— 继承 BaseAgent；name='claude-code'；buildArgs() → ['--print', '--prompt', prompt]
src/services/agent/agent-registry.ts —— Map<name, AgentAdapter>；register/get/list/getDefault

#### 3C：工作区服务（与 3A/3B 可并行）

src/services/workspace/file-lock.ts —— 薄封装 proper-lockfile；acquireLock() 返回 release 函数；支持 AbortSignal
src/services/workspace/git-utils.ts —— createBranch()、checkoutBranch()、getCurrentBranch()、isGitRepo()，使用 child_process.execFile
src/services/workspace/workspace-manager.ts —— 在 WORKSPACE_BASE_DIR 下为每个任务创建隔离目录；可选 git 分支隔离；cleanup 时必须校验路径在 baseDir 下（安全防护）

#### 3D：任务服务（依赖 3A+3B+3C 全部完成）

src/services/task/task-store.ts —— better-sqlite3 WAL 模式；tasks 表；预编译语句 CRUD；DB 路径 data/tasks.db
src/services/task/task-queue.ts —— 接口 ITaskQueue + RedisTaskQueue（BullMQ）+ InMemoryTaskQueue 降级方案；工厂方法 TaskQueue.create(redisUrl) 尝试 Redis 连接，失败则降级
src/services/task/task-runner.ts —— 编排核心：出队 → 分配 workspace → 启动 agent → 通过 EventBus 推送输出 → 完成/失败处理；cancelTask() 取消任务；shutdown() 取消全部运行中任务；用 AbortController Map 跟踪每个任务

### Batch 4：Bot 层（顺序执行，依赖 Batch 3）

| 文件 | 实现要点 |
|------|----------|
| src/bot/middleware/auth.ts | grammY 中间件；检查 ctx.from.id 是否在 config.TELEGRAM_ALLOWED_USERS 白名单中；未授权则回复拒绝消息并终止 |
| src/bot/middleware/error-handler.ts | grammY ErrorHandler；pino 记录日志；AppError.isOperational 返回友好消息，否则返回通用错误提示 |
| src/bot/commands/start.ts | /start → 欢迎语 + 可用命令列表 |
| src/bot/commands/task.ts | /task <prompt> → 创建 Task 存入 store → 入队 → 回复带 inline keyboard（查看日志 / 取消）；订阅该任务的 task:output 事件实时推送输出 |
| src/bot/commands/status.ts | /status → 列出当前用户的运行中/排队中任务 |
| src/bot/commands/logs.ts | /logs [task_id] → 查看任务最近输出；无 ID 则显示最近任务 |
| src/bot/commands/cancel.ts | /cancel [task_id] → 通过 TaskRunner 取消任务 |
| src/bot/handlers/callback-query.ts | 处理 inline keyboard 回调：logs:<id>、cancel:<id> |
| src/bot/handlers/message.ts | 自由文本消息 → 视为默认 agent 的任务 prompt |
| src/bot/bot.ts | 工厂函数：创建 Bot 实例 → 注册 auth 中间件 + error handler + 全部命令 + handler → 返回 bot 实例 |

### Batch 5：插件层（仅依赖 Batch 2，可与 3/4 并行）

| 文件 | 实现要点 |
|------|----------|
| src/plugins/plugin-codex/commands.ts | 注册 /codex <prompt> 快捷命令 |
| src/plugins/plugin-codex/index.ts | 实现 Plugin 接口；init 时注册命令 |
| src/plugins/plugin-claude-code/commands.ts | 注册 /claude <prompt> 快捷命令 |
| src/plugins/plugin-claude-code/index.ts | 实现 Plugin 接口 |
| src/plugins/plugin-mcp/index.ts | 空壳插件，no-op init，为 MCP 桥接预留 |

### Batch 6：应用入口 + 脚本（依赖全部）

src/index.ts —— 启动编排：dotenv → Config → Logger → EventBus → ServiceRegistry → 注册全部服务 → PluginManager.loadAll → createBot → TaskRunner.start → bot.start → SIGTERM/SIGINT 优雅退出处理
scripts/setup.sh —— 检查 pnpm、检查 Redis（缺失则警告）、pnpm install、创建必要目录、复制 .env.example
scripts/dev.sh —— Redis 检查 + exec pnpm dev

## 测试计划（按优先级）

| 优先级 | 文件 | 测试内容 |
|--------|------|----------|
| P1 | tests/shared/utils.test.ts | chunkMessage 边界（空字符串、恰好 4096、单行超长、多行拆分）、stripAnsiCodes、withTimeout |
| P1 | tests/core/event-bus.test.ts | 类型安全的 emit/on/off、once、listener 清理、listener 计数 |
| P1 | tests/core/service-registry.test.ts | register、get、重复注册报错、缺失服务报错、unregister |
| P2 | tests/services/terminal/output-buffer.test.ts | 防抖时序（vitest fake timers）、flush、ANSI 清理、分片 |
| P2 | tests/services/task/task-store.test.ts | 用 :memory: SQLite 做 CRUD、状态更新、按用户查询 |
| P2 | tests/core/plugin-manager.test.ts | 拓扑排序、循环依赖检测、顺序 init/逆序 destroy |
| P3 | tests/bot/middleware/auth.test.ts | mock grammY context、允许/拒绝 |
| P3 | tests/services/task/task-runner.test.ts | mock agent + workspace、验证完整生命周期事件 |

## 验证步骤

每个 Batch 完成后：pnpm typecheck —— 零错误
测试通过：pnpm test —— 全部绿灯
冒烟测试：pnpm dev 配合真实 bot token → /start 有响应 → /task echo hello 创建任务并推送输出
Redis 离线测试：不启动 Redis → 验证内存队列降级警告 + 任务仍能正常处理
生产构建：pnpm build && node dist/index.js —— 确认编译产物可运行

## 风险与应对

| 风险 | 应对方案 |
|------|----------|
| node-pty 原生编译失败 | 在 setup.sh 中检查编译工具链；备选方案 @homebridge/node-pty-prebuilt-multiarch |
| Codex/Claude CLI 不同版本的 flag 差异 | CLI 参数通过环境变量可配置；添加 isAvailable() 检查 |
| Telegram 速率限制（30 msg/sec） | OutputBuffer 500ms 防抖；Bot 层增加 per-chat 限流 |
| 路径别名导致生产构建失败 | 源码全部使用相对路径导入 |
| EventBus 监听器内存泄漏 | 设置最大监听器数 + 超时清理（单任务订阅最长 1 小时） |
