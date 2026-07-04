/**
 * Studio 编辑器内置常量。
 *
 * 来源：`~/.claude/docs/apis/company-zmcy.md §8「Studio pipe JSON 结构关键知识」`
 * 以及 2026-07-03 白石实测确认（见 `~/project/temp/flow-creation/docs/interface-design.md §5.4`）。
 *
 * 这些常量是 Studio 平台层的定义，不要写死在业务代码里，改动集中在这个文件。
 */

/** ==== Studio 内置 chain 单元模板 id ==== */
export const UNIT = {
  /** 剧情模式（LLM 驱动） */
  STORY: '000003911971051999346801',
  /** 文本编排（固定文案输出） */
  TEXT: '000003459484940696567808',
  /** 变量运算（如 轮次+=1） */
  VAR: '000003481386372085334017',
  /** 跳转（break/continue） */
  JUMP: '000003649671145953738754',
  /** 条件分支（if 某属性 == 某值） */
  COND: '000004121900763352432640',
} as const

/** ==== 特殊 chainId 常量 ==== */
export const CHAIN_ID = {
  /** 角色引用的 chainId */
  CARTOON: 'CARTOON99999999999999999',
  /** attr 全局变量引用 */
  GLOBAL_ATTR: '999999999999999999999999',
  /** 用户输入源（k_1 从这里来） */
  USER_INPUT: '000000000000000000000000',
  /** 无来源（pid 为根 chain 时用） */
  ROOT: '000000000000000000000000',
} as const

/** SoVITS 朗读组件 id（reader 字段默认值） */
export const SOVITS_READER_ID = '000003838360748280004609'

/** 默认 LLM 模型 endpoint id（剧情模式的 model 参数）*/
export const DEFAULT_LLM_MODEL = 'ep-20260129110541-msdjh'

/** reader 里 `_rep_text` 正则（去掉括号里的旁白/@角色@ 之类不朗读的部分） */
export const REP_TEXT_REGEX = '[（(\\[][^)）]*[)）\\]]|@[^@]*@|#[^#]*#'

/** 组件性别 → 音色 type 参数映射 */
export const GENDER_TO_TIMBRE_TYPE: Record<'男' | '女' | '未知', 'M' | 'F' | 'all'> = {
  男: 'M',
  女: 'F',
  未知: 'all',
}
