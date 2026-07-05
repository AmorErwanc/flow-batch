# POST /flow-batch/character · 建角色

**用途**:一次调用建好角色,拿到 `character_id`(下一步建作品要用)。

## 请求

```bash
curl -X POST https://tools.ideaflow.pro/flow-batch/character \
  -H "Authorization: metatube-<JWT>" \
  -H "Uid: <你的 uid>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "阿凯",
    "gender": "男",
    "age": 45,
    "avatar_url": "https://img.ideaflow.pro/xxx.jpg",
    "banner_url": "https://img.ideaflow.pro/xxx.jpg",
    "summary": "退休软件工程师,喜欢用生活比喻教编程",
    "personality": "耐心温和,喜欢引导而不是直接给答案",
    "speech_style": "爱说\"来,我们一步一步来\",讲话慢,句尾常带笑意"
  }'
```

## 请求字段

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `name` | string | ✅ | - | 角色名,1~50 字 |
| `gender` | enum | ✅ | - | `"男"` / `"女"` / `"未知"` |
| `age` | number \| null | ✅ | - | 角色年龄,0~200,可传 `null` |
| `avatar_url` | string | ✅ | - | 头像 URL,**必须是 `img.ideaflow.pro` 域名**,用生图接口拿 |
| `banner_url` | string | ✅ | - | 形象图 URL,同上 |
| `summary` | string | ✅ | - | 一句人设简介,1~500 字 |
| `personality` | string | ✅ | - | 一段性格描述,1~500 字 |
| `speech_style` | string | ✅ | - | 一段说话习惯/口头禅描述,1~500 字 |
| `timbre_id` | string | ❌ | 按性别自动选默认音色 | 指定音色 id;不传 BFF 自动按性别拉一个默认音色 |

**BFF 内部固定处理**:头像/形象图默认标记为 AI 生成(合规必需),无需你传标记字段。

## 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "character_id": "000005084517024538345475"
  }
}
```

**注意**:`character_id` 是造梦次元后端**新分配**的 24 位雪花 id。保存这个 id,下一步建作品要传给 `main_role_id`。

## 常见错误

| code | 触发条件 | 排查 |
|---|---|---|
| `4001` `AUTH_FAILED` | 无 `ROLE_SUP_CREATOR` 权限 | 后台申请开通超级创作者 |
| `4004` `BAD_REQUEST` | 图片 URL 不是 `img.ideaflow.pro` 域名 / 字段超长 | 看 `message` 定位 |
| `5002` `UPSTREAM_CYAPI_FAILED` | 造梦次元 cyapi 拒绝 / 网络故障 | 看 `details.upstream` |
