# Telegram AI Manager — Agent Instructions

本文件同时适用于 Claude Code 和 Codex CLI。

## 项目简介

Telegram Bot 前端 → 本机 CLI (Codex / Claude Code) 终端桥接管理器。
插件化 + 服务解耦架构。TypeScript + Node.js 20+。

## 必须遵守的规则

1. 使用 pnpm 作为包管理器，不要使用 npm 或 yarn
2. TypeScript strict 模式，不允许 any 类型（除非有 JSDoc 标注原因）
3. 所有新文件必须有对应的测试文件
4. 修改公共接口后运行 `pnpm typecheck` 确认零错误
5. 所有 Telegram 消息输出不超过 4096 字符，超长自动分片
6. 环境变量通过 zod schema 校验，不直接 process.env 读取
7. 提交前运行 `pnpm lint && pnpm test`

## 文件结构约定

- `src/core/` — 只放抽象接口和基础设施，不放业务逻辑
- `src/services/` — 业务逻辑，每个子目录是独立服务
- `src/bot/` — Telegram 交互层，只做 UI 编排
- `src/plugins/` — 自包含插件，每个插件一个目录

## 测试

```bash
pnpm test              # 全量测试
pnpm test -- --watch   # watch 模式
pnpm test -- <pattern> # 过滤测试
```

## 当你不确定时

- 先读 `src/core/types.ts` 了解接口定义
- 查看 `src/core/event-bus.ts` 了解事件通信方式
- 参考已有插件（plugin-codex/）了解插件结构
