# M2 / M3 接口契约

前端（前台、用户后台、管理后台）和后端并行开发，**以本文为准**。已有的 M1 接口见 `apps/api/src` 和各 `test/*.test.ts`。
通用约定：金额一律「分」；时间 ISO 字符串；错误体 `{message}`；管理端接口需要已验证的管理员会话，括号里是允许的角色（admin 角色拥有所有权限）。

## 账户资料（用户）
- `PATCH /api/me` `{wechat?, telegram?}` → 用户资料（空字符串清空）
- `POST /api/me/password` `{oldPassword, newPassword(≥8位)}` → 204；改后保留当前会话，其他会话失效

## 续费（用户）
- `POST /api/orders` 增加 `kind:'renew'` 支持：`{kind:'renew', renewLeaseId, term, quantity:1, agreedTerms:true, contactWechat?, contactTelegram?}`。续费单联系方式可不填（缺省用账户资料）。只能续自己的、状态为 active / expiring / grace 的租约。数量固定 1（一台一续）。订单号规则同新租，`kind:'renew'`。
- 订单视图增加 `renewLeaseId`、`deviceCode`（续费单）。
- 续费单走同样的 pending → verifying → 后台核对 → **`renewed`**（终态）。确认收款时自动延长租约：`endAt = max(原 endAt, now) 之后 + months`（未过期从原到期顺延；已过期从现在起算），重算 `graceEndAt`，租约状态回 active，机器回 in_use，写 `LeaseRenewal`，通知用户。续费单**不占库存**、不进开通队列。
- `GET /api/me/leases` 每项增加 `canRenew: boolean`，`status` 取值 active|expiring|grace（`ended` 不返回）。

## 租约 / 机器状态推进（后端定时任务，每 10 分钟，可注入时钟）
- 到期前 ≤7 天：租约 `expiring`、机器 `expiring`；过 endAt：租约 `grace`、机器 `grace`；过 graceEndAt：租约 `ended`、机器 `recycling`。续费后回到 active / in_use。
- 提醒通知（邮件 + 站内信，每个节点只发一次）：到期前 7/3/1 天、进入宽限期、宽限结束（进入回收）前 1 天。模板名 `expiry_7|expiry_3|expiry_1|grace_start|recycle_soon`。
- 运营提醒（站内，给后台，见 dashboard.todos）：待核对 >24h、待开通剩余 ≤2 天或超期。

## 回收（运维）
- `GET /api/admin/recycle`（ops）→ `[{deviceId, code, publicIp, lessee: email|null, endedAt, daysWaiting}]`（状态 recycling 的机器）
- `POST /api/admin/recycle/:deviceId/complete`（ops） `{wiped:true, uuReset:true, passwordChanged:true}` 三项必须全 true → 机器回 idle，写 `RecycleRecord`、审计；原租约凭证删除（Credential 记录清除，旧密码作废）。

## 工单
类别固定：`无法连接 | 机器卡顿 | 重置密码 | 重启 | 其他`。状态：`open | processing | resolved | closed`。工单号 `T` + 年月日 + 4 位流水。
- `POST /api/tickets`（用户）`{category, content(5–2000字), leaseId?}` → 工单视图（leaseId 必须是自己的租约）。每用户每小时最多 10 张。
- `GET /api/me/tickets`（用户）→ `[{no, category, content, status, createdAt, leaseId, deviceCode, notes:[{content, createdAt, fromStaff:true}]}]`（只含对用户可见的处理记录）
- `POST /api/me/tickets/:no/reply`（用户）`{content}` → 204（追加用户留言；已 closed 的 409）
- `GET /api/admin/tickets?status&keyword&page&pageSize`（support|ops）→ `{total, items:[{no, category, content, status, userEmail, deviceCode, assigneeId, assigneeName, createdAt, updatedAt, notes:[{id, adminName, content, internal, createdAt}]}]}`
- `PATCH /api/admin/tickets/:no`（support|ops）`{status?, assigneeId?}` → 工单；状态变化通知用户（resolved）
- `POST /api/admin/tickets/:no/notes`（support|ops）`{content, internal:boolean}` → 204；`internal:false` 对用户可见并发站内通知
- `GET /api/admin/staff`（任意管理员）→ `[{id, name, role}]`（可指派对象）
- 重置密码类工单由运维在后台直接改凭证：`PUT /api/admin/leases/:id/credential`（ops）`{uuPassword?, macPassword?, uuDeviceCode?, macUsername?}` → 204，审计日志，用户收到站内通知。

## 退款（取代 M1 的简化退款）
- `GET /api/admin/orders/:no/refund-preview`（admin）`?unfixable=0|1&aup=0|1` → `{paidCents, suggestedCents, reason, daysUsed, usedMonths, activated}`（用 `@nyd/shared` 的 `calcRefund`；daysUsed 从租约 startAt 起算）
- `POST /api/admin/orders/:no/refund`（admin）`{reason, amountCents(≥0, ≤已付), xianyuRefundNo?}` → 订单详情。订单 queued|active → `refunding`，创建 Refund（保存 calcDetail 与建议金额）；若带 `xianyuRefundNo` 则直接完成为 `refunded`。active 订单同时结束租约、机器进 recycling。
- `POST /api/admin/refunds/:id/complete`（admin）`{xianyuRefundNo}` → 订单 `refunded`
- `GET /api/admin/refunds?status`（admin）→ `[{id, orderNo, userEmail, amountCents, reason, status, xianyuRefundNo, createdAt}]`
- 开通超过 7 天的补偿（每超 1 天补 1 天）：`POST /api/admin/orders/:no/compensate`（ops|admin）把该订单所有租约 endAt 延长「超期天数」，写审计。

## 看板 / 对账 / 用户管理
- `GET /api/admin/dashboard`（任意管理员）→
  `{pendingVerify, verifyOverdue, queued, queuedWarn, queuedOverdue, leased, idle, expiring7, monthRevenueCents, ordersLast14d:[{date:'YYYY-MM-DD', count}], utilization:{total, leased, idle, maintenance, fault, recycling}, todos:[{type, text, href}]}`
  收入 = 本月（UTC+8）已确认收款订单 paidCents 之和，扣除已退款订单。`todos.href` 是后台内路径，如 `/admin/orders?status=verifying`。
- `GET /api/admin/export/orders.csv?date=YYYY-MM-DD`（support|admin）→ text/csv（UTF-8 带 BOM）：订单号,类型,用户邮箱,租期,台数,应收,实收,闲鱼订单号,闲鱼昵称,确认收款时间,经办人
- `GET /api/admin/users?keyword&page&pageSize`（所有管理员）→ `{total, items:[{id,email,wechat,telegram,status,createdAt,orderCount,activeDevices}]}`
- `GET /api/admin/users/:id` → 用户 + `orders[]` + `leases[]`（不含凭证）
- `PATCH /api/admin/users/:id`（admin）`{status:'active'|'disabled'}`；禁用时清除其会话，审计。
- 管理员列表：`GET /api/admin/admins`（admin）→ `[{id,email,name,role,totpEnabled,status}]`，用于「重置两步验证」。

## M3
- 咨询：`POST /api/consult`（公开，限流 5/小时/IP）`{contact, quantity?, message}` → 204；`GET /api/admin/consults?status`（support）→ `[{id, contact, quantity, message, status:'new'|'following'|'done', note, createdAt}]`；`PATCH /api/admin/consults/:id`（support）`{status?, note?}`。
- 机器心跳：设备上的 agent `POST /api/heartbeat` 头 `X-Device-Token`，body `{uptimeSec?, load?}`；每台机器一个随机 token（库里存 SHA-256），`POST /api/admin/devices/:id/token`（ops）重新生成并**只返回一次**明文 `{token}`。`Device.lastHeartbeatAt` 更新。
  `GET /api/admin/devices` 每项增加 `online: boolean|null`（有 token 且 5 分钟内有心跳为 true；有 token 无心跳为 false；未装 agent 为 null）；summary 增加 `offline` 计数。离线超过 5 分钟（仅对「使用中」机器）在 dashboard.todos 出现一次告警。
- 公共库存口径不变。`GET /api/plans` 增加 `allOnline: boolean`（无离线的使用中机器）供首页「所有机器运行正常」使用。
- 博客：纯前端 MDX/Markdown 文件，无接口。
- 批量开通：`POST /api/admin/orders/:no/activate` 已支持多台；前端增加「粘贴表格」批量录入（每行：设备编号, UU设备代码, UU密码, macOS用户名, macOS密码，制表符或逗号分隔）。

## 前端路由约定
前台：`/` `/auth` `/order/new` `/order/[no]` `/help` `/refund` `/terms` `/privacy` `/aup` `/consult` `/blog` `/blog/[slug]`
用户后台：`/account`（概览）`/account/orders` `/account/devices` `/account/renew?lease=<id>` `/account/tickets` `/account/settings`
管理后台：`/admin/login` `/admin`（看板）`/admin/orders` `/admin/provision` `/admin/devices` `/admin/recycle` `/admin/tickets` `/admin/users` `/admin/refunds` `/admin/consults` `/admin/settings`
