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
| `size` | string | ❌ | `"2048x2048"` | 图片尺寸,`"宽x高"` 格式;**当前量产请统一传 `2048x2048`**,非方形在 Seedream 4.5 上经常直接 400 |
| `max_images` | number | ❌ | `1` | 一次生几张,1~15 |
| `reference_urls` | string[] | ❌ | - | 参考图 URL 数组(图生图用),最多 14 张 |
| `generation_mode` | enum | ❌ | - | `"single"` / `"set"`;纯文生图一般不用传 |
| `call_type` | string | ❌ | - | 业务标签(如 `"batch-avatar"`),便于日志追溯;不影响作品内容 |

**良维当前最小可用请求**:只传 `prompt`、`size`、`max_images` 就够了。后面 3 个字段可以先忽略。

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

## 常见错误

| code | 触发条件 | 排查 |
|---|---|---|
| `4002` + `details.errorCode=BAD_REQUEST` | prompt 空 / size 格式错 / max_images 超限 | 看 `details.issues` 或 `message` 定位字段 |
| `5021` + `details.errorCode=UPSTREAM_LLM_FAILED` | 上游 llm-api 生图失败(限流/模型 500/超时) | `details.upstream` 里有原始错误;`retryable=true` 时直接重试 |
| `5021` + `details.errorCode=UPSTREAM_CYAPI_FAILED` | 转存到 `img.ideaflow.pro` 失败 | 先重试一次;仍失败就带 `requestId` 联系我们 |
