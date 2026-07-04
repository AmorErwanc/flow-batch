/**
 * 创建角色 service · PR#3 · 骨架（业务由 codex 实现）
 *
 * 流程（照 `docs/api-spec.md` §「接口 1」）：
 *   1. GET `${CYAPI_BASE_URL}/cutebox/snowid`
 *      Headers: Authorization + Uid（透传 auth）+ 造梦次元通用 c/env/pg header
 *      → response.data (24 位字符串，作为预申请 id)
 *
 *   2. 若 input.timbre_id 未指定：
 *      GET `${CYAPI_BASE_URL}/cartoon/timbre?type={M|F|all}`
 *        - 性别 '男' → M
 *        - 性别 '女' → F
 *        - 性别 '未知' → all
 *      → response.data[] 取第一个作为默认音色
 *
 *   3. POST `${CYAPI_BASE_URL}/cartoon/save`
 *      Body 用 CartoonParam schema（照 docs/apis/company-zmcy.md）：
 *      {
 *        type: 'normal',
 *        id: 步骤 1 预申请 id,
 *        name, gender, avatar (=input.avatar_url), banner (=input.banner_url),
 *        summary, character, locution,
 *        timbreId: input.timbre_id ?? 默认音色 id,
 *        isAiGenerated: String(input.is_ai_gen),
 *        bannerIsAiGenerated: String(input.banner_is_ai),
 *      }
 *
 *   4. **关键**：从 response.data.id 读回真 role_id 返回，不是步骤 1 那个预申请 id
 *      （造梦次元后端会忽略传入的 id 另分配一个新雪花，见 interface-design.md §5.5.①）
 *
 * 错误映射：
 *   - snowid 非 2xx / code !== 0 → throw new BizError('UPSTREAM_CYAPI_FAILED', ...)
 *   - cartoon/save 401 → throw new BizError('DREAMA_TOKEN_INVALID', '登录已过期')
 *   - cartoon/save 其他非 2xx / code !== 0 → throw new BizError('UPSTREAM_CYAPI_FAILED', ...)
 */
import type { DreamaAuth } from '../http/middleware/dreama-auth.js'
import type { CreateCharacterInput, CreateCharacterOutput } from '../routes/character.js'
import { getConfig } from '../config.js'
import { GENDER_TO_TIMBRE_TYPE } from '../constants/studio-units.js'
import { BizError } from '../lib/errors.js'
import { createCyapiClient } from './cyapi-client.js'

export async function createCharacter(
  input: CreateCharacterInput,
  auth: DreamaAuth,
): Promise<CreateCharacterOutput> {
  const config = getConfig()
  const client = createCyapiClient(config.CYAPI_BASE_URL, config.STUDIO_NODEAPI_BASE_URL)

  const preId = await client.applySnowId(auth)
  let finalTimbreId = input.timbre_id

  if (!finalTimbreId) {
    const timbreType = GENDER_TO_TIMBRE_TYPE[input.gender]
    const timbres = await client.listTimbres(auth, timbreType)
    const defaultTimbre = timbres[0]
    if (!defaultTimbre?.id) {
      throw new BizError('UPSTREAM_CYAPI_FAILED', '下游 cyapi 未返回可用默认音色')
    }
    finalTimbreId = defaultTimbre.id
  }

  const saved = await client.saveCartoon(auth, {
    type: 'normal',
    id: preId,
    name: input.name,
    gender: input.gender,
    avatar: input.avatar_url,
    banner: input.banner_url,
    summary: input.summary,
    character: input.character,
    locution: input.locution,
    timbreId: finalTimbreId,
    isAiGenerated: String(input.is_ai_gen),
    bannerIsAiGenerated: String(input.banner_is_ai),
  })

  return { character_id: saved.id }
}
