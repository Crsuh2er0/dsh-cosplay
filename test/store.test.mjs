/**
 * dsh-cosplay 纯函数角色库单元测试（node，零依赖）。
 * 运行：npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_STATE,
  normalizeState,
  findRole,
  upsertRole,
  removeRole,
  setActiveRole,
  renderPersona,
  renderActivePersona,
  roleSummary,
} from '../src/store.js'

test('normalizeState 规整任意输入（含 enabled）', () => {
  assert.deepEqual(normalizeState(undefined), EMPTY_STATE)
  assert.deepEqual(normalizeState(null), EMPTY_STATE)
  assert.equal(normalizeState({ enabled: true }).enabled, true)
  assert.equal(normalizeState({ enabled: 'yes' }).enabled, false) // 非布尔视为关
  assert.deepEqual(normalizeState({ roles: [{ id: 'a', name: 'A' }] }), {
    enabled: false,
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

  // 开启 + 激活角色：角色卡
  const onActive = { ...offActive, enabled: true }
  assert.ok(renderActivePersona(onActive).includes('A'))
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
