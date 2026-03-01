# Supabase 后端部署指南

## 前提条件

- [Supabase CLI](https://supabase.com/docs/guides/cli) 已安装
- Supabase 项目已创建

## 步骤

### 1. 链接 Supabase 项目

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

### 2. 执行数据库迁移

```bash
supabase db push
```

或手动在 Supabase Dashboard → SQL Editor 中粘贴 `migrations/001_auth_subscription_schema.sql` 的内容并执行。

### 3. 配置 Edge Function 密钥

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### 4. 部署 Edge Function

```bash
supabase functions deploy proxy-chat --no-verify-jwt
```

> `--no-verify-jwt` 因为我们在函数内部手动验证 JWT（使用 `supabase.auth.getUser(jwt)`），
> 这样可以返回更友好的错误信息。

### 5. 更新客户端配置

编辑 `src-tauri/src/auth/config.rs`：

```rust
pub const SUPABASE_URL: &str = "https://<your-project>.supabase.co";
pub const SUPABASE_ANON_KEY: &str = "eyJ...your-anon-key...";
pub const PROXY_CHAT_URL: &str = "https://<your-project>.supabase.co/functions/v1/proxy-chat";
```

### 6. 启用 Email Auth

在 Supabase Dashboard → Authentication → Providers 中确认 Email 已启用。

可选：关闭 "Confirm email" 以简化开发阶段测试（生产环境建议开启）。

### 7. 重新构建客户端

```bash
npm run build
npx tauri build
```

## 验证

1. 注册新用户 → 自动获得 Free 计划
2. 发送消息 → 通过 proxy-chat 转发到 Anthropic API
3. 检查 daily_usage 表 → 消息计数 +1
4. 达到每日限额 → 返回 429 错误

## 数据库表

| 表 | 用途 |
|---|---|
| `plans` | 订阅计划定义（免费/专业/团队） |
| `subscriptions` | 用户订阅记录（一用户一条） |
| `daily_usage` | 每日用量追踪 |
