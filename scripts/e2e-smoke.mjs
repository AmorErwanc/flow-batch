// e2e 冒烟 · 一次调完 3 个接口，验收 flow-batch 部署是否可用
//
// 用法：
//   export FLOW_BATCH_BASE=https://tools.ideaflow.pro/flow-batch
//   export DREAMA_JWT='metatube-<你的 JWT>'
//   export DREAMA_UID='<你的 24 位 uid>'
//   node scripts/e2e-smoke.mjs
//
// 或本地开发：
//   export FLOW_BATCH_BASE=http://localhost:3000/flow-batch
//   ...

const BASE = process.env.FLOW_BATCH_BASE
const JWT = process.env.DREAMA_JWT
const UID = process.env.DREAMA_UID

if (!BASE || !JWT || !UID) {
  console.error('❌ 需要环境变量 FLOW_BATCH_BASE / DREAMA_JWT / DREAMA_UID')
  process.exit(1)
}

const H = {
  Authorization: JWT,
  Uid: UID,
  'Content-Type': 'application/json',
}

async function post(path, body) {
  const resp = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(body),
  })
  const data = await resp.json().catch(() => ({ raw: '<not json>' }))
  console.log(`POST ${path}\n  → ${resp.status} ${JSON.stringify(data).slice(0, 400)}`)
  if (data.code !== 0) {
    throw new Error(`${path} 失败: code=${data.code} msg=${data.message}`)
  }
  return data.data
}

async function get(path) {
  const resp = await fetch(`${BASE}${path}`, { headers: H })
  const data = await resp.json().catch(() => ({ raw: '<not json>' }))
  console.log(`GET  ${path}\n  → ${resp.status} ${JSON.stringify(data).slice(0, 200)}`)
  return data
}

async function main() {
  console.log(`\n===== 0. health check =====`)
  await get('/health')

  console.log(`\n===== 1. 生图（阿凯头像）=====`)
  const avatarResp = await post('/image', {
    prompt: '一位45岁老年男性退休程序员，戴老花镜，慈祥微笑，浅蓝色格子衬衫，写实肖像照',
    aspect_ratio: '2048x2048',
    max_images: 1,
    call_type: 'e2e-smoke-avatar',
  })
  const avatarUrl = avatarResp.image_urls[0]
  console.log(`  ✅ avatar: ${avatarUrl}`)

  console.log(`\n===== 2. 生图（阿凯形象图）=====`)
  const bannerResp = await post('/image', {
    prompt: '一位45岁老年男性退休程序员，戴老花镜，站在旧书店里，四周是编程书籍，温暖橘色灯光，写实全身照',
    aspect_ratio: '2048x2048',
    max_images: 1,
    call_type: 'e2e-smoke-banner',
  })
  const bannerUrl = bannerResp.image_urls[0]
  console.log(`  ✅ banner: ${bannerUrl}`)

  console.log(`\n===== 3. 建角色（阿凯）=====`)
  const roleResp = await post('/character', {
    name: `[E2E] 阿凯 - ${Date.now()}`,
    gender: '男',
    age: 45,
    avatar_url: avatarUrl,
    banner_url: bannerUrl,
    summary: '退休软件工程师，喜欢用生活比喻教编程',
    character: '耐心温和，喜欢引导而不是直接给答案',
    locution: '爱说"来，我们一步一步来"，讲话慢，句尾常带笑意',
    is_ai_gen: 1,
    banner_is_ai: 1,
  })
  const roleId = roleResp.character_id
  console.log(`  ✅ role_id: ${roleId}`)

  console.log(`\n===== 4. 生图（作品封面）=====`)
  const coverResp = await post('/image', {
    prompt: '旧书店门口的场景，木招牌上写着「编程小屋」四字，温暖光线，写实风格',
    aspect_ratio: '2048x2048',
    max_images: 1,
    call_type: 'e2e-smoke-cover',
  })
  const coverUrl = coverResp.image_urls[0]
  console.log(`  ✅ cover: ${coverUrl}`)

  console.log(`\n===== 5. 一键建作品（2 轮预设 + 剧情模式，草稿模式不提审）=====`)
  const flowResp = await post('/flow', {
    user_id: UID,
    name: `[E2E-TEST] 编程小屋 - ${new Date().toISOString().slice(0, 10)}`,
    cover_url: coverUrl,
    summary: '放学后走进一家旧书店，遇到退休程序员阿凯',
    role_ids: [roleId],
    greetings: [
      { type: 'system', title: '背景介绍', content: '放学后你在小区角落发现了一家旧书店' },
      { type: 'narration', content: '推开门，木门发出吱呀一声' },
      {
        type: 'role',
        role_id: roleId,
        content: '哟，小朋友来找书？',
        user_btns: ['我想学编程', '我随便看看', '这里有游戏推荐吗'],
      },
    ],
    preset_turns: [
      {
        reply: '呀，你想学编程？好方向哦。你在学校最喜欢哪门课？',
        buttons: ['数学', '语文', '英语', '科学', '体育'],
      },
      {
        reply: '哦～那你是喜欢琢磨事情的类型。编程就是琢磨事情。',
        buttons: ['琢磨什么？', '怎么开始？', '有点意思', '听着抽象'],
      },
    ],
    story: {
      background: '退休工程师在旧书店里教中学生理解编程思维，内容健康向上，避免任何恋爱/暴力/猎奇',
      llm_config: { temperature: 1, top_p: 0.7, max_tokens: 1024 },
    },
    publish: false,   // e2e 用 draft，不污染审核队列
  })

  console.log(`\n🎉 E2E 冒烟通过！`)
  console.log(`  pipe_id      = ${flowResp.pipe_id}`)
  console.log(`  publish      = ${flowResp.publish_status}`)
  console.log(`  studio_url   = ${flowResp.studio_url}`)
  console.log(`\n  打开 studio_url 确认作品结构（应该有阿凯头像 + 书店背景 + 8 按钮开场白 + 2 轮预设 + 剧情模式）`)
}

main().catch((err) => {
  console.error(`\n❌ 冒烟失败：${err.message}`)
  process.exit(1)
})
