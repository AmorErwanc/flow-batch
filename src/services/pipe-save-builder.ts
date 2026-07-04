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

/**
 * TODO codex: 完整实现见 stage-b-save.mjs
 *
 * 建议内部拆分为几个私有函数：
 *   - buildLocalIds(payload) → {chainIds, wrapperIds, attrIds}
 *   - buildGreetingsWrapper(payload) → wrapper.greetings.content
 *   - buildGreetingsRuntime(payload, roleId, banner) → pipe.wrapper_json.greetings
 *   - buildChains(payload, ids) → chain map（N 轮 × 4 + 剧情模式）
 *   - buildWrappers(payload, ids, mainRoleDetail) → wrapper map（11 个）
 *   - buildAttrs(ids, globalAttrId, pipeId) → attr map
 *   - buildOutParams(payload, ids, mainRoleDetail) → pipe.out_param
 *   - buildInitChat(payload, roleName, roleGender) → JSON string
 *   - buildTagPipe(payload) → $tag_pipe map
 *   - assemble(...) → 顶层拼装
 */
export function buildStudioSaveBody(_input: BuildSaveBodyInput): StudioPipeSaveBody {
  throw new Error('PR#4 待实现：pipe-save-builder')
}
