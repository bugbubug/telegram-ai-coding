创建一个新的插件模块：

插件名称：$ARGUMENTS

执行步骤：
1. 在 `src/plugins/plugin-$ARGUMENTS/` 创建目录
2. 创建 `index.ts` 实现 `Plugin` 接口（参考 plugin-codex）
3. 创建 `commands.ts`，通过 `PluginContext.commandRegistry` 注册插件命令，不直接依赖 `Bot`
4. 创建 `types.ts` 定义插件内部类型
5. 在 `tests/plugins/` 创建对应测试文件，并验证命令注册
6. 更新 `README.md`、`CLAUDE.md`、`AGENTS.md` 或相关 `.claude/` 文档中受影响的命令说明
7. 运行 `pnpm typecheck`、`pnpm lint` 和相关测试确认无错误
