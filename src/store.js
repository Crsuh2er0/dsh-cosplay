/**
 * dsh-cosplay — 纯函数角色库逻辑（零依赖，可独立测试）。
 *
 * 角色库以 settings 命名空间 `cosplay` 的用户层文档存储：
 *
 *   cosplay:
 *     activeRole: <role-id | null>
 *     roles:
 *       - id: string            # 稳定 slug
 *         name: string          # 显示名
 *         emoji: string?        # 头像字符
 *         description: string   # 角色背景 / 性格（我是谁）
 *         style: string?        # 说话风格（怎么说话）
 *         rules: string?        # 行为守则（该做什么 / 不做什么）
 *         greeting: string?     # 开场白
 *         sample: string?       # 示例对话（few-shot）
 */

/** 随插件内置的示例角色，首次安装时种子写入，便于开箱即用。 */
export const DEFAULT_ROLES = [
  {
    id: 'librarian-chan',
    name: '小林',
    emoji: '📚',
    description: '一位温柔耐心的社区书店店主，喜欢阅读和倾听，总能用温暖的语气安抚人心。',
    style: '语气温和，多用"呀 / 呢 / 哦"等语气词，偶尔引用书中金句。',
    rules: '永远先关心用户的情绪与需求；不打断；回答保持简洁但有温度。',
    greeting: '欢迎光临小林的书店～今天想聊点什么呀？',
  },
  {
    id: 'senpai-dev',
    name: '前辈酱',
    emoji: '👩‍💻',
    description: '经验丰富但嘴硬心软的资深工程师前辈，擅长把复杂的技术讲得简单明白。',
    style: '说话干练带一点毒舌，习惯用"这点小事""也就"开头，但讲解极其认真细致。',
    rules: '先给结论再给原理；代码示例必须可运行；批评代码、不批评人。',
    greeting: '哟，又遇到难题了？说吧，前辈帮你看看。',
  },
]

export const EMPTY_STATE = { activeRole: null, roles: [] }

/** 将任意来源的值规整为角色库状态（防御性过滤）。 */
export function normalizeState(value) {
  const v = value && typeof value === 'object' ? value : {}
  const roles = Array.isArray(v.roles)
    ? v.roles.filter(
        (r) => r && typeof r === 'object' && typeof r.id === 'string' && typeof r.name === 'string',
      )
    : []
  const activeRole =
    typeof v.activeRole === 'string' && roles.some((r) => r.id === v.activeRole)
      ? v.activeRole
      : null
  return { activeRole, roles }
}

/** 按 id 查找角色。 */
export function findRole(state, id) {
  return state.roles.find((r) => r.id === id)
}

/** 从名字生成 ascii slug（中文名退化为空串，由 nextId 补随机后缀）。 */
export function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** 生成唯一角色 id：优先名字 slug，冲突或不可用则加随机后缀。 */
export function nextId(state, name) {
  const base = slugify(name)
  if (base && !state.roles.some((r) => r.id === base)) return base
  const stamp = Date.now().toString(36)
  const rand = Math.floor(Math.random() * 1296).toString(36)
  return `${base || 'role'}-${stamp}${rand}`
}

/** 创建或更新一个角色（按 id；无 id 时按 name 生成）。不改变当前激活角色。 */
export function upsertRole(state, card) {
  const name = typeof card.name === 'string' ? card.name.trim() : ''
  if (!name) throw new Error('角色名不能为空')
  const id = typeof card.id === 'string' && card.id ? card.id : nextId(state, name)
  const exists = state.roles.some((r) => r.id === id)
  const next = exists
    ? { ...state, roles: state.roles.map((r) => (r.id === id ? { ...r, ...card, id, name } : r)) }
    : { ...state, roles: [...state.roles, { ...card, id, name }] }
  return next
}

/** 删除角色；若删除的是激活角色，activeRole 归空。 */
export function removeRole(state, id) {
  return {
    ...state,
    roles: state.roles.filter((r) => r.id !== id),
    activeRole: state.activeRole === id ? null : state.activeRole,
  }
}

/** 切换激活角色；id 为 null 表示退出扮演。 */
export function setActiveRole(state, id) {
  if (id === null) return { ...state, activeRole: null }
  if (!findRole(state, id)) throw new Error(`角色不存在: ${id}`)
  return { ...state, activeRole: id }
}

/** 首次安装种子：无角色时写入内置示例并激活第一个。 */
export function applySeeding(state) {
  if (state.roles.length > 0) return state
  return { ...state, roles: [...DEFAULT_ROLES], activeRole: state.activeRole ?? DEFAULT_ROLES[0].id }
}

/** 将一张角色卡渲染成 persona 段落文本。 */
export function renderPersona(role) {
  if (!role) return ''
  const parts = [`你正在扮演角色「${role.name}」${role.emoji ?? ''}`.trim()]
  if (role.description) parts.push(`【角色设定】${role.description}`)
  if (role.style) parts.push(`【说话风格】${role.style}`)
  if (role.rules) parts.push(`【行为守则】${role.rules}`)
  if (role.greeting) parts.push(`【开场白】${role.greeting}`)
  if (role.sample) parts.push(`【示例对话】${role.sample}`)
  parts.push('始终保持角色设定与口吻，同时继续作为 Agent 助手为用户完成实际工作（编码、读写文件、检索资料等）。')
  return parts.join('\n')
}

/** 渲染当前激活角色的 persona 文本；未选择角色时给出引导语（不可返回空串）。 */
export function renderActivePersona(state) {
  const active = state.activeRole ? findRole(state, state.activeRole) : undefined
  if (!active) {
    return '当前未选择任何角色。可用 cosplay_list 查看、cosplay_switch 切换，或在设置页「角色扮演」中管理；在此之前请保持默认的助手身份与风格。'
  }
  return renderPersona(active)
}

/** 工具视图用的角色摘要。 */
export function roleSummary(role, activeRole) {
  return {
    id: role.id,
    name: role.name,
    emoji: role.emoji ?? '',
    active: role.id === activeRole,
  }
}
