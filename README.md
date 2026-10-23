# 音乐会选座小程序（核验单号 → 选座，无站内支付）

微信小程序 + 微信云开发（CloudBase）。**收款放在微信视频号小店**，小程序只做「订单号核验 + 选座 + 座位绑定」。

观众流程：在**微信视频号小店**按票档买票拿到订单号 → 回小程序粘贴订单号核验 → 在对应票档区域选座 → 确认锁座（座位绑定到该订单号）。

座位分为 A/B/C 三档 box 布局（A区 7×8、B区左右两块各 5×4、C区 3×6），对照设计原型定稿。

## 当前状态

本仓库保存的是演示/开发版本，尚未完成生产上线验证。

- 已有订单核验、分区选座、确认锁座和结果页，以及 5 个云函数源码。
- 默认云环境仍为占位符；演示订单只用于本地流程展示，不代表真实购票或持久化锁座。
- `syncWxStoreOrders.fetchPaidOrders()` 仍为空实现，需要接入真实微信小店订单接口。
- 正式使用前需完善导入接口鉴权（当前 `internal: true` 来自请求参数，不能作为可信身份依据）、订单归属校验及并发核验，并验证事务锁座、重复座位输入和异常处理。
- 本次归档仅整理仓库与文档，未修改业务代码。私人配置、依赖目录、密钥文件和本机文件不纳入版本管理。

---

## 一、目录结构

```
concert-miniprogram/
├── project.config.json
├── miniprogram/                 # 小程序前端
│   ├── app.js / app.json / app.wxss
│   ├── utils/venue.js           # 座位建模(A/B/C box 布局/座位号/分区)
│   └── pages/
│       ├── verify/              # 入口: 粘贴订单号核验
│       ├── seat/                # 选座页(Canvas, 按票档限分区+限数量)
│       ├── order/               # 确认锁座(无支付)
│       └── result/              # 选座结果
└── cloudfunctions/              # 云开发后端
    ├── verifyTicket/            # 核验订单号, 返回票档/数量, 绑定openid
    ├── getSeats/                # 查询已售座位
    ├── claimSeats/              # 事务校验+把座位绑定到订单号
    ├── importTickets/           # 单号入库(手动/HTTP/被同步函数调用)
    └── syncWxStoreOrders/       # 定时轮询视频号小店订单 -> 入库(需补全订单接口)
```

---

## 二、本地先跑起来（演示模式，无需任何资质/配置）

1. 用**微信开发者工具**打开 `concert-miniprogram` 目录，填测试 AppID。
2. `app.js` 的 `cloudEnv` 仍是 `TODO_...` 时自动进入**演示模式**：
   - 核验页用内置测试单号（页面下方可点：`DEMO-A-1`=A区·1座、`DEMO-B-2`=B区·2座、`DEMO-C-2`=C区·2座）；
   - 核验 → 选座（限对应分区/数量）→ 确认锁座 → 结果，整套流程走通，不依赖云端。

---

## 三、整体架构（重点：单号怎么进库）

```
微信视频号小店(收款) ──┐  ①单号入库(任选, 可叠加)
                       ├─ 自动: syncWxStoreOrders 定时轮询订单API
                       ├─ 半自动: 渠道/腾讯轻联 POST -> importTickets(HTTP触发)
                       └─ 手动: 控制台调 importTickets 传 tickets[]
                              │
                              ▼
                   云数据库 tickets 集合(单号库)
                              │ ②小程序核验
                              ▼
   粘贴单号 → verifyTicket → 限分区/限数量选座 → claimSeats(绑定座位+置used)
```

先用**手动导入**即可跑通线上；待 `syncWxStoreOrders` 接好视频号小店订单接口后自动同步，小程序无需改动。

---

## 四、正式上线前置条件

| 事项 | 说明 |
|---|---|
| 小程序企业认证 | 你已是企业主体；认证后可用云开发 |
| 开通云开发 | 创建云环境，记下**环境ID** |
| 微信视频号小店 | 开店并按票档创建**门票虚拟商品**（见「六」） |
| （自动同步可选）| 视频号小店服务端订单接口的 access_token + 接口调用 |

> 本方案**不在小程序内收款**，无需微信支付商户号、无需配置 request 合法域名。

---

## 五、部署步骤

### 1. 填配置
- `project.config.json` → `appid`
- `miniprogram/app.js` → `globalData.cloudEnv`（云环境ID）、`sessionId`（本场演出ID）
- `cloudfunctions/importTickets/index.js` → `IMPORT_SECRET`（HTTP 导入密钥，改成随机串）
- `cloudfunctions/syncWxStoreOrders/index.js` → `SKU_ZONE_MAP`（小店商品ID→票档）、`SESSION_ID`

### 2. 部署云函数
开发者工具里对 `cloudfunctions/` 下每个函数右键「上传并部署：云端安装依赖」，共 5 个：
`verifyTicket`、`getSeats`、`claimSeats`、`importTickets`、`syncWxStoreOrders`。

### 3. 创建数据库集合（权限都设为「仅管理端/云函数可读写」）
- **`tickets`**（单号库）：`_id=orderNo`，字段 `orderNo / sessionId / zone(0=A区,1=B区,2=C区) / qty / buyerPhone / status(unused|used) / boundOpenid / seats[] / source / importTime / verifyTime / useTime`
- **`seats`**（座位占用）：`_id=场次Id__row_col`，字段 `sessionId / seatKey / status(sold) / orderNo / holder / soldTime`
- **`sync_state`**（同步游标，自动同步用）：`_id=wxstore`，字段 `lastSyncTime`

建议给 `seats.sessionId+status`、`tickets.status` 建索引。

### 4. 导入单号（先手动验证全链路）
云开发控制台「云函数」→ 测试 `importTickets`，传：
```json
{ "internal": true, "tickets": [
  { "orderNo": "你的真实订单号", "sessionId": "concert-2026-06-21", "zone": 1, "qty": 2, "buyerPhone": "13800000000" }
]}
```
然后在小程序里用该订单号核验选座。

### 5.（可选）开启自动同步
- 为 `syncWxStoreOrders` 配置**定时触发器**（每 2–5 分钟）。
- 补全其中 `fetchPaidOrders()`：按[微信小店服务端订单接口](https://developers.weixin.qq.com/doc/store/shop/API/)取已支付订单（access_token 调用），返回 `[{orderNo, buyerPhone, items:[{productId, skuId, quantity}]}]`。
- 或用 HTTP 触发 `importTickets` + 腾讯轻联把小店订单推过来。

### 6. 上传发布
开发者工具「上传」→ 小程序后台提交审核 → 发布。

---

## 六、在微信视频号小店建门票商品（怎么卖票）

> 详见对话里的「微信小店加商品」分步指引。要点：
1. 视频号小店「商品管理 → 添加商品」，商品类型选**虚拟商品/无需物流**。
2. 每个**票档建一个商品**（或一个商品多个 SKU）：A区¥76、B区¥69、C区¥62。
3. 商品详情写清「付款后用订单号到选座小程序选座」。
4. 上架后记下每个商品的 **product_id/sku_id**，填进 `syncWxStoreOrders` 的 `SKU_ZONE_MAP`。

---

## 七、关键业务逻辑

- **限分区+限数量**：核验返回票档 `zone` 与 `qty`，选座页只允许在该分区选、且恰好选 `qty` 个；服务端 `claimSeats` 再次校验，前端不可绕过。
- **防抢座**：`claimSeats` 用 `db.runTransaction` 原子写座位，已售即冲突，整单失败提示重选。
- **防冒用**：订单号首次核验绑定 openid，之后仅本人可继续；可选「手机号后4位」二次校验（`tickets.buyerPhone`）。
- **幂等**：同一订单重复提交不会重复占座；`importTickets` 同号跳过。

---

## 八、可调整项

| 改什么 | 改哪里 |
|---|---|
| 座位布局 / 座位号 / 分区 | `miniprogram/utils/venue.js` 与 `cloudfunctions/claimSeats/venue.js` 的 `BLOCKS`/`zoneOf()`（**两处同步**） |
| 票档→分区映射 | `syncWxStoreOrders` 的 `SKU_ZONE_MAP` |
| 演示测试单号 | `pages/verify/verify.js` 的 `DEMO_TICKETS` |
| 场次ID | `app.js` 的 `sessionId` 与 `syncWxStoreOrders` 的 `SESSION_ID` |

> ⚠️ `venue.js` 前端与 `claimSeats` 各一份，改布局/分区时两处都要同步。
