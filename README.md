# flow-batch

青少年模式内容批量生成 BFF —— 良维 AI 生成结构化内容 → 3 个接口一键建作品到造梦次元。

## 三个对外接口

| 路径 | 说明 |
|---|---|
| `POST /flow-batch/character` | 建角色（一次调 3 个下游：snowid → timbre → cartoon/save） |
| `POST /flow-batch/flow` | 一键建作品：pipe/add → pipe/save → pipe/update → initchat → risk-check → creator/submit（6 步）|
| `POST /flow-batch/image` | 生图并转存到 `img.ideaflow.pro` 域名（Studio 只识别这个域名的图） |

详细 spec 见 `docs/`（跟着项目 docs 走）。

## 鉴权

**用造梦次元「超级创作者」角色鉴权，BFF 不持有 token，全透传下游。**

调用方每次调必须带：
- `Authorization`：造梦次元 JWT（`metatube-<jwt>`），JWT payload 里 `authorities` 必须含 `ROLE_SUP_CREATOR`
- `Uid`：调用方的 24 位长用户 id

BFF 层只做本地 JWT payload 解析（不做签名校验，因为下游 studio/cyapi 会自然校验真实性），有 `ROLE_SUP_CREATOR` 就放行。规范见 `~/backend/conventions/api-design.md` §「内部工具鉴权模式：超级创作者」。

**为什么不发独立 API Key**：超级创作者是造梦次元后台系统授予的内部人员身份标记，天然区分外人 vs 内部人员，不需要额外维护 key 白名单。

## 本地开发

```bash
pnpm install
cp .env.example .env  # 改 BFF_API_KEYS
pnpm dev
curl -H "X-API-Key: dev-key-1" http://localhost:3000/flow-batch/health
```

## 部署

跑在 `ideaflow-tools`（火山 4h16g），域名 `tools.ideaflow.pro/flow-batch/*`，跟 llm-api 共用同一台机器。见 `Dockerfile` + `deploy/docker-compose.yml`。

## 关键约定

- 技术栈跟 `~/backend/conventions/tech-stack.md` 对齐：Fastify 5 + zod v4 + pino + pino-loki + TypeScript ESM + pnpm
- 响应壳跟 dream-agent / mingle-api 同构，来自 `~/backend/shared/http-envelope/`
- 错误码用 `src/lib/errors.ts` 的 `BizError`，扩展了 BFF 特有的 `UPSTREAM_FAILED` 语义
- 部署位置跟 `~/.claude/docs/apis/internal-llm.md` 里的 llm-api 走同一套 SOP
