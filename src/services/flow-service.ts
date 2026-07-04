/**
 * 一键创建作品 service · PR#4 · 主编排流程骨架（业务由 codex 补齐）
 *
 * 6 步流程（PR#4 先做 1/2/4/6 = 4 步，PR#5 补 3/5 = pipe/update + 风控）：
 *   1. 建作品壳（studio pipe/add）→ pipe_id + 后端自动 populate 的全局配置 attr id
 *   2. 拉主角 detail（cyapi cartoon/detail）→ 拿 timbre_val / timbre_audio 等 13 字段（builder 要用）
 *   3. builder 拼 save body → POST studio pipe/save
 *   4. [PR#5] POST cyapi/pipe/update 补主表元信息
 *   5. POST cyapi/pipe/initchat/{pipe_id}
 *   6. [PR#5] POST cyapi/risk/control/txt/batch 内容风控（命中 → CONTENT_REJECTED）
 *   7. publish=true → POST cyapi/pipe/creator/submit/{pipe_id}
 *
 * 参考实现：`~/project/temp/flow-creation/test-run/stage-b-save.mjs`（studio 侧）+
 * 后续调 cyapi 的部分见 `~/project/temp/flow-creation/test-run/` 里的 bash 一键脚本。
 */
import { BizError } from '../lib/errors.js'
import type { DreamaAuth } from '../http/middleware/dreama-auth.js'
import type { CreateFlowInput, CreateFlowOutput } from '../routes/flow.js'
import { getConfig } from '../config.js'
import { createCyapiClient } from './cyapi-client.js'
import { buildStudioSaveBody, type StudioPipeSaveBody } from './pipe-save-builder.js'

function buildPipeUpdateBody(
  input: CreateFlowInput,
  saveBody: StudioPipeSaveBody,
  pipeId: string,
): Record<string, unknown> {
  return {
    id: pipeId,
    name: input.name,
    cover: input.cover_url ?? null,
    summary: input.summary ?? '',
    summary_markup: input.summary ?? '',
    inParam: JSON.stringify(saveBody.data.pipe.in_param),
    outParam: JSON.stringify(saveBody.data.pipe.out_param),
    chainIds: Object.keys(saveBody.data.chain),
  }
}

function collectTextsForRiskCheck(input: CreateFlowInput): string[] {
  const texts = new Set<string>()

  const addText = (value: string | undefined): void => {
    const text = value?.trim()
    if (!text || text.length > 4096) return
    texts.add(text)
  }

  addText(input.name)
  addText(input.summary)

  for (const greeting of input.greetings) {
    addText(greeting.content)
    if (greeting.type === 'system') {
      addText(greeting.title)
    }
    if (greeting.type === 'role') {
      for (const button of greeting.user_btns ?? []) addText(button)
    }
  }

  for (const turn of input.preset_turns) {
    addText(turn.reply)
    for (const button of turn.buttons) addText(button)
  }

  addText(input.story.background)
  return [...texts]
}

export async function createFlow(
  input: CreateFlowInput,
  auth: DreamaAuth,
): Promise<CreateFlowOutput> {
  const mainRoleId = input.role_ids[0]
  if (!mainRoleId) {
    throw new BizError('BAD_REQUEST', '创建作品至少需要一个角色')
  }

  const config = getConfig()
  const client = createCyapiClient(config.CYAPI_BASE_URL, config.STUDIO_NODEAPI_BASE_URL)

  const { id: pipeId, globalAttrId } = await client.pipeAdd(auth, {
    user_id: input.user_id,
    name: input.name,
  })
  const mainRole = await client.getCartoonDetail(auth, mainRoleId)
  const saveBody = buildStudioSaveBody({
    pipeId,
    globalAttrId,
    payload: input,
    mainRoleDetail: mainRole,
    userId: auth.uid,
  })

  await client.pipeSave(auth, saveBody)
  await client.pipeUpdate(auth, buildPipeUpdateBody(input, saveBody, pipeId))
  await client.pipeInitchat(auth, pipeId)

  if (input.publish) {
    const { rejected } = await client.riskControlTxtBatch(auth, collectTextsForRiskCheck(input))
    if (rejected.length > 0) {
      throw new BizError('CONTENT_REJECTED', '内容命中风控', { details: { rejected } })
    }
    await client.pipeCreatorSubmit(auth, pipeId)
  }

  return {
    pipe_id: pipeId,
    publish_status: input.publish ? 'submitted' : 'draft',
    studio_url: `https://studio.ideaflow.pro/pipe.html?pipe_id=${pipeId}`,
  }
}
