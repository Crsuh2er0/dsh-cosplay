/**
 * dsh-cosplay — 主机侧核心插件（组合行 id: cosplay-core）。
 *
 * 形态：全局开关（Round 3 决策），状态即插件 Config（dsh 0.2.0 起）。
 *   - `enabled` / `thinkingStyle` / `activeRole` / `roles` 声明为 Config 的
 *     volatile 字段：schema 默认值即内置示例角色层；设置页与工具里的修改经
 *     `ctx.settings.update(entryId, patch)` 写入当前 profile 条目的 user 层
 *     （Cordis patch 持久化），并由 loader 的 volatile 通道热更新到运行中的
 *     插件实例（不重载）；
 *   - 注册**全局**追加人格段 `cosplay-persona`（紧随 deployment persona
 *     prefix）与 `{{cosplay_active}}` 变量：变量每次模型步骤组装时求值，
 *     开关关闭时渲染空串（人格静默回退），开启时渲染激活角色卡 —— 开/关/
 *     换角色下一模型步骤即生效，无需重建会话；
 *   - 注册**全局** `cosplay_*` 工具：`cosplay_switch` 在开关关闭时软禁用
 *     （提示先开启）；角色库管理工具（list/show/upsert/remove）始终可用。
 *
 * 本行是纯主机平面：不依赖任何 preset。全局生效范围含所有会话与子代理
 * （Round 3 已与用户确认）。
 */
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  normalizeState,
  DEFAULT_ROLES,
  upsertRole,
  removeRole,
  setActiveRole,
  findRole,
  nextId,
  renderActivePersona,
  renderPersona,
} from './store.js'

import {
  CARD_AUTHORING_SKILL_NAME,
  CARD_AUTHORING_SKILL_DESCRIPTION,
  CARD_AUTHORING_SKILL_WHEN_TO_USE,
  CARD_AUTHORING_SKILL_CONTENT,
} from './skill.js'

export const name = 'cosplay-core'
export const inject = ['settings', 'systemPrompt', 'tools', 'skills']

const RoleCardSchema = z.object({
  id: z.string().required(),
  name: z.string().required(),
  emoji: z.string().default(''),
  // SillyTavern v2 标准字段（通用共享）
  description: z.string().default(''),
  personality: z.string().default(''),
  scenario: z.string().default(''),
  first_mes: z.string().default(''),
  mes_example: z.string().default(''),
  system_prompt: z.string().default(''),
  post_history_instructions: z.string().default(''),
  creator_notes: z.string().default(''),
  character_version: z.string().default(''),
  creator: z.string().default(''),
  tags: z.array(z.string()).default([]),
  // 插件扩展字段（导出归入 extensions.dshCosplay）
  style: z.string().default(''),
  rules: z.string().default(''),
  behavior: z.string().default(''),
})

// 设置项即插件 Config 的 volatile 字段：只有 volatile 字段可通过 settings 服务
// 写入（并热更新到运行中的实例），非 volatile 字段由 profile 组合层固定。
// schemastery 无 null 类型：activeRole 以空串表示"未选择"（存储层），
// store 层内部仍用 null 语义，写入时序列化为空串。
export const Config = z.object({
  enabled: z.boolean().default(false).volatile(),
  thinkingStyle: z.union(['neutral', 'role']).default('neutral').volatile(),
  activeRole: z.string().default(DEFAULT_ROLES[0].id).volatile(),
  // 默认值即组合层（base）：内置角色库；用户编辑写入 user 层覆盖它。
  roles: z.array(RoleCardSchema).default(DEFAULT_ROLES).volatile(),
})

/** 追加人格段的段名（与 persona 段名不同，避免同一层重复名冲突）。 */
export const PERSONA_SECTION_ADDON = 'cosplay-persona'

const textOutput = {
  schema: { type: 'string' },
  render(_args, value) {
    return [{ type: 'text', text: String(value) }]
  },
}

export function apply(ctx, config) {
  // 本插件的 Loader 条目 id（= 组合行 id，见 cordis.patch.yml）：settings 服务
  // 以 profile 条目 id 为命名空间，写入必须指名它。
  const entryId = ctx.fiber.entry?.options.id

  const read = () =>
    normalizeState({
      enabled: config.enabled.get(),
      thinkingStyle: config.thinkingStyle.get(),
      activeRole: config.activeRole.get(),
      roles: config.roles.get(),
    })

  const write = async (next) => {
    if (entryId === undefined) {
      throw new Error('dsh-cosplay: 缺少 Loader profile 条目，无法写入角色库（请以组合包形式安装）')
    }
    // 序列化：activeRole 的 null 语义 → 空串（schema 无 null 类型）
    await ctx.settings.update(entryId, {
      enabled: next.enabled,
      thinkingStyle: next.thinkingStyle,
      activeRole: next.activeRole ?? '',
      roles: next.roles,
    })
    return next
  }

  // ── 人格注入（全局，随变量每次组装求值；含思维链指令，见 store.js） ──────
  // 段位紧随 deployment persona prefix（order 0），保持"persona 最先被读到"。
  ctx.systemPrompt.variable('cosplay_active', () => renderActivePersona(read()))
  ctx.systemPrompt.section({
    name: PERSONA_SECTION_ADDON,
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') + 1,
    text: '{{cosplay_active}}',
  })

  // ── 内置 skill：自然语言创建角色卡（全局注册，模型可加载） ───────────────
  // source 必须显式提供：register() 只默认 invocation/provider，加载路径会
  // 校验 source 必须为字符串（缺失报 "loaded skill ... source must be a string"）。
  ctx.skills.register({
    name: CARD_AUTHORING_SKILL_NAME,
    description: CARD_AUTHORING_SKILL_DESCRIPTION,
    whenToUse: CARD_AUTHORING_SKILL_WHEN_TO_USE,
    content: CARD_AUTHORING_SKILL_CONTENT,
    source: 'runtime',
  })

  // ── 全局工具（模式门控：开关关闭时 switch 软禁用） ────────────────────────
  ctx.tools.register(defineTool({
    name: 'cosplay_show',
    description:
      '查看当前激活角色的角色卡，或按 id 查看指定角色的角色卡。用于确认角色设定、语气与行为守则（Cosplay 开关关闭时也可预览）。',
    parameters: {
      id: { type: 'string', description: '角色 id；省略时返回当前激活角色。' },
    },
    output: textOutput,
    async execute(args) {
      const state = read()
      const role = args.id ? findRole(state, args.id) : findRole(state, state.activeRole)
      if (!role) return args.id ? `未找到角色: ${args.id}` : '当前未激活任何角色。'
      return renderPersona(role)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cosplay_list',
    description: '列出角色库中全部角色及其激活状态（角色库管理，开关关闭时也可用）。',
    parameters: {},
    output: textOutput,
    async execute() {
      const state = read()
      const head = state.enabled ? 'Cosplay 模式：开启' : 'Cosplay 模式：关闭'
      if (state.roles.length === 0) return `${head}\n角色库为空。`
      const lines = state.roles.map((r) => {
        const mark = r.id === state.activeRole ? '★ 激活' : '   '
        return `${mark} ${r.emoji ?? ''} ${r.name} (${r.id})`
      })
      return [head, ...lines].join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cosplay_switch',
    description: '切换当前扮演的角色（按角色 id）；id 传 null 可退出扮演、恢复默认身份。Cosplay 开关未开启时不可用。',
    parameters: {
      id: { type: 'string', required: true, description: '目标角色 id；传字符串 "null" 表示退出扮演。' },
    },
    output: textOutput,
    async execute(args) {
      const state = read()
      if (!state.enabled) {
        return 'Cosplay 模式未开启。请先在设置页「角色扮演」中打开开关（或安装后由用户主动开启），再切换角色。'
      }
      const id = args.id === 'null' ? null : args.id
      const next = setActiveRole(state, id)
      await write(next)
      return id === null ? '已退出扮演，恢复默认身份。' : `已切换到角色「${findRole(next, id).name}」。`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cosplay_upsert',
    description:
      '创建或更新一个角色（角色库管理，开关关闭时也可用）。未提供 id 时创建新角色（按 name 生成 id）；提供 id 时更新既有角色。字段兼容酒馆（SillyTavern）v2 角色卡。支持用户随时自定义任何角色。',
    parameters: {
      id: { type: 'string', description: '既有角色 id；省略表示新建。' },
      name: { type: 'string', required: true, description: '角色显示名。' },
      emoji: { type: 'string', description: '头像字符（如 🐋）。' },
      system_prompt: { type: 'string', description: '原样注入 persona 顶部的指令块（如 [PERSONA_LOAD] 格式）。' },
      description: { type: 'string', description: '身份与背景设定（我是谁）。' },
      personality: { type: 'string', description: '性格核心与层次。' },
      style: { type: 'string', description: '说话风格（怎么说话）。' },
      rules: { type: 'string', description: '行为守则（该做什么 / 不做什么）。' },
      behavior: { type: 'string', description: '行为模式 / 私密互动。' },
      scenario: { type: 'string', description: '场景 / 世界观 / 关系设定。' },
      first_mes: { type: 'string', description: '开场白。' },
      mes_example: { type: 'string', description: '示例对话（few-shot）。' },
    },
    output: textOutput,
    async execute(args) {
      const state = read()
      // id 必须先算并传入：upsertRole 只在未提供 id 时生成，且生成带随机后缀；
      // 事后重算（如按 name）会得到不同 id，导致 findRole 落空、响应报错。
      const id = args.id || nextId(state, args.name)
      const next = upsertRole(state, { ...args, id })
      await write(next)
      const role = findRole(next, id)
      return `已保存角色「${role.name}」(${role.id})。`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cosplay_remove',
    description: '从角色库删除一个角色（角色库管理，开关关闭时也可用）。',
    parameters: {
      id: { type: 'string', required: true, description: '要删除的角色 id。' },
    },
    output: textOutput,
    async execute(args) {
      const state = read()
      if (!findRole(state, args.id)) return `未找到角色: ${args.id}`
      await write(removeRole(state, args.id))
      return `已删除角色 ${args.id}。`
    },
  }))
}
