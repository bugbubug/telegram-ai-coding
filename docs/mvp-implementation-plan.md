# Telegram AI Manager — MVP 实现状态与文档闭环清单

## 文档定位

本文件不再是“待实现计划”。当前仓库的 MVP 已经落地，本文件用于记录：

- 当前已交付的 MVP 范围
- 运行时约束与容易误解的行为边界
- 后续改动时必须同步更新的文档范围

如果实现继续演进，优先把这里当作“状态快照 + 文档闭环清单”维护，而不是继续保留过时的实施计划。

## 当前 MVP 已交付能力

- Telegram Bot 命令面：`/start`、`/repos`、`/task`、`/status`、`/logs`、`/cancel`、`/submit`、`/merge`、`/push`、`/clear`、`/reset`、`/codex`、`/claude`
- 启动时自动执行 `setMyCommands()` 注册命令菜单
- `RepositoryCatalog` 扫描 `DEFAULT_WORKSPACE_SOURCE_PATH` 直接子目录下的 Git 仓库供 `/repos` 选择
- `RepositorySelectionStore` 保存用户当前选中的仓库
- `TaskRunner` 负责排队、执行、取消、启动恢复和日志持久化；启动恢复时会重新入队历史 `queued` 任务，并把历史 `running` 任务标记为失败
- `TaskPublisher` 负责任务分支提交、本地 `main` 合并、远端推送和 push 后 worktree 清理
- 发布动作除文本命令外，还支持 Telegram 按钮触发；任务完成后按钮顺序固定为 `submit -> merge -> push`，其中 `/merge`、`/push` 需要先确认再执行
- Git 仓库使用 `WorkspaceManager` 创建独立 `git worktree`
- 非 Git 目标路径自动回退为目录复制
- `/task` 和自由文本走默认 Agent（当前为 `codex`）；`/codex`、`/claude` 显式绑定对应 CLI
- 任务输出持久化到 SQLite 的 `task_logs`，`/logs` 直接读取历史表
- Codex 任务默认只在完成时回传最终结果；若未提取到最终结果，提示用户使用 `/logs` 查看原始日志
- `node-pty` 不可用时，终端层保留 `child_process.spawn` 回退
- 本地运行采用受管单实例模式：PID、日志和健康状态写入 `.runtime/telegram-ai-manager/local/`
- Redis 不可用时，任务队列自动降级为内存模式

## 关键行为边界

### 1. 仓库选择不是“任意目录选择”

- `/repos` 只展示 `DEFAULT_WORKSPACE_SOURCE_PATH` 直接子目录下可识别的 Git 仓库
- `/repos` 实际只扫描 `DEFAULT_WORKSPACE_SOURCE_PATH` 的直接子目录
- 因此，`/repos` 菜单本身不会列出普通目录
- 如果 `DEFAULT_WORKSPACE_SOURCE_PATH` 本身就是某个仓库根目录，它也不会作为“自己”出现在 `/repos` 菜单里
- 普通目录仍然可以作为任务目标，但需要走默认路径回退或 `workspace::prompt` 显式指定

### 2. 未选择仓库时的默认行为

- `/task`、`/codex`、`/claude` 和两步输入模式在未选仓库时，不会强制报错
- 如果用户没有先执行 `/repos`，任务会默认使用 `DEFAULT_WORKSPACE_SOURCE_PATH`
- 这意味着 `DEFAULT_WORKSPACE_SOURCE_PATH` 可以是单仓库路径，也可以是一个手工指定的目录；只是单仓库路径不会被 `/repos` 菜单直接列出

### 3. `workspace::prompt` 的优先级最高

- `/task [workspace::]prompt`
- `/codex [workspace::]prompt`
- `/claude [workspace::]prompt`
- 当命令中显式提供 `workspace::prompt` 时，会覆盖当前已选仓库和默认路径

### 4. workspace 创建策略

- 目标路径是 Git 仓库：使用 `git worktree`
- 目标路径不是 Git 仓库：复制目录到 `WORKSPACE_BASE_DIR/<taskId>`
- `WORKSPACE_BASE_DIR` 必须位于源仓库目录外部

### 5. 任务发布流是分步的

- `/submit` 只在任务分支/worktree 上提交代码
- `/submit` 默认作用于最近一条仍保留 Git worktree 的可提交任务；未显式传入 commit message 时，默认使用 `chore(task): submit <task_id>`
- `/merge` 只在主仓库上执行 `git merge --ff-only task/<task_id>`
- `/merge` 默认作用于最近一条可 merge 的 Git 任务
- `/push` 只执行 `git push origin main`
- `/push` 默认作用于最近一条可 push 的 Git 任务，且要求任务分支已经进入本地 `main`、仓库存在 `origin`
- `/push` 成功后自动删除该任务的本地 worktree，并清空任务记录中的 `workspacePath`
- 只有 Git 任务会显示发布按钮并进入上述发布流；非 Git 任务不会出现 `/submit`、`/merge`、`/push` 按钮
- 直接输入 `/merge`、`/push` 会立即执行；Telegram 按钮路径会先弹确认再执行
- 主仓库不在 `main`、有未提交改动、任务 worktree 有未提交改动、任务分支不存在或无法 fast-forward 时，发布流程必须直接阻断

### 6. 重启恢复不是“断点续跑”

- 进程重启后，历史 `queued` 任务会重新入队
- 进程重启后，历史 `running` 任务不会继续执行，而是会被标记为 `failed`
- 与这些任务关联的 workspace 会在恢复阶段被清理，避免残留 worktree

### 7. 运行模式是“受管单实例”

- 默认本地入口为 `pnpm dev`
- 生产产物入口为 `pnpm build && pnpm start`
- 不推荐把 `pnpm dev:watch` 当作日常默认入口
- 启动脚本会清理旧 PID 和旧 bot 进程，尽量避免 Telegram `getUpdates 409`

## 当前运行时落点

- SQLite 数据库：`data/tasks.db`
- 运行时根目录：`.runtime/telegram-ai-manager/local/`
- PID 文件：`.runtime/telegram-ai-manager/local/pids/app.pid`
- 应用日志：`.runtime/telegram-ai-manager/local/logs/app.log`
- 启停日志：`.runtime/telegram-ai-manager/local/logs/start.log`、`.runtime/telegram-ai-manager/local/logs/stop.log`
- 健康状态文件：`.runtime/telegram-ai-manager/local/state/health.env`
- 健康检查地址：`http://127.0.0.1:43117/healthz`

## 配置约束

- 所有环境变量由 `src/config/index.ts` 的 zod schema 校验
- `REDIS_URL` 当前属于必填配置项
- 即使配置了 `REDIS_URL`，当 Redis 服务不可用时，队列仍会自动降级为内存模式
- `TELEGRAM_ALLOWED_USERS` 必须是逗号分隔的数字 user id 列表

## 推荐验证清单

### 文档改动后

- 检查 `README.md`、`CLAUDE.md`、`AGENTS.md`、`.claude/` 与本文件描述是否一致
- 检查命令清单、运行方式、仓库选择流程、workspace 生命周期是否写法一致
- 检查 `/submit`、`/merge`、`/push` 的默认目标选择、阻断条件和 push 后清理语义是否写法一致
- 检查 Codex “只回最终结果”与 `/logs` 回退说明是否写法一致

### 行为改动后

- 修改公共接口后运行 `pnpm typecheck`
- 提交前运行 `pnpm lint && pnpm test`
- 若涉及本地实例管理，再执行 `pnpm status` / `pnpm stop` 做一次运行链路检查

## 发生以下变更时必须同步更新文档

- Bot 命令面、命令语法、两步输入流程
- `/repos` 的扫描范围和仓库选择逻辑
- `workspace::prompt` 解析规则或默认路径回退逻辑
- `git worktree` / 非 Git 回退策略
- SQLite 路径、runtime 路径、PID / 日志 / 健康端口
- Redis 降级策略、任务生命周期或日志持久化方式
- `/submit`、`/merge`、`/push` 的发布语义与 worktree 清理规则
- 插件注册方式、命令菜单注册方式、协作规范

## 当前仍为占位的部分

- `plugin-mcp` 当前是预留插件，占位但不提供用户命令

如果未来它开始暴露用户可见能力，需要同步更新 `README.md`、`CLAUDE.md`、`AGENTS.md`、`.claude/` 和插件文档。
