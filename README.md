# flow-batch

**造梦次元内容批量生产 BFF** —— 一个薄封装服务,把造梦次元 Studio 编辑器建作品的 20+ 内部接口打包成 3 个对外接口,让内容制作方(或 AI Agent)能用简单结构化 JSON 一键建作品到审核队列。

> **业务背景**:造梦次元是 AI 虚拟角色互动内容平台,「青少年模式」需要批量生产非恋爱向内容。手动在 Studio 编辑器建 50 个作品每个都要拉数百个字段,本 BFF 把这层复杂度封装掉。

## 三个对外接口

| 路径 | 说明 |
|---|---|
| `POST /flow-batch/image` | 生图并转存到 `img.ideaflow.pro` 域名(Studio 只识别这个域名的图) |
| `POST /flow-batch/character` | 建角色:snowid → timbre → cartoon/save |
| `POST /flow-batch/flow` | 一键建作品:10 步下游流程,pipe/add → pipe/detail → workStudioSave → snowid 批量 → cartoon/detail → pipe/save(含 publish.log)→ pipe/update → initchat → 风控 → creator/submit |

对外接口 spec 见 `docs/api/`:[README](docs/api/README.md) / [character](docs/api/character.md) / [flow](docs/api/flow.md) / [image](docs/api/image.md) / [完整示例](docs/api/example-编程小屋.md)。手把手教程见 [接入指南](docs/接入指南.md)。

## 鉴权

**用造梦次元「超级创作者」角色鉴权,BFF 不持有 token,全透传下游。**

调用方每次调必须带:
- `Authorization`:造梦次元 JWT(`metatube-<jwt>`),JWT payload 里 `authorities` 必须含 `ROLE_SUP_CREATOR`
- `Uid`:调用方的 24 位长用户 id

BFF 层只做本地 JWT payload 解析(不做签名校验,因为下游 studio/cyapi 会自然校验真实性),有 `ROLE_SUP_CREATOR` 就放行。规范见 `~/backend/conventions/api-design.md` §「内部工具鉴权模式:超级创作者」。

**为什么不发独立 API Key**:超级创作者是造梦次元后台系统授予的内部人员身份标记,天然区分外人 vs 内部人员,不需要额外维护 key 白名单。

## 本地开发

```bash
pnpm install
cp .env.example .env  # 填 LLM_API_KEY(其他默认能跑)
pnpm dev
# 走本地校验:健康检查
curl http://localhost:3000/flow-batch/health
# 走真调用要带造梦次元 JWT:
curl -H "Authorization: metatube-<你的 JWT>" -H "Uid: <你的 uid>" \
     http://localhost:3000/flow-batch/health
```

## 部署

**已上 CI 自动部署** —— push 到 main 自动:pnpm test/build 门禁 → rsync 源码到 `ideaflow-tools` → docker compose build/up → 公网 curl `/health` 校验。

- 触发:`git push origin main` / 手动 `gh workflow run "Deploy to ideaflow-tools" --repo AmorErwanc/flow-batch`
- 服务器:火山云 `ideaflow-tools` / `/home/ubuntu/docker-services/flow-batch/`
- 域名:`https://tools.ideaflow.pro/flow-batch/*`,Caddy 反代到容器 `flow-batch:3000`
- 部署 workflow:`.github/workflows/deploy.yml`,依赖 repo secret `TOOLS_SERVER_SSH_KEY`

回滚:`git revert HEAD && git push` 会自动部署回上一版。

## 关键约定

- 技术栈跟 `~/backend/conventions/tech-stack.md` 对齐:Fastify 5 + zod v4 + pino + pino-loki + TypeScript ESM + pnpm
- 响应壳跟 dream-agent / mingle-api 同构,来自 `~/backend/shared/http-envelope/`
- 错误码用 `src/lib/errors.ts` 的 `BizError`,扩展了 BFF 特有的 `UPSTREAM_FAILED` 语义
- 部署位置跟 `~/.claude/docs/apis/internal-llm.md` 里的 llm-api 走同一套 SOP
- 维护者视角的 10 步下游流程 / 决策纪要:见 [docs/impl-notes.md](docs/impl-notes.md)
- Studio 建作品跨项目权威踩坑:`~/.claude/docs/apis/studio-authoring.md`
