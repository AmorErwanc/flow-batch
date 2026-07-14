# POST /flow-batch/image · 生图

**用途**:文生图 / 图生图,返回可直接用于建角色/作品的 CDN URL。

## 请求

```bash
curl -X POST https://tools.ideaflow.pro/flow-batch/image \
  -H "Authorization: metatube-<JWT>" \
  -H "Uid: <你的 uid>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "一位45岁老年男性退休程序员,戴老花镜,慈祥微笑,写实肖像照",
    "size": "2048x2048",
    "max_images": 1
  }'
```

## 请求字段

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `prompt` | string | ✅ | - | 生图描述,自然语言,1~2000 字 |
| `size` | string | ❌ | `"2048x2048"` | 图片尺寸,`"宽x高"` 或比例值格式;**seedream 只吃 `2048x2048`**;**gpt-image-2 只吃下方枚举**,传别的会被上游 400 |
| `max_images` | number | ❌ | `1` | 一次生几张,1~15(`gpt-image-2` 上游上限 10) |
| `reference_urls` | string[] | ❌ | - | 参考图 URL 数组(图生图用):seedream 上限 14 张,`gpt-image-2` 上限 10 张(超会被上游 400);URL 需公开可访问,推荐用本接口生成的 `img.ideaflow.pro` 域名图 |
| `model` | enum | ❌ | `"doubao-seedream-4.5"` | 生图模型:`"doubao-seedream-4.5"`(即梦,默认) / `"gpt-image-2"`(OpenAI GPT Image 2,多渠道兜底) |
| `call_type` | string | ❌ | - | 业务标签(如 `"batch-avatar"`),便于日志追溯;不影响作品内容 |

### `gpt-image-2` 支持的 size 枚举(11 组,比例值和像素值等价)

| 比例值 | 等价像素值 |
|---|---|
| `1:1` | `1024x1024` |
| `2:3` | `1024x1536` |
| `3:2` | `1536x1024` |
| `4:5` | `1024x1280` |
| `5:4` | `1280x1024` |
| `16:9` | `2048x1152` |
| `9:16` | `1152x2048` |
| `4:3` | `1536x1152` |
| `3:4` | `1152x1536` |
| `21:9` | `1792x768` |
| `9:21` | `768x1792` |

**选 gpt-image-2 时,`size` 必须传上表任一值**;比例值和像素值二选一,内部等价。传其他值(比如默认的 `2048x2048`)会被上游 400。

### `gpt-image-2` 专有可选字段(传给 seedream 会被忽略)

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `quality` | enum | `"medium"`(上游) | `"low"` / `"medium"` / `"high"` |
| `background` | enum | `"auto"`(上游) | `"auto"` / `"opaque"`;**不支持 `"transparent"`**,当前部署会 400 |
| `moderation` | enum | `"low"`(上游) | `"auto"` / `"low"` |
| `provider_channel` | enum | `"auto"` | 指定渠道:`"kapon"` / `"wuyin"` / `"aiclound"` / `"azure"` / `"azure:westus3"` / `"azure:polandcentral"` / `"azure:uaenorth"`;默认 `auto` 会按 `kapon → wuyin → aiclound → azure` 顺序自动兜底 |

**良维当前最小可用请求**:只传 `prompt`、`size`、`max_images` 就够了。其他字段可以先忽略。

## 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "image_urls": [
      "https://img.ideaflow.pro/flow-batch/000004550035214806040581/img-1783221965946-0-01kwr4zn3ts24a8qc0bgj84p6f.jpg"
    ],
    "elapsed_ms": 10438
  }
}
```

## 关键说明

**URL 必须是 `img.ideaflow.pro` 域名** —— BFF 已经内部把生图结果从 tools 域名转存到 img 域名了。造梦次元 Studio **只识别这个域名的图**,别拿别的域名 URL 去建角色/作品,会显示裂图。

## 模型选择建议

| 维度 | `doubao-seedream-4.5`(默认) | `gpt-image-2` |
|---|---|---|
| 出图速度 | 快(~10-15s / 张) | 慢(quality=low 也可能 3-5 分钟,high 可达十几分钟) |
| 参考图上限 | 14 张 | 10 张 |
| 尺寸格式 | 只吃像素值 `2048x2048`,非方形常 400 | 像素值或比例值(`16:9` / `2:3` 等)都吃 |
| 图生图触发 | 传 `reference_urls` 自动触发 | 传 `reference_urls` 自动切到 edits 路径 |
| 建议场景 | 量产、批量、对速度敏感 | 单张精修、需要 `quality=high` 或特定尺寸 |

**客户端超时**:调 `gpt-image-2` 请把超时至少放到 **20 分钟**(上游总预算),否则 `quality=high` 会经常客户端超时后端还在跑。

## 图生图示例(gpt-image-2 edits)

```bash
curl -X POST https://tools.ideaflow.pro/flow-batch/image \
  -H "Authorization: metatube-<JWT>" \
  -H "Uid: <你的 uid>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "给这只猫戴上一顶红色小毛线帽",
    "size": "1024x1024",
    "max_images": 1,
    "model": "gpt-image-2",
    "quality": "low",
    "reference_urls": [
      "https://img.ideaflow.pro/flow-batch/<uid>/img-xxx.jpg"
    ]
  }'
```

## 常见错误

| code | 触发条件 | 排查 |
|---|---|---|
| `4002` + `details.errorCode=BAD_REQUEST` | prompt 空 / size 格式错 / max_images 超限 | 看 `details.issues` 或 `message` 定位字段 |
| `5021` + `details.errorCode=UPSTREAM_LLM_FAILED` | 上游 llm-api 生图失败(限流/模型 500/超时) | `details.upstream` 里有原始错误;`retryable=true` 时直接重试 |
| `5021` + `details.errorCode=UPSTREAM_CYAPI_FAILED` | 转存到 `img.ideaflow.pro` 失败 | 先重试一次;仍失败就带 `requestId` 联系我们 |
