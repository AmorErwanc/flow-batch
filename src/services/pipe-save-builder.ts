/**
 * pipe-save-builder · PR#4 · 核心业务（业务由 codex 实现）
 *
 * 输入：良维的友好 payload（CreateFlowInput + 角色详情 + 已建的 pipe_id + 全局配置 attr id）
 * 输出：完整的 `POST studio/pipe/save` body（`{user_id, owner_id, time, data, hash}`）
 *
 * 参考实现：`~/project/temp/flow-creation/test-run/stage-b-save.mjs`
 * 这个脚本已经把良维实际使用的 48KB save body 完整拼出来过，跑通过 studio pipe/save。
 * codex 的工作就是把它翻译成结构化的 TypeScript 类。
 *
 * 拼装内容（照 stage-b-save.mjs）：
 *   - data.pipe（含 out_param, wrapper_json.greetings 运行态镜像, wrapper_json.expression 等）
 *   - data.attr（轮次 + 全局配置 wrapper attr）
 *   - data.chain（N 轮预设 × 4 组件：条件分支 + 文本编排 + 变量运算 + 跳转，最后 + 剧情模式）
 *   - data.wrapper（KEYS / bg / bgm / btn / tts / expression / greetings / group_greeting / group_out / ROOT / cartoons，共 11 个）
 *   - data.$tag_pipe（标签关联）
 *   - data._WID = 全局配置 attr id
 *   - 顶层 hash = 时间戳
 *
 * 关键约束（照 interface-design.md §5.4 §5.5）：
 *   - 角色 val 13 字段必填（id/name/avatar/character/locution/timbre_id/gender/age/banner/timbre_val/timbre_audio/yn_subscribe/type）
 *   - greeting bubble 的 reader 字段必须 null（KEYS wrapper 统一注入）
 *   - out_param 不需要塞 id="3"（AI 响应气泡冗余，Studio 用 dynamic id="0" 就够）
 *   - initChat 拼「模拟用户从头点第一个按钮走完 N 轮预设」的完整对话历史（JSON string 塞进剧情模式 in_param.initChat）
 *   - 用 `data.pipe.cartoon_id` 关联主角，别塞 `wrapper.cartoons`（后端会忽略）
 *
 * chain 拓扑（N 轮预设，每轮 4 chain + 最后剧情模式）：
 *   - 轮 i 条件分支 (if 轮次==i, sort=i*4+1, pid=root, next=轮 i+1 条件分支 或 剧情模式)
 *     → 命中时 return 文本编排_i
 *   - 文本编排_i (阿凯 preset_turns[i].reply, sort=i*4+2, pid=条件分支_i, next=变量运算_i)
 *   - 变量运算_i (轮次 += 1, sort=i*4+3, pid=条件分支_i, next=跳转_i)
 *   - 跳转_i (break, sort=i*4+4, pid=条件分支_i, next=null)
 *   - 最后一轮的条件分支 next 指向 剧情模式
 *
 * greeting 三种 type → wrapper.greetings.content 里的映射：
 *   - system    → { id:"0", type:"system", ui.name:"system", content:[{val:title, inName:"title"},{val:content, inName:"none"}] }
 *   - narration → { id:"2", type:"narration", ui.name:"narration", content:[{val:content, inName:"none"}] }
 *   - role      → { id:"1", type:"normal", ui.name:"normal", role:null (KEYS 注入), event:[每个 btn 一个 event], content:[{val:content}] }
 */

import type { CreateFlowInput } from '../routes/flow.js'
import type { CartoonDetail } from './cyapi-client.js'
import { BizError } from '../lib/errors.js'
import { CHAIN_ID, DEFAULT_LLM_MODEL, REP_TEXT_REGEX, SOVITS_READER_ID, UNIT } from '../constants/studio-units.js'

/** studio pipe/save body 顶层结构 */
export interface StudioPipeSaveBody {
  user_id: string
  owner_id: string
  time: number
  data: StudioPipeData
  hash: number
}

export interface StudioPipeData {
  pipe: Record<string, unknown>
  attr: Record<string, unknown>
  chain: Record<string, unknown>
  op: null
  wrapper: Record<string, unknown>
  feature: Record<string, unknown>
  $topic_content: Record<string, unknown>
  $tag_pipe: Record<string, unknown>
  $pipe_extra: Record<string, unknown>
  $audio_library_rel: Record<string, unknown>
  _WID: string
}

export interface BuildSaveBodyInput {
  /** studio pipe/add 返回的新 pipe_id */
  pipeId: string
  /** studio pipe/add 拉 detail 时后端自动 populate 的全局配置 attr id（作为 _WID） */
  globalAttrId: string
  /** 良维的友好 payload */
  payload: CreateFlowInput
  /** 主角完整详情（含 timbre_val / timbre_audio 等 13 字段），从 cyapi/cartoon/detail 拿 */
  mainRoleDetail: CartoonDetail
  /** 良维的 user_id（= payload.user_id）*/
  userId: string
}

interface TurnChainIds {
  cond: string
  text: string
  variable: string
  jump: string
}

interface WrapperIds {
  KEYS: string
  bg: string
  bgm: string
  btn: string
  tts: string
  expression: string
  greetings: string
  groupGreeting: string
  groupOut: string
  ROOT: string
  cartoons: string
}

interface AttrIds {
  round: string
}

interface LocalIds {
  storyChainId: string
  chainIds: TurnChainIds[]
  wrapperIds: WrapperIds
  attrIds: AttrIds
  tagPipeId: string
}

const DEFAULT_CHAT_TAG_ID = '000003882999195270660097'

let idSeq = 0

function genLocalId(): string {
  const suffix = (idSeq++).toString().padStart(3, '0')
  return `id_${Date.now()}${suffix}`
}

function getMainRoleId(payload: CreateFlowInput): string {
  const roleId = payload.role_ids[0]
  if (!roleId) {
    throw new BizError('BAD_REQUEST', '创建作品至少需要一个角色')
  }
  return roleId
}

function generateLocalIds(turnCount: number): LocalIds {
  const chainIds: TurnChainIds[] = []
  for (let i = 0; i < turnCount; i += 1) {
    chainIds.push({
      cond: genLocalId(),
      text: genLocalId(),
      variable: genLocalId(),
      jump: genLocalId(),
    })
  }

  return {
    storyChainId: genLocalId(),
    chainIds,
    wrapperIds: {
      KEYS: genLocalId(),
      bg: genLocalId(),
      bgm: genLocalId(),
      btn: genLocalId(),
      tts: genLocalId(),
      expression: genLocalId(),
      greetings: genLocalId(),
      groupGreeting: genLocalId(),
      groupOut: genLocalId(),
      ROOT: genLocalId(),
      cartoons: genLocalId(),
    },
    attrIds: { round: genLocalId() },
    tagPipeId: genLocalId(),
  }
}

function buildReaderPlain(): Record<string, unknown> {
  return {
    sub: [
      { val: '', type: 'str', inName: 'tts_model_name' },
      { val: REP_TEXT_REGEX, type: 'str', inName: '_rep_text' },
      { val: -1, type: 'num', inName: 'maxLength' },
    ],
    val: SOVITS_READER_ID,
    type: 'str',
    inName: 'reader',
  }
}

function buildReaderCartoon(roleId: string): Record<string, unknown> {
  return {
    sub: [
      {
        get: [{ val: 'timbre_id', table: 'cartoon_timbre' }],
        val: roleId,
        type: 'str',
        inName: 'tts_model_name',
        chainId: CHAIN_ID.CARTOON,
      },
      { val: REP_TEXT_REGEX, type: 'str', inName: '_rep_text' },
      { val: -1, type: 'num', inName: 'maxLength' },
    ],
    val: SOVITS_READER_ID,
    type: 'str',
    inName: 'reader',
  }
}

function buildBtnEvent(btnText: string): Record<string, unknown> {
  return {
    sub: [
      { val: 'btn-fill', type: 'str', inName: 'style' },
      { val: 'inParam', type: 'str', inName: 'fn' },
      { val: 0, inName: 'args0' },
      { val: true, type: 'bool', inName: 'args2' },
      { val: false, type: 'bool', inName: 'delGroup' },
      { val: false, type: 'bool', inName: 'adEnable' },
    ],
    val: btnText,
    type: 'str',
    inName: 'btn',
  }
}

function buildReadSub(): Record<string, unknown>[] {
  return [{ val: false, type: 'bool', inName: 'read' }]
}

function buildGreetingsWrapperContent(payload: CreateFlowInput): Record<string, unknown>[] {
  return payload.greetings.map((greeting) => {
    if (greeting.type === 'system') {
      return {
        id: '0',
        ui: { name: 'system', btnName: 'sheet', imgName: 'none', noInput: false, startAt: 0 },
        type: 'system',
        event: [],
        reader: null,
        content: [
          {
            sub: buildReadSub(),
            val: greeting.title ?? '背景介绍',
            type: 'str',
            props: [],
            inName: 'title',
          },
          {
            sub: buildReadSub(),
            val: greeting.content,
            type: 'str',
            props: [],
            inName: 'none',
          },
        ],
      }
    }

    if (greeting.type === 'narration') {
      return {
        id: '2',
        ui: { name: 'narration', btnName: 'sheet', imgName: 'none', noInput: false, startAt: 0 },
        type: 'narration',
        event: [],
        reader: null,
        content: [{ sub: buildReadSub(), val: greeting.content, type: 'str', props: [], inName: 'none' }],
      }
    }

    return {
      id: '1',
      ui: { name: 'normal', btnName: 'sheet', imgName: 'none', noInput: true, startAt: 0 },
      role: null,
      type: 'normal',
      event: (greeting.user_btns ?? []).map(buildBtnEvent),
      reader: null,
      content: [{ sub: buildReadSub(), val: greeting.content, type: 'str', props: [] }],
    }
  })
}

function buildRoleExpression(roleId: string): Record<string, unknown> {
  return {
    val: roleId,
    type: 'json',
    inName: 'role',
    chainId: CHAIN_ID.CARTOON,
    outName: roleId,
  }
}

function buildGreetingsRuntime(payload: CreateFlowInput): Record<string, unknown>[] {
  const wrapperContent = buildGreetingsWrapperContent(payload)
  return wrapperContent.map((item, index) => {
    const greeting = payload.greetings[index]
    if (!greeting) return item
    if (greeting.type !== 'role') {
      return { ...item, reader: buildReaderPlain() }
    }
    return {
      ...item,
      role: buildRoleExpression(greeting.role_id),
      reader: buildReaderCartoon(greeting.role_id),
    }
  })
}

function buildStoryChain(
  payload: CreateFlowInput,
  storyChainId: string,
  sortNum: number,
  roleId: string,
  roleName: string,
  roleGender: string,
): Record<string, unknown> {
  const llmConfig = payload.story.llm_config
  return {
    id: storyChainId,
    name: '剧情模式',
    unit_id: UNIT.STORY,
    sort_num: sortNum,
    pid: CHAIN_ID.ROOT,
    next_id: null,
    out_schema: null,
    unit_type: null,
    in_param: [
      { inName: 'content_1', chainId: CHAIN_ID.USER_INPUT, outName: 'k_1' },
      { val: '{{content_1}}', var: 1, type: 'str', inName: 'content' },
      { val: payload.story.background, type: 'str', inName: 'background' },
      {
        set: [{ val: true, type: 'bool', inName: 'chat_mode' }],
        val: 'CHAT',
        type: 'str',
        inName: 'type_config',
        chainId: '',
        outName: '',
      },
      {
        arr: 1,
        set: [
          { val: true, type: 'bool', inName: 'main_role' },
          { val: roleId, type: 'json', inName: 'cartoon', chainId: CHAIN_ID.CARTOON, outName: roleId },
        ],
        val: 'role',
        inName: 'role_configs',
        chainId: '',
        outName: '',
      },
      { val: llmConfig?.model ?? DEFAULT_LLM_MODEL, type: 'str', inName: 'model', chainId: '', outName: '' },
      { val: llmConfig?.temperature ?? 1, type: 'num', inName: 'temperature' },
      { val: llmConfig?.top_p ?? 0.7, type: 'num', inName: 'top_p' },
      { val: llmConfig?.max_tokens ?? 1024, type: 'num', inName: 'max_tokens' },
      { val: buildInitChatString(payload, roleName, roleGender), type: 'str', inName: 'initChat' },
      { val: '', type: 'str', inName: 'sessionChainId' },
    ],
  }
}

function buildFullChainMap(
  payload: CreateFlowInput,
  chainIds: TurnChainIds[],
  attrIds: AttrIds,
  storyChainId: string,
  roleId: string,
  roleName: string,
  roleGender: string,
): Record<string, unknown> {
  const chainMap: Record<string, unknown> = {}

  payload.preset_turns.forEach((turn, i) => {
    const ids = chainIds[i]
    if (!ids) throw new BizError('INTERNAL_SERVER_ERROR', '作品节点 id 生成失败')
    const nextIds = chainIds[i + 1]

    chainMap[ids.cond] = {
      id: ids.cond,
      name: '条件分支',
      unit_id: UNIT.COND,
      sort_num: i * 4 + 1,
      pid: CHAIN_ID.ROOT,
      next_id: nextIds ? nextIds.cond : storyChainId,
      out_schema: null,
      unit_type: null,
      in_param: [
        {
          lang: 'js',
          type: 'json',
          inName: 'expression',
          expression: [
            {
              args: [
                { val: attrIds.round, lang: 'js', chainId: CHAIN_ID.GLOBAL_ATTR, outName: attrIds.round },
                { val: `==${i}` },
              ],
              fn: 'if',
              lang: 'js',
              return: ids.text,
            },
          ],
        },
      ],
    }

    chainMap[ids.text] = {
      id: ids.text,
      name: '文本编排',
      unit_id: UNIT.TEXT,
      sort_num: i * 4 + 2,
      pid: ids.cond,
      next_id: ids.variable,
      out_schema: null,
      unit_type: null,
      in_param: [{ type: 'any', inName: 'prompt', expression: [{ val: turn.reply, lang: 'tpl' }] }],
    }

    chainMap[ids.variable] = {
      id: ids.variable,
      name: '变量运算',
      unit_id: UNIT.VAR,
      sort_num: i * 4 + 3,
      pid: ids.cond,
      next_id: ids.jump,
      out_schema: null,
      unit_type: null,
      in_param: [
        {
          type: 'any',
          inName: 'code',
          expression: [
            { val: attrIds.round, lang: 'js', chainId: CHAIN_ID.GLOBAL_ATTR, outName: attrIds.round },
            { val: '+=1' },
          ],
        },
        { val: '', type: 'any', inName: 'saveAttrId' },
      ],
    }

    chainMap[ids.jump] = {
      id: ids.jump,
      name: '跳转',
      unit_id: UNIT.JUMP,
      sort_num: i * 4 + 4,
      pid: ids.cond,
      next_id: null,
      out_schema: null,
      unit_type: null,
      in_param: [
        { val: 'break', code: 'jump', type: 'str', inName: 'jumpChain' },
        { val: '', type: 'str', inName: 'exceptionMsg' },
      ],
    }
  })

  chainMap[storyChainId] = buildStoryChain(
    payload,
    storyChainId,
    payload.preset_turns.length * 4 + 1,
    roleId,
    roleName,
    roleGender,
  )

  return chainMap
}

function buildGroupGreeting(): Record<string, unknown> {
  return {
    '0': { type: 'system', ui: { name: 'system', btnName: 'sheet', imgName: 'none', noInput: false, startAt: 0 } },
    '1': { type: 'normal', ui: { name: 'normal', btnName: 'sheet', imgName: 'none', noInput: true, startAt: 0 } },
    '2': {
      type: 'narration',
      ui: { name: 'narration', btnName: 'sheet', imgName: 'none', noInput: false, startAt: 0 },
    },
  }
}

function buildGroupOut(): Record<string, unknown> {
  return {
    '0': { type: 'dynamic', ui: { name: 'normal', btnName: 'sheet', imgName: 'none', noInput: false, startAt: 0 } },
    '1': { type: 'normal', ui: { name: 'normal', btnName: 'sheet', imgName: 'none', noInput: true, startAt: 0 } },
    '2': { type: 'normal', ui: { name: 'normal', btnName: 'sheet', imgName: 'none', noInput: true, startAt: 0 } },
  }
}

function buildExpression(globalAttrId: string): Record<string, unknown>[] {
  return [
    {
      lang: 'js',
      fn: 'set',
      args: [
        { chainId: CHAIN_ID.GLOBAL_ATTR, val: globalAttrId, type: 'json' },
        { val: '"inputs"', type: 'str' },
        { type: 'json', val: '[]' },
      ],
    },
    {
      fn: 'set',
      args: [
        { chainId: CHAIN_ID.GLOBAL_ATTR, val: globalAttrId, type: 'json' },
        { val: '"inputs[0]"', type: 'str' },
        { type: 'str', chainId: CHAIN_ID.USER_INPUT, outName: 'k_1' },
      ],
    },
  ]
}

function buildKeyExpressions(payload: CreateFlowInput): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = []
  payload.greetings.forEach((greeting, index) => {
    if (greeting.type === 'role') {
      result.push({
        keyPath: `greetings[${index}].role`,
        onlyVal: 0,
        expression: buildRoleExpression(greeting.role_id),
      })
      result.push({
        keyPath: `greetings[${index}].reader`,
        onlyVal: 0,
        expression: buildReaderCartoon(greeting.role_id),
      })
      return
    }

    result.push({
      keyPath: `greetings[${index}].reader`,
      onlyVal: 0,
      expression: buildReaderPlain(),
    })
  })
  return result
}

function buildWrapperMap(
  payload: CreateFlowInput,
  wrapperIds: WrapperIds,
  roleId: string,
  roleBanner: string,
  pipeId: string,
  globalAttrId: string,
): Record<string, unknown> {
  const expression = buildExpression(globalAttrId)
  return {
    [wrapperIds.KEYS]: { id: wrapperIds.KEYS, name: 'KEYS', pipe_id: pipeId, content: buildKeyExpressions(payload) },
    [wrapperIds.bg]: {
      id: wrapperIds.bg,
      pipe_id: pipeId,
      name: 'bg',
      content: { chat: { src: roleBanner, type: 'image', loop: 0, enter: 'fadeIn', leave: 'fadeOut', volume: 0 } },
    },
    [wrapperIds.bgm]: { id: wrapperIds.bgm, pipe_id: pipeId, name: 'bgm', content: { volume: 0.5, autoplay: 1, loop: 1 } },
    [wrapperIds.tts]: { id: wrapperIds.tts, pipe_id: pipeId, name: 'tts', content: { autoplay: 1 } },
    [wrapperIds.btn]: { id: wrapperIds.btn, pipe_id: pipeId, name: 'btn', content: { layout: 0, style: 'btn-fill' } },
    [wrapperIds.expression]: { id: wrapperIds.expression, pipe_id: pipeId, name: 'expression', content: expression },
    [wrapperIds.greetings]: {
      id: wrapperIds.greetings,
      pipe_id: pipeId,
      name: 'greetings',
      content: buildGreetingsWrapperContent(payload),
    },
    [wrapperIds.ROOT]: { id: wrapperIds.ROOT, pipe_id: pipeId, name: 'ROOT', content: { inputMode: 'text', inputPosition: 'keep', id: globalAttrId } },
    [wrapperIds.groupGreeting]: {
      id: wrapperIds.groupGreeting,
      pipe_id: pipeId,
      name: 'group_greeting',
      content: buildGroupGreeting(),
    },
    [wrapperIds.groupOut]: { id: wrapperIds.groupOut, pipe_id: pipeId, name: 'group_out', content: buildGroupOut() },
    [wrapperIds.cartoons]: {
      id: wrapperIds.cartoons,
      name: 'cartoons',
      pipe_id: pipeId,
      content: [{ id: roleId, code: 'normal', sn: 1 }],
    },
  }
}

function buildAttrMap(attrIds: AttrIds, globalAttrId: string, pipeId: string): Record<string, unknown> {
  return {
    [attrIds.round]: { id: attrIds.round, code: '', name: '轮次', val: '0', sn: 1, type: 'num', schema: null, reset: 1, refresh: 0 },
    [globalAttrId]: {
      id: globalAttrId,
      sn: null,
      name: '全局配置',
      code: 'none',
      type: 'json',
      val: '{}',
      reset: 1,
      schema: 'wrapper',
      pipe_id: pipeId,
      refresh: 1,
    },
  }
}

function buildOutParams(payload: CreateFlowInput, chainIds: TurnChainIds[], storyChainId: string, roleId: string): Record<string, unknown>[] {
  const presetParams = payload.preset_turns.map((turn, i) => {
    const ids = chainIds[i]
    if (!ids) throw new BizError('INTERNAL_SERVER_ERROR', '作品输出参数 id 生成失败')
    return {
      id: String(i + 1),
      ui: { name: 'normal', btnName: 'sheet', imgName: 'none', noInput: true, startAt: 0 },
      role: { val: roleId, type: 'str', chainId: CHAIN_ID.CARTOON, outName: roleId },
      type: 'normal',
      event: turn.buttons.map(buildBtnEvent),
      reader: buildReaderCartoon(roleId),
      content: [{ sub: buildReadSub(), val: '', type: 'str', chainId: ids.text, outName: 'prompt' }],
    }
  })

  return [
    ...presetParams,
    {
      id: '0',
      ui: { name: 'normal', btnName: 'sheet', imgName: 'none', noInput: false, startAt: 0 },
      type: 'dynamic',
      event: [],
      reader: buildReaderPlain(),
      content: [{ sub: buildReadSub(), val: '', type: 'json', inName: 'none', chainId: storyChainId, outName: 'outPut' }],
    },
  ]
}

function buildInitChatString(payload: CreateFlowInput, roleName: string, roleGender: string): string {
  const rolePrefix = `|<${roleName}&${roleGender}>|`
  const narrationPrefix = '|<旁白>|'
  const messages: Record<string, string>[] = []

  for (const greeting of payload.greetings) {
    if (greeting.type === 'narration') {
      messages.push({ role: 'assistant', content: `${narrationPrefix}${greeting.content}` })
    } else if (greeting.type === 'role') {
      messages.push({ role: 'assistant', content: `${rolePrefix}${greeting.content}` })
    }
  }

  const firstGreetingButton = payload.greetings.find((greeting) => greeting.type === 'role')?.user_btns?.[0]
  const enterButtons = [
    firstGreetingButton,
    ...payload.preset_turns.slice(0, Math.max(payload.preset_turns.length - 1, 0)).map((turn) => turn.buttons[0]),
  ]

  payload.preset_turns.forEach((turn, index) => {
    const userInput = enterButtons[index]
    if (userInput) messages.push({ role: 'user', content: userInput })
    messages.push({ role: 'assistant', content: `${rolePrefix}${turn.reply}` })
  })

  return JSON.stringify(messages)
}

function buildTagPipe(payload: CreateFlowInput, tagPipeId: string): Record<string, unknown> {
  return {
    [tagPipeId]: { id: tagPipeId, tag_id: payload.tag_id ?? DEFAULT_CHAT_TAG_ID },
  }
}

function buildPipe(
  input: BuildSaveBodyInput,
  ids: LocalIds,
  wrappers: Record<string, unknown>,
  outParams: Record<string, unknown>[],
  roleId: string,
): Record<string, unknown> {
  const { payload, mainRoleDetail, pipeId, globalAttrId } = input
  const roleBanner = mainRoleDetail.banner || mainRoleDetail.avatar
  const startChainId = ids.chainIds[0]?.cond ?? ids.storyChainId
  const expressionWrapper = wrappers[ids.wrapperIds.expression]
  const expressionContent =
    expressionWrapper && typeof expressionWrapper === 'object' && !Array.isArray(expressionWrapper)
      ? (expressionWrapper as Record<string, unknown>).content
      : []

  return {
    id: pipeId,
    cartoon_id: roleId,
    name: payload.name,
    cover: payload.cover_url ?? '',
    in_param: [{ ui: { name: 'input' }, name: 'k_1', type: 'str', alias: '用户输入', placeholder: '发消息' }],
    summary_markup: payload.summary ?? '',
    out_param: outParams,
    func: 'none',
    yn_subscribe: 0,
    start_chain_id: startChainId,
    wrapper_json: {
      id: globalAttrId,
      inputMode: 'text',
      inputPosition: 'keep',
      bg: { chat: { src: roleBanner, type: 'image', loop: 0, enter: 'fadeIn', leave: 'fadeOut', volume: 0 } },
      bgm: { loop: 1, volume: 0.5, autoplay: 1 },
      btn: { style: 'btn-fill', layout: 0 },
      expression: expressionContent,
      greetings: buildGreetingsRuntime(payload),
      group_greeting: buildGroupGreeting(),
      group_out: buildGroupOut(),
      tts: { autoplay: 1 },
    },
    summary: payload.summary ?? '',
  }
}

function assembleSaveBody(input: BuildSaveBodyInput, ids: LocalIds): StudioPipeSaveBody {
  const roleId = getMainRoleId(input.payload)
  const roleBanner = input.mainRoleDetail.banner || input.mainRoleDetail.avatar
  const roleName = input.mainRoleDetail.name
  const roleGender = input.mainRoleDetail.gender
  const chain = buildFullChainMap(
    input.payload,
    ids.chainIds,
    ids.attrIds,
    ids.storyChainId,
    roleId,
    roleName,
    roleGender,
  )
  const wrapper = buildWrapperMap(input.payload, ids.wrapperIds, roleId, roleBanner, input.pipeId, input.globalAttrId)
  const attr = buildAttrMap(ids.attrIds, input.globalAttrId, input.pipeId)
  const outParams = buildOutParams(input.payload, ids.chainIds, ids.storyChainId, roleId)
  const now = Date.now()

  return {
    user_id: input.userId,
    owner_id: input.userId,
    time: now,
    data: {
      pipe: buildPipe(input, ids, wrapper, outParams, roleId),
      attr,
      chain,
      op: null,
      wrapper,
      feature: {},
      $topic_content: {},
      $tag_pipe: buildTagPipe(input.payload, ids.tagPipeId),
      $pipe_extra: {},
      $audio_library_rel: {},
      _WID: input.globalAttrId,
    },
    hash: now + 1,
  }
}

/**
 * 把良维友好 payload 翻译成 Studio pipe/save 的整体覆盖式保存 body。
 */
export function buildStudioSaveBody(input: BuildSaveBodyInput): StudioPipeSaveBody {
  const ids = generateLocalIds(input.payload.preset_turns.length)
  return assembleSaveBody(input, ids)
}
