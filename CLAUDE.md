# Telegram AI Manager

## 项目概述

Telegram Bot UI 统一管理本机 Codex CLI 和 Claude Code CLI 终端会话。
采用服务解耦 + 插件化架构，为后续多 Agent 编排预留扩展点。
当前 MVP 已实现仓库选择、任务排队、历史日志持久化、`git worktree` 隔离和 Telegram 命令菜单注册。
本地运行已切换到受管单实例模式，默认使用 `.runtime/telegram-ai-manager/local/` 存放 PID、日志和状态。

## 技术栈

- Runtime: Node.js 20+ / TypeScript 5.5+ (strict mode)
- Telegram: grammY
- 终端桥接: node-pty（失败时自动回退 `child_process.spawn`）
- 任务队列: BullMQ + Redis（失败时降级为 InMemory）
- 存储: SQLite (better-sqlite3)
- 日志: pino
- 测试: vitest
- 包管理: pnpm

## 关键架构决策

- 所有模块通过 `core/service-registry.ts` 做依赖注入，禁止跨模块直接 import 实现
- 插件通过 `PluginContext` + `commandRegistry` 注册命令，不直接耦合 Telegram `Bot`
- Agent 适配器通过 `AgentAdapter` 接口编程，新增 Agent 只需实现接口
- 事件驱动：所有跨模块通信走 `EventBus`，类型约束 `EventMap`
- 每个任务分配隔离 workspace；Git 仓库优先用 `git worktree`，非 Git 目录才复制
- `/repos` 只列出 `DEFAULT_WORKSPACE_SOURCE_PATH` 下可识别的 Git 仓库
- 用户通常先通过 `/repos` 选择仓库，再创建 `/task`、`/codex`、`/claude` 任务；若未选择仓库，则回退到 `DEFAULT_WORKSPACE_SOURCE_PATH`
- `/task`、`/codex`、`/claude` 支持 `workspace::prompt` 显式覆盖目标路径
- 同一 task id 重试前必须先清理残留 worktree 注册；任务失败、取消和重启恢复后必须回收 workspace；成功任务要保留 worktree 供后续提交
- 任务发布采用分步流：`/submit` 只提交任务分支，`/merge` 只合并到本地 `main`，`/push` 只推送 `origin/main`；不做自动 rebase 或强制 merge
- `/push` 成功后必须自动清理对应任务的本地 worktree，但默认保留任务分支
- `task_logs` 持久化任务输出，`/logs` 读取历史日志而不是进程内缓存
- `WORKSPACE_BASE_DIR` 必须位于源仓库目录外部，避免自我复制和路径污染
- 本地 runtime 默认通过 `RUNTIME_HEALTH_HOST` / `RUNTIME_HEALTH_PORT` 提供 readiness 检查
- `pnpm dev` 必须清理旧实例，避免 `getUpdates 409` 和僵尸任务污染

## Bot 交互面

- 内置命令：`/start`、`/repos`、`/task`、`/status`、`/logs`、`/cancel`、`/submit`、`/merge`、`/push`、`/clear`、`/reset`
- 插件命令：`/codex`、`/claude`
- 命令菜单由 `src/bot/bot.ts` 在启动时通过 `setMyCommands()` 注册
- `/task`、`/codex`、`/claude` 的命令格式均支持 `[workspace::]prompt`
- `/status` 需要展示当前已选仓库、活跃任务、worktree 路径、最近错误
- Codex 任务默认不向 Telegram 流式推送中间过程，只在完成时返回最终结果；成功时还要附带 `task_id`、分支名、worktree 路径和 `/submit`、`/merge`、`/push` 提示，提取失败时明确引导使用 `/logs`
- `/submit`、`/merge`、`/push` 的默认目标是当前用户最近一条可执行任务；`/submit` 允许追加 commit message，省略时默认使用 `chore(task): submit <task_id>`
- `/submit`、`/merge`、`/push` 校验失败时必须明确返回阻断原因；`/push` 成功后只清理本地 worktree，不自动删除任务分支
- `/clear`、`/clear all`、`/reset` 会清理消息记录、仓库选择和任务上下文，修改这些行为时必须补测试
- 运行脚本：`pnpm dev`（受管后台启动）、`pnpm dev:watch`（裸 watch 调试）、`pnpm stop`、`pnpm status`

## 目录结构

```
src/
├── core/          # 抽象层：EventBus, PluginManager, ServiceRegistry, types
├── services/      # 业务服务：terminal/, agent/, workspace/, task/
├── bot/           # Telegram Bot：commands/, handlers/, middleware/
├── plugins/       # 自包含插件：plugin-codex/, plugin-claude-code/, plugin-mcp/
└── shared/        # 通用工具：logger, constants, utils
```

## 编码规范

- 函数优先于类，除非需要状态管理
- 所有公开 API 使用 JSDoc 注释
- 错误处理使用自定义 AppError 类型，不抛裸 Error
- 异步操作必须有超时（默认 30s）和取消机制
- 所有 CLI 子进程输出必须清理 ANSI 转义符
- 文件路径一律使用 path.join()，不硬编码分隔符
- ESM import 必须显式带 `.js` 扩展
- 修改 Bot 命令、提示文案、仓库选择或任务生命周期时，同步更新文档和命令菜单描述
- 修改启动/停止方式、runtime 端口、PID 或日志路径时，同步更新文档和脚本说明

## 测试要求

- 单元测试：`pnpm test`
- 测试框架：vitest
- 覆盖率目标：核心模块 > 80%
- 测试文件命名：`*.test.ts`，与源文件同目录或 `tests/` 镜像目录
- 新增逻辑文件必须补对应测试；文档变更不要求新增测试，但若行为描述变化，相关行为测试必须同步存在

## 工作流约束

1. 用户先选仓库：`RepositoryCatalog` 扫描 `DEFAULT_WORKSPACE_SOURCE_PATH`
2. `RepositorySelectionStore` 记录 `userId -> repoPath`
3. `/repos` 仅返回 Git 仓库；未选择仓库时，任务默认落到 `DEFAULT_WORKSPACE_SOURCE_PATH`
4. 创建任务时，`TaskRunner` 调用 `WorkspaceManager.prepareWorkspace()`
5. Git 仓库走 `git worktree add`，worktree 根位于 `WORKSPACE_BASE_DIR`
6. 非 Git 目标路径回退为目录复制
7. Agent 在隔离目录运行，输出写入 `task_logs`
8. 成功任务保留 worktree，并向用户返回 `task_id`、分支名、worktree 路径以及 `/submit <task_id>`、`/merge <task_id>`、`/push <task_id>` 下一步提示
9. Codex 任务只在完成时回传最终结果；若未提取到最终结果，必须引导用户使用 `/logs <task_id>` 查看原始日志
10. `/merge` 固定执行 `git merge --ff-only task/<task_id>`；主仓库不在 `main`、有未提交改动、任务 worktree 有脏改动或无法 fast-forward 时必须阻断
11. `/push` 固定执行 `git push origin main`；只有任务分支已进入本地 `main` 且仓库存在 `origin` 时才允许执行，push 成功后清理任务 worktree 并清空持久化的 `workspacePath`，失败时不得提前清理
12. 任务取消、失败或重启恢复后，状态和错误信息持久化到 SQLite，并清理对应 worktree / workspace

## 本地运行约束

1. 默认本地入口是 `pnpm dev`，不是裸 `tsx watch`
2. 运行时状态统一写入 `.runtime/telegram-ai-manager/local/`
3. 启动前必须清理旧 PID 和旧 bot 进程，避免 Telegram `getUpdates 409`
4. 健康检查默认只监听 `127.0.0.1:43117`
5. `pnpm stop` 需要优先优雅停止，再做安全兜底清理

## 文档闭环要求

以下内容发生变化时，必须在同一组改动中同步更新：

- `README.md`：用户可见功能、启动方式、命令清单、运行流程
- `CLAUDE.md`：架构约束、交互面、开发规则
- `AGENTS.md`：Codex / Agent 执行规则
- `docs/mvp-implementation-plan.md`：当前实现状态、运行约束和文档闭环范围
- `.claude/agents/*.md`：架构审查、代码审查、测试审查标准
- `.claude/commands/*.md`：计划、预检、同步和插件开发命令说明，需覆盖发布流与 Codex 最终回包约束
- `src/plugins/CLAUDE.md`：插件开发约束（命令注册、测试、文档同步）

## Git 规范

- 分支：优先使用 `codex/<name>`、`claude/<name>` 或语义化前缀分支，不直接在 `main` 上开发
- 提交格式：Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)
- 每个 Agent 工作在独立分支，通过 PR 合并到 main
- 禁止直接推送 main 分支

## 构建与运行

```bash
pnpm install          # 安装依赖
pnpm dev              # 受管后台启动本地实例
pnpm dev:watch        # 原始 tsx watch 调试模式
pnpm build            # TypeScript 编译
pnpm start            # 受管方式启动 dist（先执行 pnpm build）
pnpm stop             # 停止当前本地实例
pnpm status           # 查看 PID / readiness / 日志
pnpm test             # 运行测试
pnpm lint             # ESLint 检查
pnpm typecheck        # tsc --noEmit
```

## 重要警告

- 不要修改 `core/types.ts` 中的接口签名，除非同步更新所有实现
- 不要在插件中直接操作 Bot 实例，通过 PluginContext / commandRegistry 注册
- 不要在 service 层引入 Telegram 相关类型，保持传输层无关
- Redis 连接失败时队列应降级为内存模式
- `REDIS_URL` 仍属于必填配置项；自动降级仅覆盖 Redis 服务不可用场景
- `node-pty` 失败时必须保持 `child_process.spawn` 回退链路可用
- 不要把 `WORKSPACE_BASE_DIR` 配到源仓库内部
- 不要在本地同时运行多个 bot 实例
