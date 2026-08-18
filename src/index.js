/**
 * dsh-cosplay — 主机侧核心插件（组合行 id: cosplay-core）。
 *
 * 形态：全局开关（Round 3 决策）。
 *   - 注册 settings 命名空间 `cosplay`（角色库 + 开关，$DSH_HOME/settings.yaml，
 *     热重载、schema 校验、revision 栅栏写入）；
 *   - 提供 `cosplay` 服务（角色 CRUD / 激活 / 开关）；
 *   - 注册**全局**追加人格段 `cosplay-persona`（位于 persona 之后）与
 *     `{{cosplay_active}}` 变量：变量每次模型步骤组装时求值，开关关闭时渲染
 *     空串（人格静默回退），开启时渲染激活角色卡 —— 开/关/换角色下一模型步骤
 *     即生效，无需重建会话；
 *   - 注册**全局** `cosplay_*` 工具：`cosplay_switch` 在开关关闭时软禁用
 *     （提示先开启）；角色库管理工具（list/show/upsert/remove）始终可用。
 *
 * 本行是纯主机平面：不依赖任何 preset，也不安装任何预设（Round 3 决策：移除
 * 独立「Cosplay 模式」预设）。全局生效范围含所有会话与子代理（用户已确认）。
 */
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { PERSONA_ORDER } from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  normalizeState,
  applySeeding,
  upsertRole,
  removeRole,
  setActiveRole,
  findRole,
  renderActivePersona,
  renderPersona,
} from './store.js'

export const name = 'cosplay-core'
export const inject = ['settings', 'systemPrompt', 'tools']

const RoleCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().optional(),
  description: z.string(),
  style: z.string().optional(),
  rules: z.string().optional(),
  greeting: z.string().optional(),
  sample: z.string().optional(),
})

const CosplaySettingsSchema = z.object({
  enabled: z.boolean().default(false),
  activeRole: z.string().nullable().default(null),
  roles: z.array(RoleCardSchema).default([]),
})

export const Config = z.object({})

/** 追加人格段的段名（与 persona 不同名，避免同一层重复名冲突）。 */
export const PERSONA_SECTION_ADDON = 'cosplay-persona'

const textOutput = {
  schema: { type: 'string' },
  render(_args, value) {
    return [{ type: 'text', text: String(value) }]
  },
}

export function apply(ctx) {
  const ns = settingsNamespace('cosplay')
  const scope = ctx.settings.register(ns, CosplaySettingsSchema)

  const read = () => normalizeState(ctx.settings.get(ns))
  const write = async (next) => {
    await ctx.settings.replace(ns, next)
    return next
  }

  // 首次安装种子：角色库为空时写入内置示例角色并激活第一个（开关保持默认关）。
  const current = read()
  const seeded = applySeeding(current)
  if (seeded.roles.length !== current.roles.length) {
    void ctx.settings.replace(ns, seeded)
  }

  // ── cosplay 服务 ──────────────────────────────────────────────────────────
  const service = {
    /** 当前完整状态（已规整）。 */
    state: () => read(),
    /** 开关状态。 */
    isEnabled: () => read().enabled,
    /** 角色摘要列表（含激活标记）。 */
    list: () => read().roles.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji ?? '', active: r.id === read().activeRole })),
    /** 当前激活角色卡片；未激活返回 null。 */
    active: () => (read().activeRole ? findRole(read(), read().activeRole) ?? null : null),
    /** 创建 / 更新角色。 */
    upsert: async (card) => write(upsertRole(read(), card)),
    /** 删除角色。 */
    remove: async (id) => write(removeRole(read(), id)),
    /** 切换激活角色；null 退出扮演（开关状态不变）。 */
    setActive: async (id) => write(setActiveRole(read(), id)),
    /** 设置全局开关。 */
    setEnabled: async (enabled) => write({ ...read(), enabled: enabled === true }),
    scope,
  }
  ctx.provide('cosplay', service)

  // ── 人格注入（全局，随变量每次组装求值） ──────────────────────────────────
  ctx.systemPrompt.variable('cosplay_active', () => renderActivePersona(read()))
  ctx.systemPrompt.section({
    name: PERSONA_SECTION_ADDON,
    order: PERSONA_ORDER + 1,
    text: '{{cosplay_active}}',
  })

  // ── 全局工具（模式门控：开关关闭时 switch 软禁用） ────────────────────────
  ctx.tools.register(defineTool({
    name: 'cosplay_show',
    description:
      '查看当前激活角色的角色卡，或按 id 查看指定角色的角色卡。用于确认角色设定、语气与行为守则（Cosplay 开关关闭时也可预览）。',
    parameters: {
      id: { type: 'string', required: false, description: '角色 id；省略时返回当前激活角色。' },
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
      '创建或更新一个角色（角色库管理，开关关闭时也可用）。未提供 id 时创建新角色（按 name 生成 id）；提供 id 时更新既有角色。支持用户随时自定义任何角色。',
    parameters: {
      id: { type: 'string', required: false, description: '既有角色 id；省略表示新建。' },
      name: { type: 'string', required: true, description: '角色显示名。' },
      emoji: { type: 'string', required: false, description: '头像字符（如 📚）。' },
      description: { type: 'string', required: true, description: '角色背景与性格设定（我是谁）。' },
      style: { type: 'string', required: false, description: '说话风格（怎么说话）。' },
      rules: { type: 'string', required: false, description: '行为守则（该做什么 / 不做什么）。' },
      greeting: { type: 'string', required: false, description: '开场白。' },
      sample: { type: 'string', required: false, description: '示例对话（few-shot）。' },
    },
    output: textOutput,
    async execute(args) {
      const state = read()
      const next = upsertRole(state, args)
      await write(next)
      const role = findRole(next, args.id || nextIdOf(next, args.name))
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

/** 新建角色的实际 id（与 store.nextId 的生成规则保持一致）。 */
function nextIdOf(state, name) {
  const slug = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug && !state.roles.some((r) => r.id === slug)
    ? slug
    : `${slug || 'role'}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
}
