# Telegram AI Manager — Agent Instructions

本文件同时适用于 Claude Code 和 Codex CLI。

## 项目简介

Telegram Bot 前端 → 本机 CLI (Codex / Claude Code) 终端桥接管理器。
插件化 + 服务解耦架构。TypeScript + Node.js 20+。
当前实现已包含仓库选择、`git worktree` 隔离任务、SQLite 历史日志和 Telegram 命令菜单。
本地运行采用受管单实例模式，PID / 日志 / 状态写入 `.runtime/telegram-ai-manager/local/`。

## 必须遵守的规则

1. 使用 pnpm 作为包管理器，不要使用 npm 或 yarn
2. TypeScript strict 模式，不允许 any 类型（除非有 JSDoc 标注原因）
3. 所有新文件必须有对应的测试文件
4. 修改公共接口后运行 `pnpm typecheck` 确认零错误
5. 所有 Telegram 消息输出不超过 4096 字符，超长自动分片
6. 环境变量通过 zod schema 校验，不直接 process.env 读取
7. 提交前运行 `pnpm lint && pnpm test`
8. 修改公共接口、Bot 命令、仓库选择流程或 workspace 生命周期后，同时更新 `README.md`、`CLAUDE.md`、`AGENTS.md`、`docs/mvp-implementation-plan.md` 与相关 `.claude/*.md`
9. 修改启动/停止脚本、健康端口、PID/日志路径后，同步更新运行文档

## 文件结构约定

- `src/core/` — 只放抽象接口和基础设施，不放业务逻辑
- `src/services/` — 业务逻辑，每个子目录是独立服务
- `src/bot/` — Telegram 交互层，只做 UI 编排
- `src/plugins/` — 自包含插件，每个插件一个目录

## 当前运行模型

- 用户先通过 `/repos` 选择 `DEFAULT_WORKSPACE_SOURCE_PATH` 下的仓库
- `/repos` 只列出 `DEFAULT_WORKSPACE_SOURCE_PATH` 下可识别的 Git 仓库
- `/task`、`/codex`、`/claude` 和自由文本默认作用于当前已选仓库；未选择仓库时回退到 `DEFAULT_WORKSPACE_SOURCE_PATH`
- `/task`、`/codex`、`/claude` 支持 `workspace::prompt` 显式覆盖目标路径
- Git 仓库使用 `WorkspaceManager` 创建独立 `git worktree`
- 同一任务重试前必须清理残留 `git worktree` 注册，任务失败/取消/重启恢复后要自动回收 workspace，成功任务要保留 worktree 供 `/submit`、`/merge`、`/push`
- 任务发布采用分步流：`/submit` 只提交任务分支，`/merge` 只合并到本地 `main`，`/push` 只推送 `origin/main`
- `/push` 成功后要自动清理对应任务的本地 worktree，但默认保留任务分支
- `WORKSPACE_BASE_DIR` 必须放在源仓库目录外
- 非 Git 目录才回退为目录复制
- 任务输出持久化到 SQLite 的 `task_logs`，`/logs` 从历史表读取
- `node-pty` 不可用时，终端层必须保留 `child_process.spawn` 回退
- 默认使用 `pnpm dev`、`pnpm stop`、`pnpm status` 管理本地实例，不要默认裸跑 `tsx watch`
- 避免多实例同时轮询 Telegram，防止 `getUpdates 409`

## Bot 命令面

- 内置：`/start`、`/repos`、`/task`、`/status`、`/logs`、`/cancel`、`/submit`、`/merge`、`/push`、`/clear`、`/reset`
- 插件：`/codex`、`/claude`
- 启动时需要通过 `setMyCommands()` 注册命令菜单
- `/status` 输出应包含当前已选仓库和活跃任务的 worktree 信息
- Codex 任务默认只回传最终结果，不回传中间过程；成功任务完成后需要返回 `task_id`、分支名、worktree 路径以及下一步 `/submit`、`/merge`、`/push` 提示

## 测试

```bash
pnpm test              # 全量测试
pnpm test -- --watch   # watch 模式
pnpm test -- <pattern> # 过滤测试
pnpm status            # 查看本地实例状态
pnpm stop              # 停止本地实例
```

## 当你不确定时

- 先读 `src/core/types.ts` 了解接口定义
- 查看 `src/core/event-bus.ts` 了解事件通信方式
- 查看 `src/services/workspace/workspace-manager.ts` 了解仓库隔离策略
- 查看 `src/services/workspace/repository-catalog.ts` 确认 `/repos` 实际只扫描 Git 仓库
- 查看 `src/services/task/task-runner.ts` 了解任务生命周期和日志持久化
- 参考已有插件（plugin-codex/）了解插件结构
