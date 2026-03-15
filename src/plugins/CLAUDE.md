# 插件开发指南

## 创建新插件

1. 在 `src/plugins/` 下创建 `plugin-<name>/` 目录
2. 创建 `index.ts` 实现 `Plugin` 接口
3. 通过 `PluginContext` 和 `commandRegistry` 注册命令与服务，不直接操作 Telegram `Bot`
4. 插件不应直接 import 其他插件的内部文件
5. 使用 EventBus 进行跨插件通信
6. 为新增命令补充测试，并确认命令描述会进入 Telegram 命令菜单
7. 插件行为变化时，同步更新 `README.md`、`CLAUDE.md`、`AGENTS.md` 和相关 `.claude/` 文档

## 文件结构

```
plugin-<name>/
├── index.ts       # Plugin 接口实现，导出默认实例
├── commands.ts    # 注册的 Bot 命令
├── services.ts    # 可选：插件提供的服务
└── types.ts       # 可选：插件内部类型
```
