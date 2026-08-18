# src/ — 源码布局（纯 JS ESM，无构建步骤）

插件源码即运行时格式：主机面为普通 ESM 模块（Node），浏览器面为
`__ModuleLoader__` CJS-factory 格式（与内置客户端包一致）。

```text
src/
├── store.js    # 角色库纯函数：状态规整（enabled/activeRole/roles）/ CRUD /
│               #   种子 / persona 渲染（零依赖，可独立测试）
├── index.js    # 主机核心行（cosplay-core，组合唯一入口）：
│               #   settings 命名空间 + cosplay 服务 + 全局人格段（cosplay-persona）
│               #   + {{cosplay_active}} 变量 + 全局 cosplay_* 工具（switch 软禁用）
└── client.js   # 浏览器半区（dsh-cosplay/client）：设置页「角色扮演」
                #   （开关 + 角色 CRUD，经 settingsScope 读写）
```

平台拆分依据（见 docs/dsh-plugin-spec.md）：

- 持久化、服务、人格注入、工具 → Host（全局开关形态，无 preset 参与）；
- 设置页 Slot UI → Client（`__ModuleLoader__` 格式，经 `dsh.client` 声明装载）；
- 客户端读写角色库走 `ctx.settingsScope.bind({ namespace: 'cosplay' })`
  （dsh-client-ui-settings 提供的 Host 传输），组件用
  `useSyncExternalStore(scope.subscribe, scope.getSnapshot)` 订阅快照，
  `scope.set(field, value)` 写入。
