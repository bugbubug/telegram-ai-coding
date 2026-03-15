在提交代码前执行完整的预检查：

1. `pnpm typecheck` — 类型检查
2. `pnpm lint` — 代码规范
3. `pnpm test` — 单元测试
4. 检查是否有 console.log 残留（应使用 pino logger）
5. 检查是否有未处理的 TODO 或 FIXME
6. 检查 import 是否有循环依赖
7. 检查 `README.md`、`CLAUDE.md`、`AGENTS.md`、`docs/mvp-implementation-plan.md`、`.claude/` 是否与当前实现一致
8. 检查命令菜单、仓库选择、worktree、日志持久化等用户可见行为是否已同步记录到文档
9. 检查 `/repos` 是否仍然只列 Git 仓库，以及文档是否明确 `workspace::prompt` 与默认路径回退语义
10. 检查 `REDIS_URL`、`data/tasks.db`、`.runtime/telegram-ai-manager/local/` 等运行文档是否与当前实现一致

报告所有问题并给出修复建议。
