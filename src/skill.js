/**
 * 内置 skill：自然语言创建角色卡（cosplay-card-authoring）。
 * 由主机行经 ctx.skills.register 全局注册；模型在用户要求"生成角色卡"时加载，
 * 按此规范：搜索设定 → 汇总 v2 卡 → cosplay_upsert 写入。
 */

export const CARD_AUTHORING_SKILL_NAME = 'cosplay-card-authoring'

export const CARD_AUTHORING_SKILL_DESCRIPTION =
  '创建 / 生成 dsh-cosplay 角色卡：按用户指定的角色（可自动搜索公开设定）生成酒馆 v2 兼容角色卡并写入角色库。'

export const CARD_AUTHORING_SKILL_WHEN_TO_USE =
  '用户要求创建、生成或设计一个角色卡 / 角色设定 / 角色 persona 时使用；支持按"某存在的角色"自动搜索设定填充，也支持从零设计。'

export const CARD_AUTHORING_SKILL_CONTENT = `# 角色卡创作规范（dsh-cosplay）

当用户要求"创建 / 生成 / 做一个角色卡 / 角色设定"，并指定了角色（存在或不存在的）时，按本规范执行。

## 角色卡字段（SillyTavern v2 对齐；全部自由文本，除 name 外均可省略）
- name：显示名（必填）
- emoji：头像字符（可选）
- system_prompt：原样注入 persona 顶部的指令块（可选；如 [PERSONA_LOAD] 风格，放紧凑指令）
- description：身份与背景（自称 / 种族 / 阵营 / 身份）
- personality：性格核心与层次
- style：语气与说话风格
- rules：行为守则（该做什么 / 不做什么）
- behavior：行为模式 / 私密互动
- scenario：场景 / 世界观 / 关系设定
- first_mes：开场白（一句话）
- mes_example：示例对话（2–3 轮，展示口吻）
- creator_notes：备注（注明设定来源；不注入人格）

## 流程
1. **明确目标**：用户已指名角色（如"角色为：XXX"）→ 进入第 2 步；用户只给了方向（如"傲娇的书店老板"）→ 先用 ask_user_question 问 1–3 个关键澄清问题（名称偏好 / 风格 / 语言），不要多问。
2. **搜索设定**（针对存在的角色）：用 web_search 搜索该角色的公开设定资料。关键词建议："角色名 + 作品"、"角色名 + 设定 / 性格"、"角色名 + 台词"。收集：身份、性格、说话风格、关键关系、典型台词。
3. **汇总成卡**：按字段填充。忠实于公开设定；**不要逐字复制大段原文**（做摘要与提炼）；无法查证的字段留空，不要编造。
4. **护栏**：
   - 真实在世人物（真人）默认**不生成**——先向用户确认用途与授权；
   - 用户明确说"别管设定，自由发挥"时，以用户意愿为准，但仍需 name + 至少 description。
5. **写入**：调用 cosplay_upsert 工具，参数名与上述字段一一对应（name 必填，其余可选；空字段不要传）。工具返回保存后的角色 id。
6. **汇报**：一句话总结生成结果（名称 / id / 字段要点），提示用户可在设置页「角色扮演」继续编辑或「设为当前」；如用户想立即扮演，可用 cosplay_switch 切换。

## 注意
- 用户后续说"再改一下 / 加点…"：用 cosplay_upsert 传同一 id 更新，不要新建。
- 不确定的设定宁可留空或写进 creator_notes，不要编造细节。
- **严禁直接编辑任何配置文件**（包括 $DSH_HOME/settings.yaml、profile 目录等）——角色库只能通过 cosplay_upsert / cosplay_remove 工具读写；也不要复制或重写角色库的完整段落。
- cosplay_upsert 返回的文本即写入结果（含角色 id）；若工具报错，**把错误原样报告给用户**，不要自行手改配置文件"补救"。
`
