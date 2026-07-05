# flow-batch 对外接口目录

> **面向**:内容制作方(良维「青少年模式批量内容」等)
> **版本**:v2.0 · 2026-07-05

## 三个接口

| 接口 | 用途 | 文档 |
|---|---|---|
| `POST /flow-batch/image` | 生图,自动转存到造梦次元可用的 CDN 域名 | [image.md](./image.md) |
| `POST /flow-batch/character` | 建角色,拿到 `character_id` | [character.md](./character.md) |
| `POST /flow-batch/flow` | 一键建作品,进审核队列 | [flow.md](./flow.md) |

## 一个作品从 0 到审核队列的调用顺序

```
生头像 ──┐
生形象图 ─┼─→ 建角色 ──┐
生封面  ────────────────┴─→ 建作品 ─→ 审核队列
```

5 次调用 = 3 张图 + 1 个角色 + 1 个作品。批量生 N 个,套模板即可。

## 通用规则

### Base URL

```
https://tools.ideaflow.pro/flow-batch
```

### Header

三个接口都需要:

```
Authorization: metatube-<你的 JWT>
Uid: <你的 24 位 uid>
Content-Type: application/json
```

- **鉴权用造梦次元「超级创作者」角色**(`ROLE_SUP_CREATOR`),需在造梦次元后台申请开通
- Token 从 https://dreama.ideaflow.pro 登录后 cookie 里取
- BFF 不发独立 API Key,复用现有账号身份即可

### 响应壳

所有接口返回统一格式:

```json
{
  "code": 0,
  "message": "ok",
  "data": { /* 各接口不同 */ },
  "requestId": "req_01H...",
  "serverTime": 1783100000000
}
```

- `code === 0` 才成功
- 失败 `code >= 4000`

### 错误码

| code | 含义 | 处理建议 |
|---|---|---|
| `4001` `AUTH_FAILED` | 未登录 / token 过期 / 无 `ROLE_SUP_CREATOR` | 重新登录 dreama.ideaflow.pro,或去后台开通超级创作者 |
| `4002` `DREAMA_TOKEN_INVALID` | 造梦次元下游拒绝 token | 同上 |
| `4003` `CONTENT_REJECTED` | 内容命中风控 | `details.rejected` 里是被拒的文本片段,人工改内容 |
| `4004` `BAD_REQUEST` | 参数校验失败 | 看 `message` 里 zod 报错定位 |
| `5001` `UPSTREAM_LLM_FAILED` | 生图上游失败 | `retryable=true` 直接重试 |
| `5002` `UPSTREAM_CYAPI_FAILED` | 造梦次元 cyapi 失败 | 看 `details.upstream` 排查 |
| `5000` `INTERNAL_SERVER_ERROR` | BFF 内部错 | 带上 `requestId` 找我们 |

## 完整示例

看 [../客户接入指南.md](../客户接入指南.md) —— 手把手一步一步演示,以及 [example-编程小屋.md](./example-编程小屋.md) —— 一个真跑通的作品完整参数。

## 版本历史

- **v2.0 · 2026-07-05** — 对外字段重构:砍掉 6 个内部字段、`character`→`personality`、`locution`→`speech_style`、`role_ids`→`main_role_id`+`supporting_role_ids`、`greetings`→`opening`、`aspect_ratio`→`size`、`tag_id`→`category`
- **v1.0 · 2026-07-04** — 首版上线
