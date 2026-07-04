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

export async function createFlow(
  _input: CreateFlowInput,
  _auth: DreamaAuth,
): Promise<CreateFlowOutput> {
  // TODO codex（PR#4）:
  //   const client = createCyapiClient(...)
  //   const { id: pipeId, globalAttrId } = await client.pipeAdd(auth, { user_id, name })
  //   const mainRole = await client.getCartoonDetail(auth, input.role_ids[0])
  //   const saveBody = buildStudioSaveBody({ pipeId, globalAttrId, payload: input, mainRoleDetail: mainRole, userId: auth.uid })
  //   await client.pipeSave(auth, saveBody)
  //   await client.pipeInitchat(auth, pipeId)
  //   if (input.publish) {
  //     await client.pipeCreatorSubmit(auth, pipeId)
  //   }
  //   return {
  //     pipe_id: pipeId,
  //     publish_status: input.publish ? 'submitted' : 'draft',
  //     studio_url: `https://studio.ideaflow.pro/pipe.html?pipe_id=${pipeId}`,
  //   }

  // TODO codex（PR#5）: 在 pipeSave 后加 pipeUpdate；在 pipeCreatorSubmit 前加 riskControlTxtBatch
  throw new BizError('NOT_IMPLEMENTED', 'PR#4 待实现：flow-service 主编排')
}
