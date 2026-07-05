# 完整示例:编程小屋(一个已跑通的作品的所有请求参数)

> **来源**:2026-07-05 e2e 冒烟真跑通、真进审核队列的作品
> **在线查看**:https://studio.ideaflow.pro/pipe.html?pipe_id=000005084427993708265476
> **产物 pipe_id**:`000005084427993708265476`(该次 `publish=true`,真提审)
> **产物 character_id(阿凯)**:`000005084427808135495680`

## 通用 header

三个接口都用同一套 header:

```
Authorization: metatube-<你的 JWT>
Uid: 000004550035214806040581
Content-Type: application/json
```

## Base URL

```
https://tools.ideaflow.pro/flow-batch
```

## 5 步一体的完整流程

```
生头像(image) ┐
生形象图(image) ┼─→ 建角色(character) ──┐
生封面(image) ────────────────────────────┴─→ 建作品(flow) ─→ 审核队列
```

---

## 第 1 步:生成角色头像

`POST /image`

### 请求

```json
{
  "prompt": "一位45岁老年男性退休程序员,戴老花镜,慈祥微笑,浅蓝色格子衬衫,写实肖像照",
  "size": "2048x2048",
  "max_images": 1,
  "call_type": "e2e-smoke-avatar"
}
```

### 响应

```json
{
  "code": 0,
  "data": {
    "image_urls": [
      "https://img.ideaflow.pro/flow-batch/000004550035214806040581/img-1783221965946-0-01kwr4zn3ts24a8qc0bgj84p6f.jpg"
    ],
    "elapsed_ms": 10438
  }
}
```

拿到的 URL 记为 `avatar_url`。

---

## 第 2 步:生成角色形象图

`POST /image`

```json
{
  "prompt": "一位45岁老年男性退休程序员,戴老花镜,站在旧书店里,四周是编程书籍,温暖橘色灯光,写实全身照",
  "size": "2048x2048",
  "max_images": 1,
  "call_type": "e2e-smoke-banner"
}
```

拿到的 URL 记为 `banner_url`。

---

## 第 3 步:创建角色(阿凯)

`POST /character`

### 请求

```json
{
  "name": "[E2E] 阿凯 - 1783221978755",
  "gender": "男",
  "age": 45,
  "avatar_url": "https://img.ideaflow.pro/flow-batch/000004550035214806040581/img-1783221965946-0-01kwr4zn3ts24a8qc0bgj84p6f.jpg",
  "banner_url": "https://img.ideaflow.pro/flow-batch/000004550035214806040581/img-1783221976566-0-01kwr4zzfpzfemdq1fzsd8s45p.jpg",
  "summary": "退休软件工程师,喜欢用生活比喻教编程",
  "personality": "耐心温和,喜欢引导而不是直接给答案",
  "speech_style": "爱说\"来,我们一步一步来\",讲话慢,句尾常带笑意"
}
```

### 响应

```json
{
  "code": 0,
  "data": {
    "character_id": "000005084427808135495680"
  }
}
```

**保存 `character_id`,下一步建作品要用**。

---

## 第 4 步:生成作品封面

`POST /image`

```json
{
  "prompt": "旧书店门口的场景,木招牌上写着「编程小屋」四字,温暖光线,写实风格",
  "size": "2048x2048",
  "max_images": 1,
  "call_type": "e2e-smoke-cover"
}
```

拿到的 URL 记为 `cover_url`。

---

## 第 5 步:一键建作品 ⭐

`POST /flow`

### 请求

```json
{
  "name": "[E2E-TEST] 编程小屋 - 2026-07-05",
  "cover_url": "https://img.ideaflow.pro/flow-batch/000004550035214806040581/img-1783221987807-0-01kwr50aezmyp1chvb71kdc6q0.jpg",
  "summary": "放学后走进一家旧书店,遇到退休程序员阿凯",
  "main_role_id": "000005084427808135495680",
  "opening": [
    {
      "type": "background",
      "title": "背景介绍",
      "content": "放学后你在小区角落发现了一家旧书店"
    },
    {
      "type": "narration",
      "content": "推开门,木门发出吱呀一声"
    },
    {
      "type": "role",
      "role_id": "000005084427808135495680",
      "content": "哟,小朋友来找书?",
      "user_btns": ["我想学编程", "我随便看看", "这里有游戏推荐吗"]
    }
  ],
  "preset_turns": [
    {
      "reply": "呀,你想学编程?好方向哦。你在学校最喜欢哪门课?",
      "buttons": ["数学", "语文", "英语", "科学", "体育"]
    },
    {
      "reply": "哦~那你是喜欢琢磨事情的类型。编程就是琢磨事情。",
      "buttons": ["琢磨什么?", "怎么开始?", "有点意思", "听着抽象"]
    }
  ],
  "story": {
    "background": "退休工程师在旧书店里教中学生理解编程思维,内容健康向上,避免任何恋爱/暴力/猎奇"
  },
  "category": "chat",
  "publish": true
}
```

### 响应

```json
{
  "code": 0,
  "data": {
    "pipe_id": "000005084427993708265476",
    "publish_status": "submitted",
    "studio_url": "https://studio.ideaflow.pro/pipe.html?pipe_id=000005084427993708265476"
  }
}
```

打开 `studio_url` 立刻能看到作品完整结构。

---

## 批量生 N 个的调用模式

**每 1 个作品 = 5 次调用**(3 张图 + 1 个角色 + 1 个作品)。

生 50 个只是把这套模板套 50 次,每次换:
- 3 段 prompt(头像/形象图/封面)
- 1 组角色人设(name/personality/speech_style/summary)
- 1 组开场剧本 + N 轮预设 + AI 剧情背景

建议:
- 前 5 个手动跑一遍,打开 `studio_url` 验证结构对
- 用 `publish: false` 生成草稿,人工审后再改成 `true` 提审
- 批量时并发不超过 3(生图上游有限流)

---

## 如果你要做 `story` 类型,可以直接改这份模板

下面是一个**可直接套用的 `/flow` 请求体模板**。角色创建、图片生成的步骤不变,只换作品主题和 `category`。

**提醒**:这里主要是给你一个"JSON 该怎么写"的模板。良维当前量产如果没有额外业务约定,最稳妥的 `category` 依然是 `chat`。

```json
{
  "name": "图书馆夜巡队",
  "cover_url": "<你的 cover_url>",
  "summary": "放学后的校园图书馆里,你和值班管理员一起排查奇怪的借书线索",
  "main_role_id": "<你的 character_id>",
  "opening": [
    {
      "type": "background",
      "title": "背景介绍",
      "content": "傍晚的图书馆快关门了,管理员把一本没有借阅记录的旧书递给你。"
    },
    {
      "type": "role",
      "role_id": "<你的 character_id>",
      "content": "今晚想不想跟我一起查清这本书是从哪来的?",
      "user_btns": ["想", "先看看书", "图书馆里安全吗?"]
    }
  ],
  "preset_turns": [
    {
      "reply": "别紧张,我们只是查线索,不会碰危险的事。",
      "buttons": ["先看封面", "查借阅台账", "问问保安"]
    }
  ],
  "story": {
    "background": "校园图书馆夜间巡查故事,强调观察、推理、合作,避免恋爱、暴力、惊悚猎奇。"
  },
  "category": "story",
  "publish": false
}
```

适合场景:
- 剧情探索
- 校园成长
- 轻悬念但不惊悚

---

## 如果你要做 `game` 类型,可以直接改这份模板

下面这个模板更适合"闯关 / 任务 / 选择题"感受,但**按钮依然不会分真实支线**,只是让用户有参与感。

**提醒**:这里同样主要是字段模板。如果你只是批量做当前这类聊天作品,继续用 `category: "chat"` 会更稳。

```json
{
  "name": "社团任务挑战",
  "cover_url": "<你的 cover_url>",
  "summary": "你加入校园创意社后,需要和社长一起完成一连串小任务",
  "main_role_id": "<你的 character_id>",
  "opening": [
    {
      "type": "background",
      "title": "任务说明",
      "content": "今天的社团任务共有三关:找材料、做展示、回答评委提问。"
    },
    {
      "type": "role",
      "role_id": "<你的 character_id>",
      "content": "准备好了没?我们先从第一关开始。",
      "user_btns": ["准备好了", "先听规则", "我有点紧张"]
    }
  ],
  "preset_turns": [
    {
      "reply": "第一关是选材料。别担心,我会陪你一起判断。",
      "buttons": ["选轻便材料", "选耐用材料", "先看任务书"]
    },
    {
      "reply": "很好,第二关我们要把思路讲清楚。",
      "buttons": ["我来开头", "你先示范", "先列重点"]
    }
  ],
  "story": {
    "background": "校园社团任务闯关,强调合作、表达、解决问题,避免任何成人化、暴力、危险惩罚。"
  },
  "category": "game",
  "publish": false
}
```

适合场景:
- 闯关任务
- 社团活动
- 轻互动挑战
