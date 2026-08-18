/**
 * dsh-cosplay — 浏览器侧（dsh.client 声明，包入口 dsh-cosplay/client）。
 *
 * 以 __ModuleLoader__ 的 CJS-factory 格式编写（与内置客户端包一致），
 * 由 dsh-client-modules 扫描 package.json 的 dsh.client 声明自动装载。
 *
 * 本轮：注册设置页左侧边栏新页「角色扮演」（settings.section 列表条目，
 * 与 General / Models / Plugins 同级）。页面主体为占位视图；
 * 完整的角色 CRUD 管理界面在后续轮次实现（经 settings scope 读写角色库）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-cosplay',
  factory: (require) => {
    const React = require('react')

    const sectionStyle = {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      padding: '4px 0',
    }
    const cardStyle = {
      border: '1px solid var(--dsw-alias-border-strong, rgba(128,128,128,.3))',
      borderRadius: '12px',
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }
    const titleStyle = { fontSize: '15px', fontWeight: 600 }
    const hintStyle = { fontSize: '13px', opacity: 0.72, lineHeight: '1.6' }

    return {
      name: 'cosplay-client',
      apply(ctx) {
        const slots = ctx.get('slots')
        if (slots === undefined) return
        slots.inject('settings.section', () =>
          slots.register(
            { name: 'settings.section', id: 'cosplay', order: 100, label: '角色扮演' },
            () =>
              React.createElement(
                'div',
                { style: sectionStyle },
                React.createElement(
                  'div',
                  { style: cardStyle },
                  React.createElement('div', { style: titleStyle }, '🎭 角色扮演（dsh-cosplay）'),
                  React.createElement(
                    'div',
                    { style: hintStyle },
                    '开启方式：新建会话时选择预设「Cosplay 模式」（或将其设为默认）。',
                  ),
                  React.createElement(
                    'div',
                    { style: hintStyle },
                    '角色管理界面将在后续版本提供：届时可在这里创建、编辑、删除与切换任意角色，角色卡将实时注入扮演会话的人格。',
                  ),
                ),
              ),
          ),
        )
      },
    }
  },
})
