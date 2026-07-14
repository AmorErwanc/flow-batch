# flow-batch · 项目规则

## 一句话定位

造梦次元「青少年模式」内容批量生产 BFF。把 Studio 20+ 内部接口打包成 3 个对外接口(image / character / flow),让良维等内容制作方用简单 JSON 一键建作品到审核队列。

## 硬边界规则(违反必踩坑)

- **对外 schema 只碰 route 层** — 不动 service / builder,那两层吃老 shape 让 40+ `payload.xxx` 引用点不用改。字段映射在 [docs/impl-notes.md §七](docs/impl-notes.md)。
- **对外新字段名是拍板过的** — `personality` / `speech_style` / `main_role_id` / `supporting_role_ids` / `opening` / `size` / `category`,不要随手改回老名。
- **图片 URL 必须 `img.ideaflow.pro` 域名** — Studio 只认这个域名。生图接口 BFF 已内部转存到这个域名,route 层还硬校验一次(`imgIdeaflowUrlSchema`),别绕过。
- **`opening[i].role_id` 必须在 `main_role_id` 或 `supporting_role_ids` 里** — route 层已强校验,别放松。
- **`publish=true` 时 `cover_url` 和 `summary` 必填** — 提审前置,route 层已校验。
- **`category` 当前只接 `chat`** — story/game 需造梦次元后端补真实分类 id 后才放开。别自作主张扩枚举。
- **`preset_turns` 上限 50 轮** — 内部 `applySnowIds` 拆批 50 个/批,50 是理论安全上限,别放到 100+。
- **pipe/save body 里 `publish.log` 是决定性字段** — 缺它作品不进 mgmt 审核队列(`total=0`),别删。
- **提审专用字段不能加到"存草稿"路径** — `body.publish` 只在 `input.publish=true` 时才带,否则会异常。
- **敏感信息(LLM_API_KEY)只进服务器 `.env`** — 不进 code / docs / commit / .env.example。

## 部署方式

**已上 GitHub Actions 自动部署**。push main 触发:pnpm test/build → rsync 到 ideaflow-tools → docker rebuild → 公网 curl `/health` 验证。**不要手动 rsync/docker 操作服务器**,统一走 CI(除非 CI 挂了要救火)。

- 触发:`git push origin main` / 手动 `gh workflow run "Deploy to ideaflow-tools"`
- 回滚:`git revert HEAD && git push`
- Workflow:`.github/workflows/deploy.yml`
- 服务器:`ubuntu@118.145.159.156:/home/ubuntu/docker-services/flow-batch/`
- 域名:`https://tools.ideaflow.pro/flow-batch/*`

## 常用命令

```bash
pnpm test          # 32/32 单测(改 route/service/schema 前后必跑)
pnpm build         # typecheck(等价 tsc)
pnpm dev           # 本地 dev server,localhost:3000
# 真 e2e(生产,publish=false 不污染队列):
node scripts/e2e-smoke.mjs   # 需 FLOW_BATCH_BASE / DREAMA_JWT / DREAMA_UID
```

## 深入文档指针

| 想知道 | 去哪 |
|---|---|
| 良维怎么接入 3 接口 | [docs/接入指南.md](docs/接入指南.md) |
| 单接口紧凑 spec | [docs/api/](docs/api/) |
| 一个完整作品的所有参数 | [docs/api/example-编程小屋.md](docs/api/example-编程小屋.md) |
| 10 步下游流程 + 代码入口地图 + 变更历史 | [docs/impl-notes.md](docs/impl-notes.md) |
| Studio 建作品跨项目权威踩坑(16 条) | `~/.claude/docs/apis/studio-authoring.md` |
| 造梦次元 cyapi 接口速查 | `~/.claude/docs/apis/company-zmcy.md` |
| 服务器 / Docker / Caddy 全景 | `~/.claude/docs/infra/server-ideaflow-tools.md` |

## 上游变动响应

造梦次元 Studio 升级导致 BFF 挂了 → 见 [docs/impl-notes.md §五](docs/impl-notes.md) 的响应策略(用 `~/project/temp/flow-creation/test-run/` 手动脚本复现 → 抓包 diff → 改 pipe-save-builder → 更新全局踩坑清单 → 补单测)。

## 业务上下文（context-agent 接线）

- **开工先读**：`~/program/context-agent/knowledge/projects/青少年模式内容批量生成/dev-brief.md`——业务需求、技术拍板与硬约束的开发简报（权威源）。简报头部有更新日期；日期明显落后或找不到所需背景 → 读同目录 `README.md` 档案正本。
- **只读**：简报与档案由 context-agent 后台维护，本仓库会话不直接改。
- **回流**：开发中发现"需求做完了 / 接口改了 / 冒出新需求 / 档案与实际不符"→ 投一个 md 到 `~/program/context-agent/inbox/`（文件名带日期与项目名），晚间管线自动消化；Claude Code 会话可直接说"记一下"走 context-write skill。
