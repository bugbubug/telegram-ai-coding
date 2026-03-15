# 服务层

每个子目录是独立的业务服务，通过 ServiceRegistry 注册。

## 规则
- 服务之间通过接口通信，不直接引用实现
- 每个服务有自己的错误类型（继承 AppError）
- 异步方法必须支持 AbortSignal 取消
- 服务初始化在 index.ts 的 bootstrap 流程中完成
