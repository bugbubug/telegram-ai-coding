创建一个新的插件模块：

插件名称：$ARGUMENTS

执行步骤：
1. 在 `src/plugins/plugin-$ARGUMENTS/` 创建目录
2. 创建 `index.ts` 实现 `Plugin` 接口（参考 plugin-codex）
3. 创建 `commands.ts` 注册插件特有的 Bot 命令
4. 创建 `types.ts` 定义插件内部类型
5. 在 `tests/plugins/` 创建对应测试文件
6. 运行 `pnpm typecheck` 确认无错误
