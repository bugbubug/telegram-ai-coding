# Core 层

此目录是所有模块的依赖根。修改这里的代码影响全局。

## 修改规则
- 修改 types.ts 前必须搜索所有 implements 和引用点
- EventBus 的 EventMap 新增事件需要同步更新文档
- ServiceRegistry 新增服务需要更新 README 的架构图
- 所有改动必须通过 `pnpm typecheck` 才能提交
