/**
 * dsh-cosplay — 浏览器侧（dsh.client 声明，包入口 dsh-cosplay/client）。
 *
 * 设置页新增「角色扮演」页（settings.section 列表条目），承载：
 *   - 全局开关（enabled）；
 *   - 角色库管理：列表 / 激活 / 新建 / 编辑 / 删除；
 *   - 角色卡字段：name / emoji / description / style / rules / greeting / sample。
 *
 * 数据通道：插件自有的 typert Remote 命名空间 `cosplay`（dsh-at-file 同款模式）
 * —— settings 命名空间对 Web 配置客户端有硬编码暴露白名单（dsh-host-apiproxy），
 * 第三方命名空间默认不可远程读写，因此设置页不走 settingsScope，而是
 * `ctx.remote.$mount({ package, descriptors })` + `ctx.reflect.get('remote.cosplay')`
 * 调用主机侧 @Remote 方法。codec 用 { mode: 'src-json' }，无需 zod。
 *
 * 格式为 __ModuleLoader__ 的 CJS-factory 形式（与内置客户端包一致）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-cosplay',
  factory: (require) => {
    const React = require('react')
    const { useSyncExternalStore, useState, useCallback } = React

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

    // ── typert Remote 描述符（与主机侧 COSPLAY_INVOCATIONS 一致） ────────────
    // 客户端挂载要求 strict codec（dsh-api-gateway 的 requireStrictCodec 拒绝
    // src-json）；schema 用极简透传（{ parse: v => v }），免 zod。
    const passthroughSchema = { parse: (value) => value }
    const strictCodec = (typeSymbol) => ({ mode: 'strict', typeSymbol, schema: passthroughSchema })
    const COSPLAY_INVOCATIONS = [
      { id: 'dsh-cosplay#cosplay/getState', service: 'cosplay', namespace: 'cosplay', method: 'getState', invocation: { kind: 'direct' }, parameters: [], result: strictCodec('dsh-cosplay#CosplayState') },
      { id: 'dsh-cosplay#cosplay/upsertRole', service: 'cosplay', namespace: 'cosplay', method: 'upsertRole', invocation: { kind: 'direct' }, parameters: [{ name: 'card', wire: 'card', source: 'json', codec: strictCodec('dsh-cosplay#RoleCard') }], result: strictCodec('dsh-cosplay#CosplayState') },
      { id: 'dsh-cosplay#cosplay/removeRole', service: 'cosplay', namespace: 'cosplay', method: 'removeRole', invocation: { kind: 'direct' }, parameters: [{ name: 'id', wire: 'id', source: 'json', codec: strictCodec('dsh-cosplay#RoleId') }], result: strictCodec('dsh-cosplay#CosplayState') },
      { id: 'dsh-cosplay#cosplay/setActiveRole', service: 'cosplay', namespace: 'cosplay', method: 'setActiveRole', invocation: { kind: 'direct' }, parameters: [{ name: 'id', wire: 'id', source: 'json', codec: strictCodec('dsh-cosplay#RoleId') }], result: strictCodec('dsh-cosplay#CosplayState') },
      { id: 'dsh-cosplay#cosplay/setEnabled', service: 'cosplay', namespace: 'cosplay', method: 'setEnabled', invocation: { kind: 'direct' }, parameters: [{ name: 'enabled', wire: 'enabled', source: 'json', codec: strictCodec('dsh-cosplay#Enabled') }], result: strictCodec('dsh-cosplay#CosplayState') },
      { id: 'dsh-cosplay#cosplay/setThinkingStyle', service: 'cosplay', namespace: 'cosplay', method: 'setThinkingStyle', invocation: { kind: 'direct' }, parameters: [{ name: 'style', wire: 'style', source: 'json', codec: strictCodec('dsh-cosplay#ThinkingStyle') }], result: strictCodec('dsh-cosplay#CosplayState') },
    ]
    const COSPLAY_REMOTE = { package: 'dsh-cosplay', descriptors: COSPLAY_INVOCATIONS }

    /** 挂载后返回 Remote 命名空间；未就绪返回 undefined。 */
    function createCosplayStore(getRemote) {
      let snapshot = { status: 'loading', value: undefined }
      const listeners = new Set()
      const emit = () => {
        for (const listener of [...listeners]) listener()
      }
      const settle = (next) => {
        snapshot = next
        emit()
      }
      const call = async (fn) => {
        const remote = getRemote()
        if (remote === undefined) {
          settle({ status: 'unavailable', value: undefined, error: 'cosplay Remote 未挂载' })
          return undefined
        }
        try {
          return await fn(remote)
        } catch (error) {
          settle({ status: 'unavailable', value: undefined, error: String(error && error.message ? error.message : error) })
          return undefined
        }
      }
      return {
        subscribe: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        getSnapshot: () => snapshot,
        async load() {
          const res = await call((r) => r.getState())
          if (res === undefined) return
          if (res.ok) settle({ status: 'ready', value: res.value })
          else settle({ status: 'unavailable', value: undefined, error: res.error?.message ?? '读取失败' })
        },
        /** 执行一次写操作；成功后用返回值刷新快照。 */
        async mutate(fn) {
          const res = await call(fn)
          if (res === undefined) return undefined
          if (res.ok) {
            settle({ status: 'ready', value: res.value })
            return res.value
          }
          throw new Error(res.error?.message ?? '写入失败')
        },
      }
    }

    return {
      name: 'cosplay-client',
      inject: ['remote', 'slots', 'connection'],
      apply(ctx) {
        let cosplayRemote = undefined
        const store = createCosplayStore(() => cosplayRemote)
        const slots = ctx.get('slots')
        if (slots === undefined) return
        ctx.effect(async () => {
          const dispose = await ctx.remote.$mount(COSPLAY_REMOTE)
          cosplayRemote = ctx.reflect.get('remote.cosplay')
          if (cosplayRemote === undefined) {
            throw new Error('dsh-cosplay: the cosplay Remote namespace did not mount')
          }
          void store.load()
          return dispose
        }, 'dsh-cosplay: remote mount')
        slots.inject('settings.section', () =>
          slots.register(
            { name: 'settings.section', id: 'cosplay', order: 100, label: '角色扮演' },
            () => React.createElement(CosplaySection, { store }),
          ),
        )
      },
    }

    function CosplaySection({ store }) {
      // store 的 subscribe/getSnapshot 是闭包函数（非 this 方法），可安全裸引用
      const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
      const value = snapshot.value

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

      const reportError = useCallback((error) => {
        if (typeof window !== 'undefined') window.alert(error.message)
      }, [])

      const save = useCallback(async () => {
        if (!form.name.trim()) return
        try {
          const card = { ...form, name: form.name.trim() }
          if (editingId) card.id = editingId
          await store.mutate((r) => r.upsertRole(card))
          if (!editingId && !value?.activeRole) await store.mutate((r) => r.setActiveRole(card.id ?? null))
          setEditingId(null)
          setForm(EMPTY_FORM)
        } catch (error) {
          reportError(error)
        }
      }, [form, editingId, value, store, reportError])

      const remove = useCallback(async (id) => {
        if (typeof window !== 'undefined' && !window.confirm(`确定删除角色 ${id} 吗？`)) return
        try {
          await store.mutate((r) => r.removeRole(id))
        } catch (error) {
          reportError(error)
        }
      }, [store, reportError])

      const setActive = useCallback(async (id) => {
        try {
          await store.mutate((r) => r.setActiveRole(id))
        } catch (error) {
          reportError(error)
        }
      }, [store, reportError])

      const toggle = useCallback(async () => {
        try {
          await store.mutate((r) => r.setEnabled(!(value?.enabled === true)))
        } catch (error) {
          reportError(error)
        }
      }, [store, value, reportError])

      const setThinkingStyle = useCallback(async (style) => {
        try {
          await store.mutate((r) => r.setThinkingStyle(style))
        } catch (error) {
          reportError(error)
        }
      }, [store, reportError])

      if (snapshot.status === 'loading') {
        return React.createElement('div', { style: styles.hint }, '角色扮演设置加载中…')
      }
      if (snapshot.status === 'unavailable') {
        return React.createElement(
          'div',
          { style: styles.hint },
          `角色库不可用：cosplay Remote 通道未就绪。${snapshot.error ? `（${snapshot.error}）` : ''}`,
        )
      }

      const enabled = value?.enabled === true
      const thinkingStyle = value?.thinkingStyle ?? 'neutral'
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
              : '默认关闭：开启后才生效（opt-in）。',
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
              ? '中立思考：模型思考过程保持专业分析，仅最终回复扮演角色（推荐，保障 Agent 工作能力）。'
              : '角色化思考：模型的思考过程也保持角色人设与口吻（全沉浸；笨角色可能影响任务能力）。',
          ),
        ),
        // ── 角色列表 ──
        React.createElement(
          'div',
          { style: styles.card },
          React.createElement('div', { style: styles.row },
            React.createElement('div', { style: styles.title }, '角色库'),
            React.createElement('button', { style: styles.buttonPrimary, onClick: () => beginEdit(null) }, '＋ 新建角色'),
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
            React.createElement('button', { style: styles.buttonPrimary, onClick: save }, '保存'),
            editingId ? React.createElement('button', { style: styles.button, onClick: () => { setEditingId(null); setForm(EMPTY_FORM) } }, '取消') : null,
          ),
        ),
      )
    }
  },
})
