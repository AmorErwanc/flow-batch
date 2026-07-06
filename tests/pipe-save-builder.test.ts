import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreateFlowInput } from '../src/routes/flow.js'
import type { CartoonDetail } from '../src/services/cyapi-client.js'
import { buildStudioSaveBody } from '../src/services/pipe-save-builder.js'

const ROLE_ID = '000005050038131848937472'
const PIPE_ID = '000005081734685198434306'
const GLOBAL_ATTR_ID = '000005081734685198434307'
const NOW = 1783100000000

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  expect(isRecord(value)).toBe(true)
  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  expect(Array.isArray(value)).toBe(true)
  return value as unknown[]
}

function buildInput(): CreateFlowInput {
  return {
    user_id: '000004550035214806040581',
    name: '三轮预设测试作品',
    cover_url: 'https://img.ideaflow.pro/flow-batch/cover.png',
    summary: '三轮预设后进入剧情模式',
    role_ids: [ROLE_ID],
    greetings: [
      { type: 'system', title: '背景介绍', content: '你在一间旧书店里。' },
      { type: 'narration', content: '木门轻轻响了一声。' },
      { type: 'role', role_id: ROLE_ID, content: '来，我们一步一步来。', user_btns: ['我想学编程', '我先看看'] },
    ],
    preset_turns: [
      { reply: '先想一个你想让电脑完成的小任务。', buttons: ['做一个闹钟', '做一个小游戏'] },
      { reply: '很好，把它拆成三步会更容易。', buttons: ['怎么拆？', '我试试看'] },
      { reply: '如果卡住，就把问题说得更小一点。', buttons: ['明白了'] },
    ],
    story: {
      background: '退休工程师在旧书店里教中学生理解编程思维，内容健康向上。',
      llm_config: { model: 'ep-test', temperature: 1, top_p: 0.7, max_tokens: 1024 },
    },
    tag_id: '000003882999195270660097',
    publish: false,
  }
}

function buildRole(): CartoonDetail {
  return {
    id: ROLE_ID,
    name: '阿凯',
    avatar: 'https://img.ideaflow.pro/flow-batch/avatar.png',
    banner: 'https://img.ideaflow.pro/flow-batch/banner.png',
    gender: '男',
    timbreId: '000004370226094151352320',
    timbreVal: 'c_akai',
    timbreAudio: 'https://img.ideaflow.pro/flow-batch/voice.mp3',
    character: '耐心温和',
    locution: '善于用生活比喻讲清楚问题',
    age: 45,
    type: 'normal',
  }
}

describe('pipe-save-builder', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('按 3 轮预设生成 studio pipe/save body', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    // 3 轮预设需要 3*4 + 15 = 27 个雪花 id
    const snowIds = Array.from({ length: 27 }, (_, i) =>
      `0000050837${String(i).padStart(14, '0')}`,
    )
    const body = buildStudioSaveBody({
      pipeId: PIPE_ID,
      globalAttrId: GLOBAL_ATTR_ID,
      payload: buildInput(),
      mainRoleDetail: buildRole(),
      userId: '000004550035214806040581',
      snowIds,
    })

    const pipe = asRecord(body.data.pipe)
    const wrapperJson = asRecord(pipe.wrapper_json)
    const storyChain = Object.values(body.data.chain).map(asRecord).find((chain) => chain.name === '剧情模式')
    expect(storyChain).toBeDefined()

    expect(Object.keys(body.data.chain)).toHaveLength(13)
    expect(Object.keys(body.data.wrapper)).toHaveLength(12)
    expect(Object.keys(body.data.attr)).toHaveLength(2)
    expect(asArray(pipe.out_param)).toHaveLength(4)

    expect(body.data._WID).toBe(GLOBAL_ATTR_ID)
    expect(body.data.attr[GLOBAL_ATTR_ID]).toBeDefined()
    expect(wrapperJson.id).toBe(GLOBAL_ATTR_ID)
    expect(JSON.stringify(body.data.wrapper)).toContain(`"id":"${GLOBAL_ATTR_ID}"`)

    expect(pipe.cartoon_id).toBe(ROLE_ID)
    expect(JSON.stringify(wrapperJson.greetings)).toContain(ROLE_ID)
    expect(JSON.stringify(storyChain)).toContain(ROLE_ID)

    // 良维 2026-07-06 反馈:开场里角色说话段 + preset_turns 每轮 reply 默认开朗读,
    // 背景/旁白/AI 自由对话段不开。
    const readFlags = (bubbles: unknown[]): boolean[] =>
      bubbles.map((bubble) => {
        const contentArr = asArray(asRecord(bubble).content)
        const subs = contentArr.flatMap((c) => asArray(asRecord(c).sub))
        return subs.some((sub) => asRecord(sub).inName === 'read' && asRecord(sub).val === true)
      })

    const greetings = asArray(wrapperJson.greetings)
    // 输入顺序:system / narration / role → 只有 role 段开朗读
    expect(readFlags(greetings)).toEqual([false, false, true])

    // out_param 顺序:3 段 preset_turns + 1 段 dynamic(AI 自由对话)→ 只有 preset 段开朗读
    expect(readFlags(asArray(pipe.out_param))).toEqual([true, true, true, false])

    const storyInParam = asArray(storyChain?.in_param)
    const initChatParam = storyInParam.map(asRecord).find((item) => item.inName === 'initChat')
    expect(initChatParam).toBeDefined()
    const initChat = JSON.parse(String(initChatParam?.val)) as unknown
    expect(JSON.stringify(initChat)).toContain('|<阿凯&男>|')
    expect(JSON.stringify(initChat)).toContain('我想学编程')

    expect({
      top: { user_id: body.user_id, owner_id: body.owner_id, time: body.time, hash: body.hash },
      pipe: {
        id: pipe.id,
        cartoon_id: pipe.cartoon_id,
        name: pipe.name,
        cover: pipe.cover,
        summary: pipe.summary,
        summary_markup: pipe.summary_markup,
        start_chain_id: pipe.start_chain_id,
      },
      counts: {
        chain: Object.keys(body.data.chain).length,
        wrapper: Object.keys(body.data.wrapper).length,
        attr: Object.keys(body.data.attr).length,
        out_param: asArray(pipe.out_param).length,
      },
      story: {
        sort_num: storyChain?.sort_num,
        unit_id: storyChain?.unit_id,
        initChat: initChatParam?.val,
      },
      wrappers: Object.values(body.data.wrapper).map((wrapper) => asRecord(wrapper).name),
    }).toMatchInlineSnapshot(`
      {
        "counts": {
          "attr": 2,
          "chain": 13,
          "out_param": 4,
          "wrapper": 12,
        },
        "pipe": {
          "cartoon_id": "000005050038131848937472",
          "cover": "https://img.ideaflow.pro/flow-batch/cover.png",
          "id": "000005081734685198434306",
          "name": "三轮预设测试作品",
          "start_chain_id": "000005083700000000000000",
          "summary": "三轮预设后进入剧情模式",
          "summary_markup": "三轮预设后进入剧情模式",
        },
        "story": {
          "initChat": "[{"role":"assistant","content":"|<旁白>|木门轻轻响了一声。"},{"role":"assistant","content":"|<阿凯&男>|来，我们一步一步来。"},{"role":"user","content":"我想学编程"},{"role":"assistant","content":"|<阿凯&男>|先想一个你想让电脑完成的小任务。"},{"role":"user","content":"做一个闹钟"},{"role":"assistant","content":"|<阿凯&男>|很好，把它拆成三步会更容易。"},{"role":"user","content":"怎么拆？"},{"role":"assistant","content":"|<阿凯&男>|如果卡住，就把问题说得更小一点。"}]",
          "sort_num": 13,
          "unit_id": "000003911971051999346801",
        },
        "top": {
          "hash": 1783100000000,
          "owner_id": "000004550035214806040581",
          "time": 1783100000000,
          "user_id": "000004550035214806040581",
        },
        "wrappers": [
          "KEYS",
          "bg",
          "bgm",
          "tts",
          "btn",
          "expression",
          "greetings",
          "ROOT",
          "group_greeting",
          "group_out",
          "cartoons",
          "constantGreetings",
        ],
      }
    `)
  })
})
