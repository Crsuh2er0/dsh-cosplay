/**
 * dsh-cosplay — 浏览器侧（dsh.client 声明，包入口 dsh-cosplay/client）。
 *
 * 设置页新增「角色扮演」页（settings.section 列表条目，与 General / Models /
 * Plugins 同级），承载：
 *   - 全局开关（enabled）；
 *   - 角色库管理：列表 / 激活 / 新建 / 编辑 / 删除；
 *   - 角色卡字段：name / emoji / description / style / rules / greeting / sample。
 *
 * 数据通道：ctx.settingsScope.bind({ namespace: 'cosplay' }) ——
 * dsh-client-ui-settings 提供的 Host 传输（快照 + 按 revision 栅栏写入），
 * 组件经 useSyncExternalStore 订阅快照。格式为 __ModuleLoader__ 的 CJS-factory
 * 形式（与内置客户端包一致）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-cosplay',
  factory: (require) => {
    const React = require('react')
    const { useSyncExternalStore, useState, useCallback } = React

    const NAMESPACE = 'cosplay'
    const EMPTY_FORM = { name: '', emoji: '', description: '', style: '', rules: '', greeting: '', sample: '' }

    const styles = {
      page: { display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0', maxWidth: '720px' },
      card: { border: '1px solid var(--dsw-alias-border-strong, rgba(128,128,128,.3))', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' },
      row: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
      title: { fontSize: '15px', fontWeight: 600 },
      hint: { fontSize: '13px', opacity: 0.72, lineHeight: '1.6' },
      switchTrack: { display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' },
      switchBox: { width: '38px', height: '22px', borderRadius: '11px', position: 'relative', transition: 'background .15s', background: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.35))' },
      switchKnob: { width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: '3px', transition: 'left .15s' },
      button: { border: '1px solid var(--dsw-alias-border-strong, rgba(128,128,128,.3))', background: 'transparent', color: 'inherit', borderRadius: '8px', padding: '4px 10px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
      buttonPrimary: { border: 'none', background: 'var(--dsw-specific-accent, #4d6bfe)', color: '#fff', borderRadius: '8px', padding: '5px 12px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
      input: { background: 'transparent', border: '1px solid var(--dsw-alias-border-strong, rgba(128,128,128,.3))', borderRadius: '8px', padding: '5px 8px', color: 'inherit', fontSize: '13px', fontFamily: 'inherit', flex: 1, minWidth: '160px' },
      textarea: { background: 'transparent', border: '1px solid var(--dsw-alias-border-strong, rgba(128,128,128,.3))', borderRadius: '8px', padding: '5px 8px', color: 'inherit', fontSize: '13px', fontFamily: 'inherit', width: '100%', minHeight: '56px', resize: 'vertical', boxSizing: 'border-box' },
      badge: { fontSize: '12px', padding: '1px 8px', borderRadius: '99px', background: 'var(--dsw-specific-accent, #4d6bfe)', color: '#fff' },
      label: { fontSize: '12px', opacity: 0.6, minWidth: '64px' },
    }

    return {
      name: 'cosplay-client',
      inject: ['slots', 'connection', 'remote', 'settingsScope'],
      apply(ctx) {
        const scope = ctx.settingsScope.bind({ namespace: NAMESPACE })
        const slots = ctx.get('slots')
        if (slots === undefined) return
        slots.inject('settings.section', () =>
          slots.register(
            { name: 'settings.section', id: 'cosplay', order: 100, label: '角色扮演' },
            () => React.createElement(CosplaySection, { scope }),
          ),
        )
      },
    }

    function CosplaySection({ scope }) {
      // scope 的 subscribe/getSnapshot 是基于 this 的方法：必须用箭头函数包一层，
      // 否则裸引用传给 useSyncExternalStore 会以 undefined this 调用而抛错。
      const snapshot = useSyncExternalStore(
        (listener) => scope.subscribe(listener),
        () => scope.getSnapshot(),
      )
      const value = snapshot.value
      const writable = snapshot.writable !== false

      // 编辑表单状态
      const [editingId, setEditingId] = useState(null) // null = 新建
      const [form, setForm] = useState(EMPTY_FORM)

      const setField = useCallback((key, v) => setForm((f) => ({ ...f, [key]: v })), [])

      const beginEdit = useCallback((role) => {
        setEditingId(role ? role.id : null)
        setForm(
          role
            ? { name: role.name, emoji: role.emoji ?? '', description: role.description ?? '', style: role.style ?? '', rules: role.rules ?? '', greeting: role.greeting ?? '', sample: role.sample ?? '' }
            : EMPTY_FORM,
        )
      }, [])

      const save = useCallback(async () => {
        if (!form.name.trim()) return
        const roles = value?.roles ?? []
        const next = editingId
          ? roles.map((r) => (r.id === editingId ? { ...r, ...form, name: form.name.trim(), id: editingId } : r))
          : [...roles, { ...form, name: form.name.trim() }] // id 由主机侧生成
        await scope.set('roles', next)
        if (!editingId && !value?.activeRole) await scope.set('activeRole', next[next.length - 1].id)
        setEditingId(null)
        setForm(EMPTY_FORM)
      }, [form, editingId, value, scope])

      const remove = useCallback(async (id) => {
        if (typeof window !== 'undefined' && !window.confirm(`确定删除角色 ${id} 吗？`)) return
        await scope.set('roles', (value?.roles ?? []).filter((r) => r.id !== id))
        if (value?.activeRole === id) await scope.unset('activeRole') // 清空用 unset（回退 schema 默认）
      }, [value, scope])

      const setActive = useCallback(async (id) => {
        await scope.set('activeRole', id)
      }, [scope])

      const toggle = useCallback(async () => {
        await scope.set('enabled', !(value?.enabled === true))
      }, [value, scope])

      if (snapshot.status === 'loading') {
        return React.createElement('div', { style: styles.hint }, '角色扮演设置加载中…')
      }
      if (snapshot.status === 'unavailable') {
        return React.createElement('div', { style: styles.hint }, '角色库不可用：settings 服务未暴露命名空间 cosplay。')
      }

      const enabled = value?.enabled === true
      const roles = value?.roles ?? []
      const activeRole = value?.activeRole ?? null

      return React.createElement(
        'div',
        { style: styles.page },
        // ── 主开关 ──
        React.createElement(
          'div',
          { style: styles.card },
          React.createElement('div', { style: styles.title }, '🎭 角色扮演'),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement(
              'label',
              { style: styles.switchTrack },
              React.createElement(
                'span',
                {
                  style: { ...styles.switchBox, background: enabled ? 'var(--dsw-specific-accent, #4d6bfe)' : styles.switchBox.background },
                  onClick: writable ? toggle : undefined,
                },
                React.createElement('span', { style: { ...styles.switchKnob, left: enabled ? '19px' : '3px' } }),
              ),
              React.createElement('span', null, enabled ? 'Cosplay 模式：开启' : 'Cosplay 模式：关闭'),
            ),
            React.createElement(
              'span',
              { style: styles.hint },
              writable ? '开启后，所有会话（含子代理）将以当前激活角色的设定与语气对话；关闭后下一轮对话即回退默认人格。' : '（当前为只读/内存模式，无法写入）',
            ),
          ),
          React.createElement(
            'div',
            { style: styles.hint },
            enabled
              ? activeRole
                ? `当前扮演：${roles.find((r) => r.id === activeRole)?.name ?? activeRole}`
                : '已开启但未选择角色 —— 请在下方的角色列表中「设为当前」。'
              : '默认关闭：开启后才生效（opt-in）。',
          ),
        ),
        // ── 角色列表 ──
        React.createElement(
          'div',
          { style: styles.card },
          React.createElement('div', { style: styles.row },
            React.createElement('div', { style: styles.title }, '角色库'),
            React.createElement('button', { style: styles.buttonPrimary, onClick: writable ? () => beginEdit(null) : undefined }, '＋ 新建角色'),
          ),
          roles.length === 0
            ? React.createElement('div', { style: styles.hint }, '角色库为空。点击「新建角色」创建第一个角色，或用 cosplay_upsert 工具。')
            : React.createElement(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                roles.map((role) =>
                  React.createElement(
                    'div',
                    { key: role.id, style: styles.row },
                    React.createElement('span', null, `${role.emoji ?? ''} ${role.name}`),
                    role.id === activeRole
                      ? React.createElement('span', { style: styles.badge }, '当前')
                      : null,
                    React.createElement('span', { style: { ...styles.hint, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, role.description ?? ''),
                    React.createElement('button', { style: styles.button, onClick: writable ? () => setActive(role.id) : undefined }, '设为当前'),
                    React.createElement('button', { style: styles.button, onClick: writable ? () => beginEdit(role) : undefined }, '编辑'),
                    React.createElement('button', { style: styles.button, onClick: writable ? () => remove(role.id) : undefined }, '删除'),
                  ),
                ),
              ),
        ),
        // ── 新建 / 编辑表单 ──
        React.createElement(
          'div',
          { style: styles.card },
          React.createElement('div', { style: styles.title }, editingId ? `编辑角色：${editingId}` : '新建角色'),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '名称 *'),
            React.createElement('input', { style: styles.input, value: form.name, onChange: (e) => setField('name', e.target.value), placeholder: '角色名' }),
            React.createElement('span', { style: styles.label }, '头像'),
            React.createElement('input', { style: { ...styles.input, maxWidth: '80px' }, value: form.emoji, onChange: (e) => setField('emoji', e.target.value), placeholder: '📚' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '设定 *'),
            React.createElement('textarea', { style: styles.textarea, value: form.description, onChange: (e) => setField('description', e.target.value), placeholder: '角色背景与性格（我是谁）' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '语气'),
            React.createElement('input', { style: styles.input, value: form.style, onChange: (e) => setField('style', e.target.value), placeholder: '说话风格（怎么说话）' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '守则'),
            React.createElement('input', { style: styles.input, value: form.rules, onChange: (e) => setField('rules', e.target.value), placeholder: '行为守则（该做什么 / 不做什么）' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '开场白'),
            React.createElement('input', { style: styles.input, value: form.greeting, onChange: (e) => setField('greeting', e.target.value), placeholder: '可选' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '示例对话'),
            React.createElement('textarea', { style: styles.textarea, value: form.sample, onChange: (e) => setField('sample', e.target.value), placeholder: '可选：few-shot 示例' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('button', { style: styles.buttonPrimary, onClick: writable ? save : undefined }, '保存'),
            editingId ? React.createElement('button', { style: styles.button, onClick: () => { setEditingId(null); setForm(EMPTY_FORM) } }, '取消') : null,
          ),
        ),
      )
    }
  },
})
