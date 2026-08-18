/**
 * dsh-cosplay 纯函数角色库单元测试（node --test，零依赖）。
 * 运行：npm test 或 node --test test/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_STATE,
  DEFAULT_ROLES,
  normalizeState,
  findRole,
  upsertRole,
  removeRole,
  setActiveRole,
  applySeeding,
  renderPersona,
  renderActivePersona,
  roleSummary,
} from '../src/store.js'

test('normalizeState 规整任意输入', () => {
  assert.deepEqual(normalizeState(undefined), EMPTY_STATE)
  assert.deepEqual(normalizeState(null), EMPTY_STATE)
  assert.deepEqual(normalizeState({ roles: [{ id: 'a', name: 'A' }] }), {
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
})

test('applySeeding 仅当角色库为空时种入示例', () => {
  const seeded = applySeeding(EMPTY_STATE)
  assert.deepEqual(seeded.roles, DEFAULT_ROLES)
  assert.equal(seeded.activeRole, DEFAULT_ROLES[0].id)
  const untouched = applySeeding({ activeRole: 'x', roles: [{ id: 'x', name: 'X', description: '' }] })
  assert.equal(untouched.roles.length, 1)
})

test('renderPersona / renderActivePersona', () => {
  const role = { id: 'a', name: '阿明', emoji: '🦊', description: '一只狐狸', style: '俏皮' }
  const text = renderPersona(role)
  assert.ok(text.includes('阿明'))
  assert.ok(text.includes('🦊'))
  assert.ok(text.includes('俏皮'))
  assert.ok(text.includes('Agent'))

  const s = setActiveRole(upsertRole(EMPTY_STATE, { name: 'A', description: 'd' }), null)
  assert.ok(renderActivePersona(s).includes('未选择任何角色')) // 无角色时仍返回引导文本
  const s2 = setActiveRole(upsertRole(EMPTY_STATE, { name: 'A', description: 'd' }), null)
  const id = upsertRole(s2, { name: 'A', description: 'd' }).roles[0].id
  const s3 = setActiveRole(upsertRole(s2, { name: 'A', description: 'd' }), id)
  assert.ok(renderActivePersona(s3).includes('A'))
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
