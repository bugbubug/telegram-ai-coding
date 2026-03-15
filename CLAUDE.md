# Telegram AI Manager

## 项目概述

Telegram Bot UI 统一管理本机 Codex CLI 和 Claude Code CLI 终端会话。
采用服务解耦 + 插件化架构，为后续多 Agent 编排预留扩展点。

## 技术栈

- Runtime: Node.js 20+ / TypeScript 5.5+ (strict mode)
- Telegram: grammY
- 终端桥接: node-pty
- 任务队列: BullMQ + Redis
- 存储: SQLite (better-sqlite3)
- 日志: pino
- 测试: vitest
- 包管理: pnpm

## 关键架构决策

- 所有模块通过 `core/service-registry.ts` 做依赖注入，禁止跨模块直接 import 实现
- 插件通过 `PluginContext` 接口注册，不直接耦合主进程
- Agent 适配器通过 `AgentAdapter` 接口编程，新增 Agent 只需实现接口
- 事件驱动：所有跨模块通信走 `EventBus`，类型约束 `EventMap`
- 每个任务分配隔离的 workspace 目录

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

## 测试要求

- 单元测试：`pnpm test`
- 测试框架：vitest
- 覆盖率目标：核心模块 > 80%
- 测试文件命名：`*.test.ts`，与源文件同目录或 `tests/` 镜像目录

## Git 规范

- 分支：`feat/<name>`, `fix/<name>`, `refactor/<name>`
- 提交格式：Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)
- 每个 Agent 工作在独立分支，通过 PR 合并到 main
- 禁止直接推送 main 分支

## 构建与运行

```bash
pnpm install          # 安装依赖
pnpm dev              # 开发模式（tsx watch）
pnpm build            # TypeScript 编译
pnpm start            # 生产启动
pnpm test             # 运行测试
pnpm lint             # ESLint 检查
pnpm typecheck        # tsc --noEmit
```

## 重要警告

- 不要修改 `core/types.ts` 中的接口签名，除非同步更新所有实现
- 不要在插件中直接操作 Bot 实例，通过 PluginContext 注册
- 不要在 service 层引入 Telegram 相关类型，保持传输层无关
- Redis 连接失败时队列应降级为内存模式
- node-pty 进程必须在 SIGTERM 时优雅清理
