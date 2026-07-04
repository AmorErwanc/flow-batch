import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DreamaAuth } from '../src/http/middleware/dreama-auth.js'
import { BizError } from '../src/lib/errors.js'
import type { CreateFlowInput } from '../src/routes/flow.js'
import type { StudioPipeSaveBody } from '../src/services/pipe-save-builder.js'
import { createFlow } from '../src/services/flow-service.js'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  createCyapiClient: vi.fn(),
  client: {
    pipeAdd: vi.fn(),
    workStudioSave: vi.fn(),
    getCartoonDetail: vi.fn(),
    pipeSave: vi.fn(),
    pipeUpdate: vi.fn(),
    pipeInitchat: vi.fn(),
    riskControlTxtBatch: vi.fn(),
    pipeCreatorSubmit: vi.fn(),
  },
}))

vi.mock('../src/config.js', () => ({
  getConfig: mocks.getConfig,
}))

vi.mock('../src/services/cyapi-client.js', () => ({
  createCyapiClient: mocks.createCyapiClient,
}))

const AUTH: DreamaAuth = {
  authorization: 'metatube-test-token',
  uid: '000004550035214806040581',
}

const ROLE_ID = '000005050038131848937472'
const PIPE_ID = '000005081734685198434306'
const GLOBAL_ATTR_ID = '000005081734685198434307'

function buildInput(overrides: Partial<CreateFlowInput> = {}): CreateFlowInput {
  return {
    user_id: AUTH.uid,
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
    ],
    story: {
      background: '退休工程师在旧书店里教中学生理解编程思维，内容健康向上。',
      llm_config: { model: 'ep-test', temperature: 1, top_p: 0.7, max_tokens: 1024 },
    },
    tag_id: '000003882999195270660097',
    publish: true,
    ...overrides,
  }
}

function pipeSaveBody(): StudioPipeSaveBody {
  const body = mocks.client.pipeSave.mock.calls[0]?.[1]
  expect(body).toBeDefined()
  return body as StudioPipeSaveBody
}

function pipeUpdateBody(): Record<string, unknown> {
  const body = mocks.client.pipeUpdate.mock.calls[0]?.[1]
  expect(body).toBeDefined()
  return body as Record<string, unknown>
}

describe('flow-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getConfig.mockReturnValue({
      CYAPI_BASE_URL: 'https://cyapi.example.test',
      STUDIO_NODEAPI_BASE_URL: 'https://studio.example.test/nodeapi/ideaflow',
    })
    mocks.createCyapiClient.mockReturnValue(mocks.client)
    mocks.client.pipeAdd.mockResolvedValue({ id: PIPE_ID, globalAttrId: GLOBAL_ATTR_ID })
    mocks.client.getCartoonDetail.mockResolvedValue({
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
    })
    mocks.client.pipeSave.mockResolvedValue(undefined)
    mocks.client.pipeUpdate.mockResolvedValue(undefined)
    mocks.client.pipeInitchat.mockResolvedValue(undefined)
    mocks.client.riskControlTxtBatch.mockResolvedValue({ rejected: [] })
    mocks.client.pipeCreatorSubmit.mockResolvedValue(undefined)
  })

  it('publish=true 时按 6 步顺序创建、更新、初始化、风控并提审', async () => {
    const result = await createFlow(buildInput(), AUTH)

    expect(result).toEqual({
      pipe_id: PIPE_ID,
      publish_status: 'submitted',
      studio_url: `https://studio.ideaflow.pro/pipe.html?pipe_id=${PIPE_ID}`,
    })
    expect(mocks.createCyapiClient).toHaveBeenCalledWith(
      'https://cyapi.example.test',
      'https://studio.example.test/nodeapi/ideaflow',
    )

    const callOrder = [
      mocks.client.pipeAdd,
      mocks.client.getCartoonDetail,
      mocks.client.pipeSave,
      mocks.client.pipeUpdate,
      mocks.client.pipeInitchat,
      mocks.client.riskControlTxtBatch,
      mocks.client.pipeCreatorSubmit,
    ].map((mock) => mock.mock.invocationCallOrder[0])
    expect(callOrder).toEqual([...callOrder].sort((a, b) => a - b))
  })

  it('pipe/update 使用 save body 里的输入输出参数和节点列表补齐主表信息', async () => {
    const input = buildInput()
    await createFlow(input, AUTH)

    const saveBody = pipeSaveBody()
    const updateBody = pipeUpdateBody()
    expect(updateBody).toMatchObject({
      id: PIPE_ID,
      name: input.name,
      cover: input.cover_url,
      summary: input.summary,
      summary_markup: input.summary,
    })
    expect(updateBody.inParam).toBe(JSON.stringify(saveBody.data.pipe.in_param))
    expect(updateBody.outParam).toBe(JSON.stringify(saveBody.data.pipe.out_param))
    expect(updateBody.chainIds).toEqual(Object.keys(saveBody.data.chain))
  })

  it('publish=false 时保留草稿，不做风控和提审', async () => {
    const result = await createFlow(buildInput({ publish: false }), AUTH)

    expect(result.publish_status).toBe('draft')
    expect(mocks.client.pipeUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.client.pipeInitchat).toHaveBeenCalledWith(AUTH, PIPE_ID)
    expect(mocks.client.riskControlTxtBatch).not.toHaveBeenCalled()
    expect(mocks.client.pipeCreatorSubmit).not.toHaveBeenCalled()
  })

  it('风控明确命中时阻断提审并返回 CONTENT_REJECTED', async () => {
    mocks.client.riskControlTxtBatch.mockResolvedValue({ rejected: ['命中文本'] })

    await expect(createFlow(buildInput(), AUTH)).rejects.toMatchObject({
      code: 'CONTENT_REJECTED',
      details: { rejected: ['命中文本'] },
    } satisfies Partial<BizError>)
    expect(mocks.client.pipeCreatorSubmit).not.toHaveBeenCalled()
  })

  it('风控文本只收集可读内容，并去重、跳过空串和超长文本', async () => {
    const tooLong = '超'.repeat(4097)
    await createFlow(
      buildInput({
        name: '作品名',
        summary: '作品名',
        greetings: [
          { type: 'system', title: '系统标题', content: '系统内容' },
          { type: 'role', role_id: ROLE_ID, content: '角色开场', user_btns: ['继续', '继续', '   ', tooLong] },
        ],
        preset_turns: [{ reply: '预设回复', buttons: ['按钮一', tooLong] }],
        story: { background: '故事背景' },
      }),
      AUTH,
    )

    const texts = mocks.client.riskControlTxtBatch.mock.calls[0]?.[1] as string[]
    expect(texts).toEqual(['作品名', '系统内容', '系统标题', '角色开场', '继续', '预设回复', '按钮一', '故事背景'])
    expect(new Set(texts).size).toBe(texts.length)
    expect(texts).not.toContain(tooLong)
  })

  it('没有角色时直接返回参数错误，不创建作品壳', async () => {
    await expect(createFlow(buildInput({ role_ids: [] }), AUTH)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    } satisfies Partial<BizError>)
    expect(mocks.client.pipeAdd).not.toHaveBeenCalled()
  })
})
