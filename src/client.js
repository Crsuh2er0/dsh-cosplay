/**
 * dsh-cosplay — 浏览器侧（dsh.client 声明，包入口 dsh-cosplay/client）。
 *
 * 设置页新增「角色扮演」页（settings.section 列表条目），承载：
 *   - 全局开关（enabled）；
 *   - 角色库管理：列表 / 激活 / 新建 / 编辑 / 删除；
 *   - 角色卡字段：name / emoji / description / style / rules / greeting / sample。
 *
 * 数据通道：dsh 0.2.0 起设置项就是插件 Config 的 volatile 字段，共享表单服务
 * `ctx.configForms`（`@deepseek-ai/dsh-client-ui-settings` 提供）按 profile 条目
 * id 读写该命名空间：`get(entryId)` 取 `ConfigForm`（`getSnapshot` / `subscribe` /
 * `mutate`），`whileServed([entryId], ...)` 保证主机真的服务该命名空间时才注册页面。
 * 角色库的增删改在这一侧改写整份 `roles` 数组后整段提交，纯函数逻辑与主机侧
 * store.js 保持一致。
 *
 * 格式为 __ModuleLoader__ 的 CJS-factory 形式（与内置客户端包一致）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-cosplay',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { useSyncExternalStore, useState, useCallback } = React

    /** settings 命名空间 = 本插件的 profile 条目 id（组合行 id，见 cordis.patch.yml）。 */
    const NAMESPACE = 'cosplay-core'

    const EMPTY_FORM = { name: '', emoji: '', system_prompt: '', description: '', personality: '', style: '', rules: '', behavior: '', scenario: '', first_mes: '', mes_example: '', creator_notes: '' }

    // 酒馆 v2 导入导出映射（与主机侧 store.js 保持一致）
    const CARD_TEXT_FIELDS = ['description', 'personality', 'scenario', 'first_mes', 'mes_example', 'system_prompt', 'post_history_instructions', 'creator_notes', 'character_version', 'creator']
    const PLUGIN_FIELDS = ['style', 'rules', 'behavior']
    function toV2Card(role) {
      const data = { name: role.name }
      for (const field of CARD_TEXT_FIELDS) if (role[field]) data[field] = role[field]
      if (Array.isArray(role.tags) && role.tags.length > 0) data.tags = [...role.tags]
      const plugin = { id: role.id }
      if (role.emoji) plugin.emoji = role.emoji
      for (const field of PLUGIN_FIELDS) if (role[field]) plugin[field] = role[field]
      data.extensions = { dshCosplay: plugin }
      return { spec: 'chara_card_v2', spec_version: '2.0', data }
    }
    function fromV2Card(card) {
      const data = card && typeof card === 'object' && card.data && typeof card.data === 'object'
        ? card.data
        : card && typeof card === 'object' && typeof card.name === 'string'
          ? card
          : {}
      const name = typeof data.name === 'string' ? data.name.trim() : ''
      if (!name) throw new Error('导入的角色卡缺少 name 字段')
      const ext = data.extensions && typeof data.extensions === 'object' && data.extensions.dshCosplay ? data.extensions.dshCosplay : {}
      const role = { name, emoji: typeof ext.emoji === 'string' ? ext.emoji : '' }
      for (const field of CARD_TEXT_FIELDS) if (typeof data[field] === 'string') role[field] = data[field]
      if (Array.isArray(data.tags)) role.tags = data.tags.filter((t) => typeof t === 'string')
      for (const field of PLUGIN_FIELDS) if (typeof ext[field] === 'string') role[field] = ext[field]
      if (typeof ext.id === 'string' && ext.id) role.id = ext.id
      return role
    }

    // ── 角色库纯函数（与主机侧 store.js 保持一致） ────────────────────────────
    function slugify(name) {
      return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    }
    function nextId(roles, name) {
      const base = slugify(name)
      if (base && !roles.some((r) => r.id === base)) return base
      const stamp = Date.now().toString(36)
      const rand = Math.floor(Math.random() * 1296).toString(36)
      return `${base || 'role'}-${stamp}${rand}`
    }

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
      textarea: { background: 'transparent', border: '1px solid var(--dsw-alias-border-strong, rgba(128,128,128,.3))', borderRadius: '8px', padding: '5px 8px', color: 'inherit', fontSize: '13px', fontFamily: 'inherit', width: '100%', minHeight: '56px', resize: 'vertical', overflowY: 'auto', lineHeight: '1.5', boxSizing: 'border-box' },
      badge: { fontSize: '12px', padding: '1px 8px', borderRadius: '99px', background: 'var(--dsw-specific-accent, #4d6bfe)', color: '#fff' },
      label: { fontSize: '12px', opacity: 0.6, minWidth: '64px' },
    }

    const inject = ['slots', 'configForms']

    function apply(ctx) {
      const form = ctx.configForms.get(NAMESPACE)
      // 主机服务该命名空间期间才挂上「角色扮演」设置页；未组合时页面不出现。
      ctx.effect(() => ctx.configForms.whileServed([NAMESPACE], () => ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: 'cosplay', order: 100, label: '角色扮演' },
        () => React.createElement(CosplaySection, { form }),
      ))), 'dsh-cosplay: cosplay settings page')
    }

    function CosplaySection({ form }) {
      // form 的 subscribe/getSnapshot 是原型方法，包一层稳定闭包再交给 hook。
      const subscribe = useCallback((listener) => form.subscribe(listener), [form])
      const getSnapshot = useCallback(() => form.getSnapshot(), [form])
      const snapshot = useSyncExternalStore(subscribe, getSnapshot)
      const value = snapshot.value

      const [editingId, setEditingId] = useState(null) // null = 新建
      const [formState, setFormState] = useState(EMPTY_FORM)

      const setField = useCallback((key, v) => setFormState((f) => ({ ...f, [key]: v })), [])

      const beginEdit = useCallback((role) => {
        setEditingId(role ? role.id : null)
        setFormState(
          role
            ? { name: role.name, emoji: role.emoji ?? '', system_prompt: role.system_prompt ?? '', description: role.description ?? '', personality: role.personality ?? '', style: role.style ?? '', rules: role.rules ?? '', behavior: role.behavior ?? '', scenario: role.scenario ?? '', first_mes: role.first_mes ?? '', mes_example: role.mes_example ?? '', creator_notes: role.creator_notes ?? '' }
            : EMPTY_FORM,
        )
      }, [])

      const reportError = useCallback((error) => {
        if (typeof window !== 'undefined') window.alert(error.message)
      }, [])

      /** 原子提交若干字段写入；Host 拒绝（修订冲突/不可写）时报错。 */
      const commit = useCallback(async (ops) => {
        const accepted = await form.mutate(ops)
        if (!accepted) throw new Error('写入被主机拒绝（配置不可写或已被并发修改），请重试。')
      }, [form])

      const roles = value?.roles ?? []
      const activeRole = value?.activeRole ? value.activeRole : null

      const save = useCallback(async () => {
        const name = formState.name.trim()
        if (!name) return
        try {
          const card = { ...formState, name }
          const id = editingId ?? nextId(roles, name)
          const next = { ...card, id }
          const nextRoles = editingId
            ? roles.map((r) => (r.id === editingId ? next : r))
            : [...roles, next]
          const ops = [{ op: 'set', path: ['roles'], value: nextRoles }]
          if (editingId === null && !activeRole) ops.push({ op: 'set', path: ['activeRole'], value: id })
          await commit(ops)
          setEditingId(null)
          setFormState(EMPTY_FORM)
        } catch (error) {
          reportError(error)
        }
      }, [formState, editingId, roles, activeRole, commit, reportError])

      const exportRole = useCallback(async (role) => {
        const json = JSON.stringify(toV2Card(role), null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${role.name || role.id || 'character'}.json`
        a.click()
        URL.revokeObjectURL(url)
      }, [])

      const importFileRef = React.useRef(null)
      const importRole = useCallback(async (file) => {
        try {
          const text = await file.text()
          const card = fromV2Card(JSON.parse(text))
          // id 冲突确认：相同 id 默认覆盖；取消则去掉 id 新建（不覆盖）
          if (card.id && roles.some((r) => r.id === card.id)) {
            if (typeof window !== 'undefined' && !window.confirm(`角色「${card.name}」(id=${card.id}) 已存在。\n确定 = 覆盖现有角色\n取消 = 作为新角色导入`)) {
              delete card.id
            }
          }
          const id = card.id ?? nextId(roles, card.name)
          const next = { ...card, id }
          const nextRoles = roles.some((r) => r.id === id)
            ? roles.map((r) => (r.id === id ? next : r))
            : [...roles, next]
          const ops = [{ op: 'set', path: ['roles'], value: nextRoles }]
          if (!activeRole) ops.push({ op: 'set', path: ['activeRole'], value: id })
          await commit(ops)
          if (importFileRef.current) importFileRef.current.value = ''
        } catch (error) {
          reportError(error)
        }
      }, [roles, activeRole, commit, reportError])

      const remove = useCallback(async (id) => {
        if (typeof window !== 'undefined' && !window.confirm(`确定删除角色 ${id} 吗？`)) return
        try {
          const ops = [{ op: 'set', path: ['roles'], value: roles.filter((r) => r.id !== id) }]
          // 与主机侧 removeRole 一致：删除激活角色时退出扮演
          if (activeRole === id) ops.push({ op: 'set', path: ['activeRole'], value: '' })
          await commit(ops)
        } catch (error) {
          reportError(error)
        }
      }, [roles, activeRole, commit, reportError])

      const setActive = useCallback(async (id) => {
        try {
          await commit([{ op: 'set', path: ['activeRole'], value: id }])
        } catch (error) {
          reportError(error)
        }
      }, [commit, reportError])

      const toggle = useCallback(async () => {
        try {
          await commit([{ op: 'set', path: ['enabled'], value: !(value?.enabled === true) }])
        } catch (error) {
          reportError(error)
        }
      }, [commit, value, reportError])

      const setThinkingStyle = useCallback(async (style) => {
        try {
          await commit([{ op: 'set', path: ['thinkingStyle'], value: style }])
        } catch (error) {
          reportError(error)
        }
      }, [commit, reportError])

      if (snapshot.status === 'loading') {
        return React.createElement('div', { style: styles.hint }, '角色扮演设置加载中…')
      }
      if (snapshot.status === 'unavailable') {
        return React.createElement(
          'div',
          { style: styles.hint },
          '角色库不可用：主机未提供 cosplay-core 配置命名空间（dsh-cosplay 组合行未启用或未加载）。',
        )
      }

      const enabled = value?.enabled === true
      const thinkingStyle = value?.thinkingStyle ?? 'neutral'
      const writable = snapshot.writable !== false

      return React.createElement(
        'div',
        { style: styles.page },
        writable
          ? null
          : React.createElement('div', { style: styles.hint }, '当前连接不可写：改动不会持久化到主机配置。'),
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
                  onClick: toggle,
                },
                React.createElement('span', { style: { ...styles.switchKnob, left: enabled ? '19px' : '3px' } }),
              ),
              React.createElement('span', null, enabled ? 'Cosplay 模式：开启' : 'Cosplay 模式：关闭'),
            ),
            React.createElement(
              'span',
              { style: styles.hint },
              '开启后，所有会话（含子代理）将以当前激活角色的设定与语气对话；关闭后下一轮对话即回退默认人格。',
            ),
          ),
          React.createElement(
            'div',
            { style: styles.hint },
            enabled
              ? activeRole
                ? `当前扮演：${roles.find((r) => r.id === activeRole)?.name ?? activeRole}`
                : '已开启但未选择角色 —— 请在下方的角色列表中「设为当前」。'
              : '已关闭：开启后生效。',
          ),
          // ── 思考风格（全局） ──
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '思考风格'),
            React.createElement(
              'button',
              { style: { ...styles.button, ...(thinkingStyle !== 'role' ? { borderColor: 'var(--dsw-specific-accent, #4d6bfe)' } : {}) }, onClick: () => setThinkingStyle('neutral') },
              '中立思考',
            ),
            React.createElement(
              'button',
              { style: { ...styles.button, ...(thinkingStyle === 'role' ? { borderColor: 'var(--dsw-specific-accent, #4d6bfe)' } : {}) }, onClick: () => setThinkingStyle('role') },
              '角色化思考',
            ),
          ),
          React.createElement(
            'div',
            { style: styles.hint },
            thinkingStyle !== 'role'
              ? '中立思考：模型思考过程保持专业分析，仅最终回复扮演角色（推荐）。'
              : '角色化思考：模型的思考过程也保持角色人设与口吻，沉浸感更强（不稳定触发，可能影响Agent任务能力，谨慎开启）。',
          ),
        ),
        // ── 角色列表 ──
        React.createElement(
          'div',
          { style: styles.card },
          React.createElement('div', { style: styles.row },
            React.createElement('div', { style: styles.title }, '角色库'),
            React.createElement('button', { style: styles.buttonPrimary, onClick: () => beginEdit(null) }, '＋ 新建角色'),
            React.createElement('button', { style: styles.button, onClick: () => importFileRef.current?.click() }, '导入角色卡'),
            React.createElement('input', { ref: importFileRef, type: 'file', accept: '.json,application/json', style: { display: 'none' }, onChange: (e) => { if (e.target.files?.[0]) importRole(e.target.files[0]) } }),
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
                    React.createElement('button', { style: styles.button, onClick: () => setActive(role.id) }, '设为当前'),
                    React.createElement('button', { style: styles.button, onClick: () => beginEdit(role) }, '编辑'),
                    React.createElement('button', { style: styles.button, onClick: () => exportRole(role) }, '导出'),
                    React.createElement('button', { style: styles.button, onClick: () => remove(role.id) }, '删除'),
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
            React.createElement('input', { style: styles.input, value: formState.name, onChange: (e) => setField('name', e.target.value), placeholder: '角色名' }),
            React.createElement('span', { style: styles.label }, '头像'),
            React.createElement('input', { style: { ...styles.input, maxWidth: '80px' }, value: formState.emoji, onChange: (e) => setField('emoji', e.target.value), placeholder: '📚' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '系统提示词'),
            React.createElement('textarea', { style: { ...styles.textarea, minHeight: '96px' }, value: formState.system_prompt, onChange: (e) => setField('system_prompt', e.target.value), placeholder: '可选：给角色附加总体扮演指令。' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '身份'),
            React.createElement('textarea', { style: styles.textarea, value: formState.description, onChange: (e) => setField('description', e.target.value), placeholder: '身份与背景设定（我是谁）' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '性格'),
            React.createElement('textarea', { style: styles.textarea, value: formState.personality, onChange: (e) => setField('personality', e.target.value), placeholder: '性格核心与层次' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '语气'),
            React.createElement('textarea', { style: { ...styles.textarea, minHeight: '64px' }, value: formState.style, onChange: (e) => setField('style', e.target.value), placeholder: '说话风格（怎么说话）' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '守则'),
            React.createElement('textarea', { style: { ...styles.textarea, minHeight: '64px' }, value: formState.rules, onChange: (e) => setField('rules', e.target.value), placeholder: '行为守则（该做什么 / 不做什么）' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '行为'),
            React.createElement('textarea', { style: styles.textarea, value: formState.behavior, onChange: (e) => setField('behavior', e.target.value), placeholder: '行为模式 / 私密互动' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '场景'),
            React.createElement('textarea', { style: styles.textarea, value: formState.scenario, onChange: (e) => setField('scenario', e.target.value), placeholder: '场景 / 世界观 / 关系设定' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '示例对话'),
            React.createElement('textarea', { style: styles.textarea, value: formState.mes_example, onChange: (e) => setField('mes_example', e.target.value), placeholder: '可选：few-shot 示例' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '开场白'),
            React.createElement('textarea', { style: { ...styles.textarea, minHeight: '64px' }, value: formState.first_mes, onChange: (e) => setField('first_mes', e.target.value), placeholder: '可选' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('span', { style: styles.label }, '备注'),
            React.createElement('textarea', { style: { ...styles.textarea, minHeight: '64px' }, value: formState.creator_notes, onChange: (e) => setField('creator_notes', e.target.value), placeholder: '创建者笔记（不注入人格）' }),
          ),
          React.createElement(
            'div',
            { style: styles.row },
            React.createElement('button', { style: styles.buttonPrimary, onClick: save }, '保存'),
            editingId ? React.createElement('button', { style: styles.button, onClick: () => { setEditingId(null); setFormState(EMPTY_FORM) } }, '取消') : null,
          ),
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
