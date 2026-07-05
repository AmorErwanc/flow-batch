# POST /flow-batch/flow · 一键建作品 ⭐

**用途**:一次调用完成"建作品壳 → 保存内容结构 → 更新元信息 → 生成初始 TTS → 内容风控 → 提审"6 步,拿到 `pipe_id`,可选自动提审进审核队列。

## 请求

```bash
curl -X POST https://tools.ideaflow.pro/flow-batch/flow \
  -H "Authorization: metatube-<JWT>" \
  -H "Uid: <你的 uid>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "编程小屋",
    "cover_url": "https://img.ideaflow.pro/xxx.png",
    "summary": "放学后走进一家旧书店,遇到退休程序员阿凯",
    "main_role_id": "000005084517024538345475",
    "opening": [
      { "type": "background", "title": "背景介绍", "content": "放学后你在小区角落发现了一家旧书店" },
      { "type": "narration", "content": "推开门,木门发出吱呀一声" },
      {
        "type": "role",
        "role_id": "000005084517024538345475",
        "content": "哟,小朋友来找书?",
        "user_btns": ["我想学编程", "我随便看看", "有游戏推荐吗"]
      }
    ],
    "preset_turns": [
      {
        "reply": "呀,你想学编程?好方向哦。你在学校最喜欢哪门课?",
        "buttons": ["数学", "语文", "英语", "科学", "体育"]
      },
      {
        "reply": "哦~那你是喜欢琢磨事情的类型。",
        "buttons": ["琢磨什么?", "怎么开始?", "有点意思"]
      }
    ],
    "story": {
      "background": "退休工程师在旧书店里教中学生理解编程思维,内容健康向上,避免恋爱/暴力/猎奇"
    },
    "category": "chat",
    "publish": true
  }'
```

## 请求字段(顶层)

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `name` | string | ✅ | - | 作品名,1~100 字 |
| `cover_url` | string | ❌ | - | 封面 URL(必须 `img.ideaflow.pro` 域名);**不传作品封面缺失,审核过不了** |
| `summary` | string | ❌ | - | 作品简介,1~500 字 |
| `main_role_id` | string | ✅ | - | 主角 id(24 位雪花,建角色接口返回的 `character_id`) |
| `supporting_role_ids` | string[] | ❌ | `[]` | 配角 id 数组,最多 9 个 |
| `opening` | array | ✅ | - | 开场剧本,**1~10 段**(3 种 type,见下) |
| `preset_turns` | array | ❌ | `[]` | 预设对话轮,**当前安全上限 9 轮**(见下) |
| `story` | object | ✅ | - | AI 自由对话设定(见下) |
| `category` | enum | ❌ | `"chat"` | `"chat"` / `"story"` / `"game"` 三选一;**良维当前量产建议固定传 `"chat"`** |
| `publish` | boolean | ❌ | `true` | `true` = 自动提审进审核队列;`false` = 只存草稿 |

## `opening[i]` 三种 type

**A. 背景交代(灰色小卡片,不带角色不带按钮)**

```json
{ "type": "background", "title": "背景介绍", "content": "..." }
```

- `title` 可选,不传默认"背景介绍"
- 常用于交代时间/地点/关系

**B. 环境旁白(一句描述文字,不带角色不带按钮)**

```json
{ "type": "narration", "content": "..." }
```

- 常用于场景描写(推开门/风吹过)

**C. 角色说话(带按钮)**

```json
{
  "type": "role",
  "role_id": "<必须在 main_role_id 或 supporting_role_ids 里>",
  "content": "角色说的话",
  "user_btns": ["按钮1", "按钮2", "..."]
}
```

- `user_btns` 可选,最多 20 个
- 按钮点哪个都走**同一路径**(造梦次元本身不做真分支,只是给玩家一个"我参与了"的感觉)
- `role_id` 必须是本作品用到的角色 id
- 如果这里引用的是配角,记得先把它放进 `supporting_role_ids`
- 如果你根本不需要“点一下按钮再继续”的体验,`user_btns` 可以不传

## `preset_turns[i]`(可选,预设对话轮)

```json
{ "reply": "角色的预设回复", "buttons": ["选项1", "选项2"] }
```

| 字段 | 说明 |
|---|---|
| `reply` | 主角(`main_role_id` 的角色)说的话,1~1000 字 |
| `buttons` | 用户可点按钮,**1~20 个** |

**用途**:让作品开头几轮有"确定引导感",别一上来就 AI 满地跑。跑完所有预设轮后,进入 AI 剧情模式。

**当前上限提醒**:单个作品现在请控制在 **9 轮以内**。再往上不是文案问题,而是建作品过程中会触发下游雪花 id 数量上限。

## `story`(AI 自由对话设定)

```json
{
  "background": "退休工程师在旧书店里教中学生理解编程思维,内容健康向上,避免恋爱/暴力/猎奇"
}
```

| 字段 | 说明 |
|---|---|
| `background` | 剧情背景 / 世界观 / 内容尺度约束,1~2000 字 |

**AI 参数(温度/top_p/max_tokens)由 BFF 内部按业务场景调好默认**,你不用传。

你可以把 `story.background` 理解成:"预设几轮结束后,AI 接下来要按照什么世界观、语气和边界继续聊。"

## 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "pipe_id": "000005084517211704967170",
    "publish_status": "submitted",
    "studio_url": "https://studio.ideaflow.pro/pipe.html?pipe_id=000005084517211704967170"
  }
}
```

| 字段 | 说明 |
|---|---|
| `pipe_id` | 24 位雪花作品 id,后续可以拿它查状态 |
| `publish_status` | `"submitted"` = 已提审(`publish=true`)/ `"draft"` = 只存草稿 |
| `studio_url` | 打开可查看作品结构(方便你自检) |

**建议**:每次建完立刻打开 `studio_url` 检查一遍,确认开场白/预设/AI 背景都对了再进入下一个。

## 常见错误

| code | 触发条件 | 排查 |
|---|---|---|
| `4001` + `details.errorCode=DREAMA_TOKEN_INVALID` | 无 `ROLE_SUP_CREATOR` 权限 / 登录过期 | 重新登录后复制新 header,或后台开通超级创作者 |
| `4002` + `details.errorCode=BAD_REQUEST` | 字段校验失败 / `preset_turns` 超过当前可支持上限 | 看 `details.issues` 或 `message`; 预设轮请控制在 9 轮以内 |
| `4041` + `details.errorCode=RESOURCE_NOT_FOUND` | `main_role_id` 不存在 | 检查是不是用了旧 id、别人的 id、或拼错的 24 位 id |
| `4291` + `details.errorCode=CONTENT_REJECTED` | 内容命中风控 | `details.rejected` 里是命中的文本片段,把句子改得更中性、更青少年向 |
| `5021` + `details.errorCode=UPSTREAM_CYAPI_FAILED` / `UPSTREAM_STUDIO_FAILED` | 造梦次元 cyapi / studio 拒绝 | 看 `retryable`; 可重试时先重试,仍失败就带 `requestId` 联系我们 |

## 注意事项

1. **`publish=true` 就真进审核队列了**。测试时用 `publish=false`,验证作品结构 OK 再改回 `true` 提审。
2. **审核队列索引有几分钟延迟** —— 提审后立刻查后台可能 total=0,不代表失败,等 3-5 分钟。
3. **风控是提审前必过的**,`publish=false` 时不会跑风控;`true` 时才会。
4. **如果你现在做的是良维这类批量聊天作品,`category` 最稳妥的选法就是固定传 `chat`。**
