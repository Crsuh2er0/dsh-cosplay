# src/ — 源码布局（纯 JS ESM，无构建步骤）

插件源码即运行时格式：主机面为普通 ESM 模块（Node），浏览器面为
`__ModuleLoader__` CJS-factory 格式（与内置客户端包一致）。

```text
src/
├── store.js    # 角色库纯函数：状态规整 / CRUD / 种子 / persona 渲染（零依赖）
├── index.js    # 主机核心行（cosplay-core）：settings 命名空间 + cosplay 服务
│               #   + Cosplay 预设幂等安装（$DSH_HOME/.agent-presets/cosplay）
├── preset.js   # Cosplay 预设行（dsh-cosplay/preset）：{{cosplay_active}} 变量
│               #   + cosplay_show/list/switch/upsert/remove 工具（模式门控）
└── client.js   # 浏览器半区（dsh-cosplay/client）：settings.section「角色扮演」页
```

平台拆分依据（见 docs/dsh-plugin-spec.md）：

- 持久化、服务、预设安装 → Host；
- 设置页 Slot UI → Client（`__ModuleLoader__` 格式，经 `dsh.client` 声明装载）；
- 客户端读写角色库走 settings scope（dsh-client-ui-settings 的 attachSettings 机制，
  Round 3 实现时按该包源码精确对接）。
