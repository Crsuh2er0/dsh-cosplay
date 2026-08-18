/**
 * dsh-cosplay 纯函数角色库单元测试（node，零依赖）。
 * 运行：npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_STATE,
  DEFAULT_ROLES,
  normalizeState,
  findRole,
  nextId,
  upsertRole,
  removeRole,
  setActiveRole,
  renderPersona,
  renderActivePersona,
  roleSummary,
  toV2Card,
  fromV2Card,
} from '../src/store.js'

test('normalizeState 规整任意输入（含 enabled / thinkingStyle）', () => {
  assert.deepEqual(normalizeState(undefined), EMPTY_STATE)
  assert.deepEqual(normalizeState(null), EMPTY_STATE)
  assert.equal(normalizeState({ enabled: true }).enabled, true)
  assert.equal(normalizeState({ enabled: 'yes' }).enabled, false) // 非布尔视为关
  assert.equal(normalizeState({}).thinkingStyle, 'neutral') // 默认 neutral
  assert.equal(normalizeState({ thinkingStyle: 'role' }).thinkingStyle, 'role')
  assert.equal(normalizeState({ thinkingStyle: 'banana' }).thinkingStyle, 'neutral') // 非法值回退
  assert.deepEqual(normalizeState({ roles: [{ id: 'a', name: 'A' }] }), {
    enabled: false,
    thinkingStyle: 'neutral',
    activeRole: null,
    roles: [{ id: 'a', name: 'A' }],
  })
  // 非法 activeRole 归空
  const s = normalizeState({ activeRole: 'missing', roles: [{ id: 'a', name: 'A' }] })
  assert.equal(s.activeRole, null)
  // 脏数据过滤
  assert.deepEqual(normalizeState({ roles: [{ id: 'a' }, 'junk', { id: 'b', name: 'B' }] }).roles, [
    { id: 'b', name: 'B' },
  ])
})

test('upsertRole 新建 / 更新 / id 生成', () => {
  const created = upsertRole(EMPTY_STATE, { name: '测试角色', description: 'd' })
  assert.equal(created.roles.length, 1)
  assert.equal(created.roles[0].name, '测试角色')
  assert.equal(created.roles[0].description, 'd')
  assert.ok(created.roles[0].id.startsWith('role-')) // 中文名退化为随机 id
  assert.equal(created.activeRole, null) // 不自动激活
  assert.equal(created.enabled, false) // enabled 透传

  const ascii = upsertRole(EMPTY_STATE, { name: 'Miku Chan', description: 'd' })
  assert.equal(ascii.roles[0].id, 'miku-chan')

  const updated = upsertRole(created, { id: created.roles[0].id, name: '测试角色2', description: 'e' })
  assert.equal(updated.roles.length, 1)
  assert.equal(updated.roles[0].name, '测试角色2')
  assert.equal(updated.roles[0].description, 'e')

  assert.throws(() => upsertRole(EMPTY_STATE, { name: '  ', description: 'd' }), /不能为空/)
})

test('upsertRole id 确定性（工具路径：先算 id 再传入，findRole 必命中）', () => {
  // 复现线上 bug：中文名新建角色时，事后按 name 重算 id 会得到不同随机 id
  const id = nextId(EMPTY_STATE, '庄方宜')
  const next = upsertRole(EMPTY_STATE, { id, name: '庄方宜', description: 'd' })
  assert.equal(findRole(next, id).name, '庄方宜') // 用同一 id 查找必命中
  // 未提供 id 时 upsertRole 自生成的 id 也能从状态中找到
  const auto = upsertRole(EMPTY_STATE, { name: '庄方宜', description: 'd' })
  assert.ok(findRole(auto, auto.roles[0].id))
})

test('removeRole / setActiveRole', () => {
  let s = upsertRole(EMPTY_STATE, { name: 'A', description: 'a' })
  s = upsertRole(s, { name: 'B', description: 'b' })
  const a = s.roles[0].id
  const b = s.roles[1].id
  s = setActiveRole(s, a)
  assert.equal(s.activeRole, a)
  s = removeRole(s, a)
  assert.equal(s.activeRole, null) // 删除激活角色后归空
  assert.equal(s.roles.length, 1)
  s = setActiveRole(s, b)
  assert.equal(s.activeRole, b)
  assert.throws(() => setActiveRole(s, 'missing'), /角色不存在/)
  assert.equal(setActiveRole(s, null).activeRole, null)
  assert.equal(setActiveRole(s, null).enabled, false) // 退出扮演不影响开关
})

test('renderPersona / renderActivePersona（开关门控）', () => {
  const role = { id: 'a', name: '阿明', emoji: '🦊', description: '一只狐狸', style: '俏皮' }
  const text = renderPersona(role)
  assert.ok(text.includes('阿明'))
  assert.ok(text.includes('🦊'))
  assert.ok(text.includes('俏皮'))
  assert.ok(text.includes('Agent'))

  // 关闭：空串（静默回退默认人格）
  assert.equal(renderActivePersona(EMPTY_STATE), '')
  const offWithRole = setActiveRole(upsertRole(EMPTY_STATE, { name: 'A', description: 'd' }), null)
  const rid = upsertRole(offWithRole, { name: 'A', description: 'd' }).roles[0].id
  const offActive = setActiveRole(upsertRole(offWithRole, { name: 'A', description: 'd' }), rid)
  assert.equal(offActive.enabled, false)
  assert.equal(renderActivePersona(offActive), '') // 即使有激活角色，关闭时也渲染空串

  // 开启但未选角色：引导语
  const onNoRole = { ...EMPTY_STATE, enabled: true }
  assert.ok(renderActivePersona(onNoRole).includes('未选择角色'))

  // 开启 + 激活角色：角色卡 + 思维链指令（默认 neutral）
  const onActive = { ...offActive, enabled: true }
  const persona = renderActivePersona(onActive)
  assert.ok(persona.includes('A'))
  assert.ok(persona.includes('【思维模式要求】')) // neutral 指令在 persona 末尾
  // 切换 role：指令随之变化（无残留，每次组装重新求值）
  const rolePersona = renderActivePersona({ ...onActive, thinkingStyle: 'role' })
  assert.ok(rolePersona.includes('【角色沉浸要求】'))
  assert.ok(!rolePersona.includes('【思维模式要求】'))
  // 指令在 persona 末尾（角色卡内容之前，保证指令接近对话）
  assert.ok(rolePersona.indexOf('【角色沉浸要求】') > rolePersona.indexOf('A'))
})

test('roleSummary', () => {
  assert.deepEqual(roleSummary({ id: 'a', name: 'A', emoji: '🦊' }, 'a'), {
    id: 'a',
    name: 'A',
    emoji: '🦊',
    active: true,
  })
  assert.equal(findRole(EMPTY_STATE, 'nope'), undefined)
})

test('酒馆 v2 导入导出映射', () => {
  const role = { id: 'x', name: '测试', emoji: '🐋', description: 'd', personality: 'p', style: 's', rules: 'r', behavior: 'b', scenario: 'sc', first_mes: 'fm', mes_example: 'me', system_prompt: 'sp', creator_notes: 'cn', tags: ['a'] }
  const v2 = toV2Card(role)
  assert.equal(v2.spec, 'chara_card_v2')
  assert.equal(v2.spec_version, '2.0')
  assert.equal(v2.data.name, '测试')
  assert.equal(v2.data.description, 'd')
  assert.equal(v2.data.extensions.dshCosplay.id, 'x')
  assert.equal(v2.data.extensions.dshCosplay.emoji, '🐋')
  assert.equal(v2.data.extensions.dshCosplay.style, 's')
  // 往返无损
  const back = fromV2Card(v2, EMPTY_STATE)
  assert.equal(back.id, 'x')
  assert.equal(back.name, '测试')
  assert.equal(back.personality, 'p')
  assert.equal(back.behavior, 'b')
  assert.equal(back.system_prompt, 'sp')
  assert.deepEqual(back.tags, ['a'])
  // 缺 name 报错
  assert.throws(() => fromV2Card({ data: {} }, EMPTY_STATE), /name/)
  // 无 extensions 的纯 v2 卡也能导入（id 自动生成）
  const plain = fromV2Card({ spec: 'chara_card_v2', data: { name: '外来卡', description: 'x' } }, EMPTY_STATE)
  assert.ok(plain.id)
  assert.equal(plain.name, '外来卡')
  assert.equal(plain.emoji, '')
})

test('默认角色 = 蓝色大肥鱼（v2 字段，指令块置顶）', () => {
  assert.equal(DEFAULT_ROLES.length, 1)
  assert.equal(DEFAULT_ROLES[0].id, 'blue-fat-whale')
  assert.equal(DEFAULT_ROLES[0].name, '蓝色大肥鱼')
  assert.ok(DEFAULT_ROLES[0].system_prompt.includes('[PERSONA_LOAD]'))
  const persona = renderPersona(DEFAULT_ROLES[0])
  assert.ok(persona.includes('蓝色大肥鱼'))
  assert.ok(persona.includes('🐋'))
  assert.ok(persona.indexOf('[PERSONA_LOAD]') < persona.indexOf('【身份】'))
  assert.ok(persona.includes('【守则】'))
  assert.ok(persona.includes('【示例对话】'))
})
