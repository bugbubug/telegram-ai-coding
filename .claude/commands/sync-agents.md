同步 `CLAUDE.md`、`AGENTS.md` 以及相关 `.claude/agents/*.md` 的关键信息，确保以下内容一致：

1. 技术栈描述
2. 目录结构说明
3. 编码规范要求
4. 测试命令
5. Git 规范
6. Bot 命令面和仓库选择流程
7. `git worktree` / workspace 生命周期约束
8. 文档闭环要求
9. `/repos` 仅列 Git 仓库、`workspace::prompt` 覆盖和默认路径回退语义
10. `REDIS_URL`、SQLite 路径、runtime 路径等运行约束

检查差异，列出需要同步的文件和建议修改内容；如果用户明确要求补齐文档闭环，则直接修改对应文档。
