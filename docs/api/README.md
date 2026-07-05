# flow-batch 对外接口目录

> **面向**:内容制作方(良维「青少年模式批量内容」等)
> **版本**:v2.0 · 2026-07-05

## 拿到这份 README 后先做什么

如果你现在就要开工,先按这个顺序准备:

1. **申请权限**:先在造梦次元后台开通「超级创作者」(`ROLE_SUP_CREATOR`)
2. **拿 header**:登录 `https://dreama.ideaflow.pro` 后,从浏览器里任意一个 dreama 请求直接复制 `Authorization` 和 `Uid` header
3. **先跑 1 个样例**:第一次联调只跑 1 个作品,按 `image → character → flow` 顺序走通
4. **先存草稿再提审**:`POST /flow-batch/flow` 第一次建议用 `publish=false`,确认 `studio_url` 里结构没问题再改成 `true`

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
- 最稳妥的拿法:登录 https://dreama.ideaflow.pro 后,从浏览器里任意一个 dreama 请求直接复制 `Authorization` 和 `Uid`
- BFF 不发独立 API Key,复用现有账号身份即可

### 响应壳

所有接口返回统一格式:

```json
{
  "code": 0,
  "message": "ok",
  "data": { /* 各接口不同 */ },
  "requestId": "req_01H...",
  "details": {},
  "retryable": false,
  "serverTime": 1783100000000
}
```

- `code === 0` 才成功
- 失败 `code >= 4000`
- **看两层信息**:
  - `code`: 大类错误(鉴权/参数/风控/下游/内部)
  - `details.errorCode`: 具体原因(例如 `DREAMA_TOKEN_INVALID`、`CONTENT_REJECTED`)

### 错误码

| 顶层 `code` | 常见 `details.errorCode` | 含义 | 处理建议 |
|---|---|---|---|
| `4001` | `DREAMA_TOKEN_MISSING` / `DREAMA_TOKEN_INVALID` | 没带 header、登录过期、或没有超级创作者权限 | 重新登录 dreama,重新复制 `Authorization` + `Uid`; 如果还是不行,找管理员开权限 |
| `4002` | `BAD_REQUEST` / `INVALID_ARGUMENT` | 参数格式不对 | 看 `details.issues` 或 `message`,按字段名改 |
| `4041` | `RESOURCE_NOT_FOUND` | 传入的角色 id 不存在 | 检查是不是把旧 id、别人的 id、或拼错的 24 位 id 传进来了 |
| `4291` | `CONTENT_REJECTED` | 文案命中风控 | 看 `details.rejected`,把命中的词句改成更中性、更青少年向的表达后重试 |
| `5001` | `INTERNAL_SERVER_ERROR` | BFF 自己报错 | 带上 `requestId` 找我们 |
| `5021` | `UPSTREAM_LLM_FAILED` / `UPSTREAM_CYAPI_FAILED` / `UPSTREAM_STUDIO_FAILED` | 下游服务失败 | 优先看 `retryable`; 为 `true` 时可直接重试,仍失败再带 `requestId` 反馈 |

## 完整示例

看 [../客户接入指南.md](../客户接入指南.md) —— 手把手一步一步演示,以及 [example-编程小屋.md](./example-编程小屋.md) —— 一个真跑通的作品完整参数。

## 版本历史

- **v2.0 · 2026-07-05** — 对外字段重构:砍掉 6 个内部字段、`character`→`personality`、`locution`→`speech_style`、`role_ids`→`main_role_id`+`supporting_role_ids`、`greetings`→`opening`、`aspect_ratio`→`size`、`tag_id`→`category`
- **v1.0 · 2026-07-04** — 首版上线
