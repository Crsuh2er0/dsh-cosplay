/**
 * dsh-cosplay — 主机侧核心插件（组合行 id: cosplay-core）。
 *
 * 形态：全局开关（Round 3 决策）。
 *   - 注册 settings 命名空间 `cosplay`（角色库 + 开关，$DSH_HOME/settings.yaml，
 *     热重载、schema 校验、revision 栅栏写入；内置示例角色经 composition base
 *     层提供，零启动写入）；
 *   - 提供 `cosplay` 服务（角色 CRUD / 激活 / 开关）；
 *   - 注册**全局**追加人格段 `cosplay-persona`（位于 persona 之后）与
 *     `{{cosplay_active}}` 变量：变量每次模型步骤组装时求值，开关关闭时渲染
 *     空串（人格静默回退），开启时渲染激活角色卡 —— 开/关/换角色下一模型步骤
 *     即生效，无需重建会话；
 *   - 注册**全局** `cosplay_*` 工具：`cosplay_switch` 在开关关闭时软禁用
 *     （提示先开启）；角色库管理工具（list/show/upsert/remove）始终可用。
 *
 * 本行是纯主机平面：不依赖任何 preset。全局生效范围含所有会话与子代理
 * （Round 3 已与用户确认）。
 */
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { PERSONA_ORDER } from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  normalizeState,
  DEFAULT_ROLES,
  upsertRole,
  removeRole,
  setActiveRole,
  findRole,
  renderActivePersona,
  renderPersona,
} from './store.js'

export const name = 'cosplay-core'
export const inject = ['settings', 'systemPrompt', 'tools', 'typert']

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

// schemastery 无 null 类型：activeRole 以空串表示"未选择"（存储层），
// store 层内部仍用 null 语义，写入时序列化为空串。
const CosplaySettingsSchema = z.object({
  enabled: z.boolean().default(false),
  thinkingStyle: z.union(['neutral', 'role']).default('neutral'),
  activeRole: z.string().default(''),
  roles: z.array(RoleCardSchema).default([]),
})

export const Config = z.object({})

/** 追加人格段的段名（与 persona 段名不同，避免同一层重复名冲突）。 */
export const PERSONA_SECTION_ADDON = 'cosplay-persona'

const textOutput = {
  schema: { type: 'string' },
  render(_args, value) {
    return [{ type: 'text', text: String(value) }]
  },
}

// ── typert Remote（浏览器设置页的数据通道） ─────────────────────────────────
// settings 命名空间对 Web 配置客户端有硬编码暴露白名单（dsh-host-apiproxy 的
// WEB/PRODUCT_SETTINGS_NAMESPACES，第三方命名空间默认不可远程读写），因此
// 设置页改走插件自有的 Typert Remote 通道（dsh-at-file 同款模式）。codec 使用
// { mode: 'src-json' }，无需 zod schema。

/**
 * 以纯 JS 应用 TC39 现代装饰器 @Remote：
 * addMarkerInitializer 要求 context.addInitializer(fn)，fn 以实例为 this 执行，
 * 取 Object.getPrototypeOf(instance)（= 本类原型）写入 typert 内部 marker 表。
 */
function markRemoteMethod(proto, methodName) {
  const probe = Object.create(proto)
  Remote(proto[methodName], {
    kind: 'method',
    name: methodName,
    static: false,
    private: false,
    addInitializer(fn) {
      fn.call(probe)
    },
  })
}

/** 设置页可用的角色库读写服务（Remote 命名空间 `cosplay`）。 */
class CosplayRuntime extends TypertRemoteService {
  constructor(ctx, read, write) {
    super(ctx, 'cosplay')
    this._read = read
    this._write = write
  }
  getState() {
    return this._read()
  }
  async upsertRole(card) {
    return this._write(upsertRole(this._read(), card))
  }
  async removeRole(id) {
    return this._write(removeRole(this._read(), id))
  }
  async setActiveRole(id) {
    // id 为 null 表示退出扮演（写入层序列化为空串）
    return this._write(setActiveRole(this._read(), id))
  }
  async setEnabled(enabled) {
    return this._write({ ...this._read(), enabled: enabled === true })
  }
  async setThinkingStyle(style) {
    const next = style === 'role' ? 'role' : 'neutral'
    return this._write({ ...this._read(), thinkingStyle: next })
  }
}
for (const method of ['getState', 'upsertRole', 'removeRole', 'setActiveRole', 'setEnabled', 'setThinkingStyle']) {
  markRemoteMethod(CosplayRuntime.prototype, method)
}

/** strict codec 的极简 schema：透传校验（免 zod）。 */
const passthroughSchema = { parse: (value) => value }
const strictCodec = (typeSymbol) => ({ mode: 'strict', typeSymbol, schema: passthroughSchema })

const COSPLAY_INVOCATIONS = [
  {
    id: 'dsh-cosplay#cosplay/getState',
    service: 'cosplay',
    namespace: 'cosplay',
    method: 'getState',
    invocation: { kind: 'direct' },
    parameters: [],
    result: strictCodec('dsh-cosplay#CosplayState'),
  },
  {
    id: 'dsh-cosplay#cosplay/upsertRole',
    service: 'cosplay',
    namespace: 'cosplay',
    method: 'upsertRole',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'card', wire: 'card', source: 'json', codec: strictCodec('dsh-cosplay#RoleCard') }],
    result: strictCodec('dsh-cosplay#CosplayState'),
  },
  {
    id: 'dsh-cosplay#cosplay/removeRole',
    service: 'cosplay',
    namespace: 'cosplay',
    method: 'removeRole',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'id', wire: 'id', source: 'json', codec: strictCodec('dsh-cosplay#RoleId') }],
    result: strictCodec('dsh-cosplay#CosplayState'),
  },
  {
    id: 'dsh-cosplay#cosplay/setActiveRole',
    service: 'cosplay',
    namespace: 'cosplay',
    method: 'setActiveRole',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'id', wire: 'id', source: 'json', codec: strictCodec('dsh-cosplay#RoleId') }],
    result: strictCodec('dsh-cosplay#CosplayState'),
  },
  {
    id: 'dsh-cosplay#cosplay/setEnabled',
    service: 'cosplay',
    namespace: 'cosplay',
    method: 'setEnabled',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'enabled', wire: 'enabled', source: 'json', codec: strictCodec('dsh-cosplay#Enabled') }],
    result: strictCodec('dsh-cosplay#CosplayState'),
  },
  {
    id: 'dsh-cosplay#cosplay/setThinkingStyle',
    service: 'cosplay',
    namespace: 'cosplay',
    method: 'setThinkingStyle',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'style', wire: 'style', source: 'json', codec: strictCodec('dsh-cosplay#ThinkingStyle') }],
    result: strictCodec('dsh-cosplay#CosplayState'),
  },
]

const COSPLAY_MEMBERS = [
  { kind: 'method', name: 'getState', signature: 'getState(): CosplayState' },
  { kind: 'method', name: 'upsertRole', signature: 'upsertRole(card: RoleCard): Promise<CosplayState>' },
  { kind: 'method', name: 'removeRole', signature: 'removeRole(id: string): Promise<CosplayState>' },
  { kind: 'method', name: 'setActiveRole', signature: 'setActiveRole(id: string | null): Promise<CosplayState>' },
  { kind: 'method', name: 'setEnabled', signature: 'setEnabled(enabled: boolean): Promise<CosplayState>' },
  { kind: 'method', name: 'setThinkingStyle', signature: 'setThinkingStyle(style: "neutral" | "role"): Promise<CosplayState>' },
]

const TYPERT_MANIFEST = {
  package: 'dsh-cosplay',
  face: 'host',
  schemas: [],
  model: {
    services: [
      {
        key: 'cosplay',
        exportName: 'CosplayRuntime',
        description: 'Cosplay 角色库与开关（dsh-cosplay 设置页数据通道）。',
        tags: [],
        members: COSPLAY_MEMBERS,
      },
    ],
    events: [],
    objects: [],
  },
  invocations: COSPLAY_INVOCATIONS,
}

export function apply(ctx) {
  const ns = settingsNamespace('cosplay')
  // 内置示例角色通过 composition base 层提供：零启动写入（避免装载期排队写入
  // 命中被替换的注册）、无竞态；用户编辑写入 user 层覆盖 base。
  ctx.settings.register(ns, CosplaySettingsSchema, {
    base: { enabled: false, thinkingStyle: 'neutral', activeRole: DEFAULT_ROLES[0].id, roles: DEFAULT_ROLES },
  })

  const read = () => normalizeState(ctx.settings.get(ns))
  const write = async (next) => {
    // 序列化：activeRole 的 null 语义 → 空串（schema 无 null 类型）
    await ctx.settings.replace(ns, { ...next, activeRole: next.activeRole ?? '' })
    return next
  }

  // ── typert Remote（设置页数据通道；同时注册 `cosplay` 服务） ───────────────
  new CosplayRuntime(ctx, read, write)
  ctx.effect(() => {
    const dispose = ctx.typert.register(TYPERT_MANIFEST)
    return () => {
      void dispose()
    }
  }, 'dsh-cosplay: typert manifest')

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

  // TEMP-DIAG: 激活标记（定位后移除）
  console.log('[dsh-cosplay] cosplay-core activated; typert manifest registered')
}

/** 新建角色的实际 id（与 store.nextId 的生成规则保持一致）。 */
function nextIdOf(state, name) {
  const slug = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug && !state.roles.some((r) => r.id === slug)
    ? slug
    : `${slug || 'role'}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
}
