/**
 * dsh-cosplay — Cosplay 模式预设行（组合行 id: cosplay-preset，包入口 dsh-cosplay/preset）。
 *
 * 只出现在 cosplay 预设的 agent.cordis.yml 中，因此：
 *   - `cosplay_*` 工具仅对运行在 Cosplay 模式下的会话可见；
 *   - `{{cosplay_active}}` 提示词变量仅在该作用域注册 —— 模式门控由此成立。
 *
 * 变量提供器在每次组装（每个模型步骤前）重新求值：中途切换角色后，
 * 从下一个模型步骤起人格即生效，无需重建会话。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import {
  EMPTY_STATE,
  normalizeState,
  upsertRole,
  removeRole,
  setActiveRole,
  findRole,
  renderActivePersona,
  renderPersona,
  roleSummary,
} from './store.js'

export const name = 'cosplay-preset'

export const Config = z.object({})

const textOutput = {
  schema: { type: 'string' },
  render(_args, value) {
    return [{ type: 'text', text: String(value) }]
  },
}

export function apply(ctx) {
  const ns = settingsNamespace('cosplay')
  const read = () => normalizeState(ctx.settings.get(ns))
  const write = async (next) => {
    await ctx.settings.replace(ns, next)
    return next
  }

  // 1) persona 变量：cosplay 预设的 persona 行引用 {{cosplay_active}}。
  ctx.systemPrompt.variable('cosplay_active', () => renderActivePersona(read()))

  // 2) 模型工具：查看 / 列出 / 切换 / 增改 / 删除角色。
  ctx.tools.register(defineTool({
    name: 'cosplay_show',
    description:
      '查看当前激活角色的角色卡，或按 id 查看指定角色的角色卡。用于确认自己此刻扮演谁、以及该角色的设定、语气与行为守则。',
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
    description: '列出角色库中全部角色及其激活状态。',
    parameters: {},
    output: textOutput,
    async execute() {
      const state = read()
      if (state.roles.length === 0) return '角色库为空。'
      const lines = state.roles.map((r) => {
        const mark = r.id === state.activeRole ? '★ 激活' : '   '
        return `${mark} ${r.emoji ?? ''} ${r.name} (${r.id})`
      })
      return lines.join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cosplay_switch',
    description: '切换当前扮演的角色（按角色 id）；id 传 null 可退出扮演、恢复默认身份。',
    parameters: {
      id: { type: 'string', required: true, description: '目标角色 id；传字符串 "null" 表示退出扮演。' },
    },
    output: textOutput,
    async execute(args) {
      const state = read()
      const id = args.id === 'null' ? null : args.id
      const next = setActiveRole(state, id)
      await write(next)
      return id === null ? '已退出扮演，恢复默认身份。' : `已切换到角色「${findRole(next, id).name}」。`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cosplay_upsert',
    description:
      '创建或更新一个角色。未提供 id 时创建新角色（按 name 生成 id）；提供 id 时更新既有角色。支持用户随时自定义任何角色。',
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
      const next = upsertRole(read(), args)
      await write(next)
      const role = findRole(next, args.id || nextIdOf(next, args.name))
      return `已保存角色「${role.name}」(${role.id})。`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cosplay_remove',
    description: '从角色库删除一个角色。',
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

/** 新建角色的实际 id（与 store.upsertRole 的 id 生成保持一致）。 */
function nextIdOf(state, name) {
  const slug = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug && !state.roles.some((r) => r.id === slug)
    ? slug
    : `${slug || 'role'}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
}
