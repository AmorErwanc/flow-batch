# flow-batch 实现纪要

> 面向 BFF 维护者（不是良维）。踩坑清单权威版在 `~/.claude/docs/apis/studio-authoring.md`，本文件是**项目特有决策 + 参考实现地图**。

## 一、10 步下游流程速览

```
1. cyapi/cutebox/snowid              → 预申请角色 id（后端会忽略，需 read 回真 id）
2. cyapi/cartoon/timbre?type=M|F     → 默认音色
3. cyapi/cartoon/save                → 建角色（response.data.id 才是真 id）
4. studio/pipe/add                   → 建作品壳
5. studio/pipe/detail                → 拿 globalAttrId（"特殊变量" attr）
6. cyapi/work/studio/save/{pipe_id}  → 登记 cyapi 主表
7. cyapi/cutebox/snowid?n=N          → 批量申请 chain/wrapper/attr 用的雪花
8. cyapi/cartoon/detail/{role_id}    → 主角 13 字段（builder 需要）
9. studio/pipe/save                  → 全量结构 + publish.log ⭐
10. cyapi/pipe/update                 → 补 cyapi 主表元信息
11. cyapi/pipe/initchat/{pipe_id}     → 生成初始 TTS
12. cyapi/risk/control/txt/batch      → 内容风控预检
13. cyapi/pipe/creator/submit/{id}    → 空 body 翻转状态
```

## 二、代码入口地图

| 位置 | 干什么 |
|---|---|
| `src/routes/{character,flow,image}.ts` | 对外 schema(external)+ 映射到内部 shape,route 层做输入边界收紧 |
| `src/routes/schema-helpers.ts` | 复用的 zod 校验器(如 `imgIdeaflowUrlSchema` 硬校验 img 域名) |
| `src/services/flow-service.ts` | 主编排(对应上面 10 步) |
| `src/services/pipe-save-builder.ts` | Save body 拼装(26 个私有函数) |
| `src/services/cyapi-client.ts` | 下游 HTTP 客户端(双域名分流 header,`applySnowIds` 自动拆批 50 个/批) |
| `src/services/image-service.ts` | 生图 + 转存 img 域名 |
| `src/services/character-service.ts` | 建角色 3 步 |
| `src/constants/studio-units.ts` | 8 个固定 unit_id + chainId 常量 |
| `src/http/middleware/dreama-auth.ts` | 超级创作者鉴权 |
| `src/logger.ts` | pino-loki 送 Loki(19 位纳秒时间戳 + `replaceTimestamp: false`,别改动) |

## 三、公司规范对齐

- **响应壳**：`~/backend/shared/http-envelope/`（跟 dream-agent / mingle-api 同构）
- **错误码**：`~/backend/shared/errors/`（本项目扩展了 `UPSTREAM_STUDIO_FAILED` / `UPSTREAM_CYAPI_FAILED` / `UPSTREAM_LLM_FAILED` / `DREAMA_TOKEN_INVALID` / `CONTENT_REJECTED`）
- **技术栈**：`~/backend/conventions/tech-stack.md`（Fastify 5 + zod v4 + TypeScript ESM + pnpm）
- **鉴权**：`~/backend/conventions/api-design.md §「内部工具鉴权模式：超级创作者」`

## 四、上游踩坑详见

见 `~/.claude/docs/apis/studio-authoring.md`（16 条踩坑清单）。

## 五、上游变动响应策略

如果造梦次元升级导致本 BFF 出错：

1. 用 `~/project/temp/flow-creation/test-run/` 里的手动脚本先复现（不走 BFF）
2. 抓包对比 UI 现在的调用，diff 出新字段
3. 更新 `pipe-save-builder.ts` 里的字段拼装
4. 更新 `~/.claude/docs/apis/studio-authoring.md` 的踩坑清单
5. 补 unit test（保证新场景不倒退）

## 六、e2e 冒烟

`scripts/e2e-smoke.mjs` — 一次跑完 3 接口验收，用法见脚本注释。

`publish: false` 模式不污染审核队列，安全跑；`publish: true` 会真提审进 mgmt 队列（1-2 天后审核团队会看到 `[E2E]` 前缀作品，主动清理或联系审核团队打招呼）。

## 七、对外 vs 内部字段(v2.0 refactor)

**策略**:route 层做 external → internal mapping,service / builder / 单测吃老 shape 完全不动。
每个 route 文件同时定义"对外 schema"(新字段)+ "内部 shape"(手写 interface,老字段名)。

字段映射速查:
- character:`personality` ↔ 内部 `character` / `speech_style` ↔ `locution` / 砍 `is_ai_gen`+`banner_is_ai`(内部固定填 1)
- flow:`main_role_id`+`supporting_role_ids` ↔ 内部 `role_ids` / `opening` ↔ `greetings`(`background` ↔ `system`)/ `category` ↔ `tag_id` / 砍 `user_id`(header 兜底)+`update_note`+`llm_config`
- image:`size` ↔ `aspect_ratio`

## 八、变更历史

- **2026-07-04** — PR#1-#7 骨架 + 骨架业务由 codex 补齐(fbcaaca)
- **2026-07-04** — fix pipeAdd 缺 pipe/detail(103ddd4)
- **2026-07-04** — fix 加 workStudioSave(534c2a7)
- **2026-07-05** — fix 加 publish.log + 雪花 id + constantGreetings(219a331)
- **2026-07-05** — 实测 mgmt 队列 `total=1`,全链路真跑通
- **2026-07-05** — 部署到 ideaflow-tools:daocloud mirror、app-net + party-monitoring 双挂、Caddy 走容器名 flow-batch:3000(45334d1)
- **2026-07-05** — v2.0 对外接口重构:字段名业务化 + 砍内部合规标记(9e02fd2)
- **2026-07-05** — route 层输入边界收紧:img 域名硬校验 / role_id 属集校验 / publish 前置校验(976df19)
- **2026-07-05** — docs 补 UX 降噪 + story/game 剧本骨架 + 前置踩坑(2caf8c1)
- **2026-07-05** — 加 docs/README.md 文档入口(26e7366)
- **2026-07-05** — preset_turns 支持到 50 轮(applySnowIds 拆批 50/批)+ category 收窄到 chat 单值(01e2f6b)
- **2026-07-05** — GitHub Actions 自动部署 + healthcheck IPv4 修复(f5d9700 / 7f86fc1)
- **2026-07-14** — /image 支持 `model` 字段(默认 `doubao-seedream-4.5`,可选 `gpt-image-2`);对外 schema 下线 `generation_mode`(gpt-image-2 上游不接受此字段);gpt-image-2 新增 `quality` / `background` / `moderation` / `provider_channel` 可选字段
