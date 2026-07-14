# flow-batch

造梦次元「青少年模式」内容批量生产 BFF。把 Studio 20+ 内部接口打包成 3 个对外接口(image / character / flow),让良维等内容制作方用简单 JSON 一键建作品到审核队列。

## 业务上下文（context-agent 接线）

- **开工先读**：`~/program/context-agent/knowledge/projects/青少年模式内容批量生成/dev-brief.md`——业务需求、技术拍板与硬约束的开发简报（权威源）。简报头部有更新日期；日期明显落后或找不到所需背景 → 读同目录 `README.md` 档案正本。
- **只读**：简报与档案由 context-agent 后台维护，本仓库会话不直接改。
- **回流**：开发中发现"需求做完了 / 接口改了 / 冒出新需求 / 档案与实际不符"→ 投一个 md 到 `~/program/context-agent/inbox/`（文件名带日期与项目名），晚间管线自动消化；Claude Code 会话可直接说"记一下"走 context-write skill。

完整项目规则见 [CLAUDE.md](CLAUDE.md)。
