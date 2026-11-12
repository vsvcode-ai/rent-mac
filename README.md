# 南洋桌面 NanyangDesk

马来西亚机房自营的 Mac mini 租赁站。需求见 `需求设计-ineedmac复刻.md`，开发计划见 `开发计划.md`，视觉规范见 `DESIGN.md`，高保真原型见 `prototype/`，M2/M3 接口约定见 `docs/M2-M3-API契约.md`。

## 结构
- `apps/web`：Next.js 15（前台、用户后台 `/account`、管理后台 `/admin`）
- `apps/api`：NestJS 12（ESM）+ Prisma + PostgreSQL
- `packages/shared`：计价、状态机、退款、日期、校验（前后端共用）
- `e2e/`：Playwright 端到端测试

## 本地开发
```bash
pnpm install
pnpm dev:db                  # 没有 Docker 时：内嵌 Postgres，监听 5432（也可用 infra/docker-compose.dev.yml）
cp apps/api/.env.example apps/api/.env
pnpm --filter @nyd/api prisma migrate deploy && pnpm --filter @nyd/api db:seed
ADMIN_PASSWORD='至少12位密码' pnpm --filter @nyd/api admin:create you@example.com 你的名字 admin
pnpm dev:api                 # http://localhost:4000
pnpm dev:web                 # http://localhost:3000（/api 与 /uploads 转发到 API_URL，默认 4000）
```
本地快速试用：`pnpm --filter @nyd/api dev:demo` 创建测试账号（密码 `Demo-Passw0rd!!`）与客服联系方式、闲鱼链接；`pnpm --filter @nyd/api dev:totp <邮箱>` 打印管理员当前动态码（免手机验证器）。邮件验证码在 API 日志里。

管理员首次登录 `/admin/login` 必须绑定两步验证并保存恢复码。

## 检查
```bash
pnpm lint && pnpm typecheck && pnpm test   # 单元 + 接口测试（接口测试自带临时数据库）
pnpm test:e2e                              # 浏览器端到端（约 1.5 分钟，首次需 npx playwright install chromium）
```

## 生产环境必须配置
| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `CREDENTIAL_KEY` | 凭证加密主密钥：`openssl rand -base64 32`。**丢失后所有已存连接信息无法解密，离线备份两份** |
| `NODE_ENV=production` | 开启 Cookie Secure，未设 CREDENTIAL_KEY 时拒绝启动 |
| `UPLOAD_DIR` | 二维码等上传图片目录，必须挂持久化磁盘 |
| `API_URL`（web，构建时） | Next 把 /api 转发到的后端地址 |

## 上线前还需要接入（代码里已抽象好接口）
- 邮件服务（`apps/api/src/common/mail.ts` 的 `Mailer`，现在只打日志）
- Redis（`apps/api/src/common/kv.ts` 的 `Kv`，现在是内存实现：验证码、登录限流；多实例部署或重启会丢）
- 反向代理需透传真实客户端 IP（限流按 IP；API 已设置 `trust proxy`）
