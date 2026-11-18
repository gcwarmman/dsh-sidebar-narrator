# dsh-sidebar-narrator · 侧写

> 包名 `dsh-sidekick-lens`（插件 id、`set_plugin` 的目标都用它），GitHub 仓库叫 `dsh-sidebar-narrator`。

右侧栏里的三行话：**它干完什么、在干什么、下一步干什么**。

DSH 工作的时候，主对话在滚，工具日志在刷，你根本看不出来它到底在干哪一步。这个插件不给你第二块聊天屏，只给你三行字、一盏灯、一个位置感，点开才看细节。

![侧写面板](docs/panel.png)

---

## 它是什么

原生右侧栏 tab（`ctx.sidebarRightTabs` + `sidebar.right.pane.tab` 座位），和文件预览、终端并排、可拖拽合并，宽度不够时只收缩自己的文案，不横向溢出。

默认只有：

```
● 在读或搜                      第 3 / 7 步        ← 一盏灯 + 状态词 + 位置感
╱╲╱╲╱‾╲╱╲                        ← 一条波形：它在动，波形就跳；它静着，波形就平
【已完成】看完了「登录页」的代码        已观察到
【正在做】在改「登录逻辑」，把输错密码的分支理顺   已观察到
【下一步】手上这步收尾后，接着做「跑测试」      已观察到
───────────────────────
想办法                清单 2 / 5
到目前为止：动了 4 个文件（说明文档、客户端），清单 2 / 5，还剩 3 件，下一件是「跑测试」。
```

最后那块是**提炼总账**，回答的是另一个问题：三行说「最近一步做了什么」，账本说「你让我办的那件事推到哪了、产出什么、还差什么」。

它的信息结构是刻意定死的，**先说结果，再说缺口**：

1. **做成了什么** —— 数字给范围，名字给落点：`动了 4 个文件（说明文档、客户端）`。
2. **还差什么** —— 清单上没打勾的那几件，并且点出下一件是哪个：`还剩 3 件，下一件是「跑测试」`。

它**刻意不先说**「看过 29 处代码、跑过 25 次命令」。这类计数只证明它在忙，回答的是「它移动了多少」，而不是「我离想要的东西近了多少」。这些数字仍然留在展开详情里，谁想看都能看到，但一句话的摘要只留给结果和剩余工作。

> 这条规则的依据是 [Progress Ledger](https://agentic-ux.com/patterns/progress-ledger) 的「IDE agent 的总账该读起来像 changelog，不是 debug log」与 [Return Moment](https://agentic-ux.com/patterns/return-moment) 的「先讲结果和范围，不要回放每一次工具调用」。早期版本正是这两个反面的例子：70 步之后只说「改了 3 个文件、看过 29 处代码、跑过 25 次命令」，用户看完仍然不知道这事办到哪了。

有总结句时就不再单列计数，同一件事不说两遍。「下一步」优先取清单上的下一件；没有清单时，会优先引用 agent 自己刚说的那句打算（标为**仅据汇报**），而不是套模板句。

每条都能点开，看四件事：**为什么做 / 看到了什么 / 结果是什么 / 可以怎么调整**。

每条还标着来源：

| 标记 | 含义 |
| --- | --- |
| **已观察到** | 真读到了工具调用和工具结果，这话是事实 |
| **仅据汇报** | 只有主 agent 自己这么说，没人核对过 |

三行和账本不是两套逻辑：`buildStory()` 先把事件折叠成一份「这件事到哪了」的记录（做成了什么、还差什么、手上正干着什么、下一步该是什么），三行是它的前三句，账本就是它的一句话摘要。所以它们永远说同一件事，不会一个说「等结果」、另一个说「下一件是补边界测试」。

---

## 三条介入通道（视觉上是三个不同的东西，不是一个输入框）

### 1. 问解释助手 —— 只读，不碰主 agent

单独调一次模型，只喂给它步骤摘要（已经剥掉工具名和路径）。

- **不发消息**给主 agent
- **不进**主对话上下文
- **不改变**执行路径

适合问：「这一步为什么这么做？」「它是不是卡住了？」「还有哪几件事没做？」

实现上：宿主自己 `llm.stream(...)`，**不带 sessionId、不带 tools、不带 toolHistory**，和主 agent 循环彻底隔离。

提示词在 `lib/narrative.js` 的 `explainPrompt(digest)` 里，是个纯函数（便于测试）。全文：

```text
你是一个坐在用户旁边的“侧边旁白”。你的唯一工作，是用大白话给用户解说主 Agent 此时此刻在干嘛。用户可能完全不懂代码，你要让他觉得安心、听得懂。

请严格遵循以下要求：
1. 只说 1 到 2 句话，口语化，像朋友在旁边提示。绝对不要用任何 Markdown 格式、列表、或者标题。
2. 把机器动作翻译成“生活化动作 + 业务对象 + 目的”。
   - 错误示范：“正在调用 read_file 查看 src/auth/login.tsx，并读取第 40 行参数。”（太机器）
   - 错误示范：“它在翻文件，然后在改配置。”（太模糊）
   - 正确示范：“在看登录页的代码，确认输错密码时往哪跳。看完应该就会去改配置了。”
3. 屏蔽底层技术细节（如代码函数名、命令行参数、绝对路径），但允许保留业务相关的名字（如“登录页”、“测试”、“配置文件”）。
4. 只依据下方【当前进展】里的事实来说。如果信息太少看不出来，就说“这会儿它还在默默干活，暂时看不出具体在忙啥”，绝对不要瞎猜编造。
5. 不要用“根据记录”、“综上”、“目前正在执行”这种公文腔，也不要说“我会帮你转告”，你只是个旁白。

【当前进展】（这是你唯一能看到的信息）：
<digest>
{digest}
</digest>
```

`{digest}` 是运行时拼的观察记录，分两段，因为面板对用户的承诺是「每条结论都标来源」，
摘要如果混成一段，模型就没法兑现这个承诺：

```text
【已观察到】（真的读到了工具调用和结果）
状态：正在跑（验证结果）
到目前为止：动了 4 个文件（说明文档、客户端），清单 2 / 5，还剩 3 件，下一件是「跑测试」。
还没做完：跑测试；补边界情况；更新说明
最近一次动作：刚刚
当前动作：在跑测试，确认改完没有碰坏别的。
它下一步大概会：把结果对一遍，再决定接着改哪里。（推测）
已完成步骤数：58
清单进度：3 / 5
- 看完了相关代码。
- 改完了「客户端」。
清单未完成：补 README；跑回归测试
动过的文件：说明文档、客户端、语言层、宿主半
你最近给的提醒：那个文件先别改

【仅据汇报】（只有它自己的说法，没有工具证据）
它自己最后说：三条路子都验过了。
它心里正在盘算：（它当下的思考原文，工具名与路径已换成中性说法）
```

注意「它下一步大概会」带 `（推测）`——那是推断，不是观察，不标出来模型就会当事实转述。

**什么时候展示**：全部由事件驱动，没有轮询。

| 事件 | 行为 |
| --- | --- |
| `turn/start`、`turn/end`、`tool/result` | 立即算一帧推给面板 |
| 其它 `session/event`、`agent/assistant-stream` | 350ms 节流后再算 |
| `agent/status`、`agent/error` | 立即推 |

推之前会比对 `signatureOf(view)`，一模一样就不推——面板不会因为 agent 在吐字而每 350ms 重画一次。

**什么时候总结**：`summary` 不是定期生成的，是每次算帧时从 `tally`（按动作类别的累计次数）、
`files`（动过的文件）、`failedCount`、`todos` 现算的，所以它永远和当前状态一致，不会落后一段。

### 2. 告诉 Agent —— 软介入，不打断当前步骤

标签写得很直白：**告诉 Agent（不打断当前步骤）**。

走 `agent.steer(message)`：消息进 `next-step` 信箱槽，当前正在跑的工具调用照常跑完，**下一个 step 边界**才被读取。

已经完成的工作全部保留。

### 3. 先停一下 —— 硬打断，但把代价讲清楚

两步确认，确认框上写着：

> 打断后已完成的内容会保留，它会说明中止了什么。

走 `agent.cancel({ kind: 'user' }, { keepInbox: true })`：立刻中止当前 turn，但队列里的东西不丢。

停完面板会回一句话：**保留了什么、中止了什么、建议下一步**。

---

## 安装

插件是标准的 DSH bundle。源码目录：`D:\work\tagclear\dsh-sidekick-lens`；
GitHub：<https://github.com/gcwarmman/dsh-sidebar-narrator>（包名仍是 `dsh-sidekick-lens`）。

**你现在这台上已经装好了**，不用再装。下面这段是给「换一台机器」或「别人想装」用的。

```bash
# 从 GitHub 装（推荐，别人用这条）
dsh plugin --profile web add github:gcwarmman/dsh-sidebar-narrator

# 或者用预构建包装（不需要构建授权，比从源码装更省事）
dsh plugin --profile web add https://github.com/gcwarmman/dsh-sidebar-narrator/releases/latest/download/dsh-sidekick-lens.tgz

# 或者从本地目录装
plugin_manager action=install_bundle target="D:\work\tagclear\dsh-sidekick-lens"
```

装完刷新页面（`http://127.0.0.1:3080`），右侧栏的引导页会出现「侧写」这一项；因为这是唯一条目，它会直接自动打开。

> 装完如果没出现，先看 `plugin_manager action=list_plugins` 的输出里有没有 `dsh-sidekick-lens`，再看 `warnings`。

### 别人怎么装

三种形态，按「对方有多怕麻烦」排序：

```bash
# A. 发到 npm 之后（最省事）
dsh plugin --profile web add dsh-sidekick-lens

# B. 用预构建的 .tgz（不需要发 npm 也能免构建授权）
dsh plugin --profile web add https://github.com/gcwarmman/dsh-sidebar-narrator/releases/latest/download/dsh-sidekick-lens.tgz

# C. 直接从 GitHub 装（会跑一次构建，市场里可能要你点「允许」）
dsh plugin --profile web add github:gcwarmman/dsh-sidebar-narrator

# D. 用本地目录 / 解包后的文件夹
plugin_manager action=install_bundle target="D:\path\to\dsh-sidekick-lens"
```

改完代码要让它重新加载：

```bash
plugin_manager action=set_plugin target=include:sidekick-lens enabled=false
plugin_manager action=set_plugin target=include:sidekick-lens enabled=true
```

> `dsh plugin ...` 只是把参数原样转给 profile 目录里的 pnpm，所以 `add` / `remove` / `why` 都能用。
> 装 B/C 形态时 `plugin_manager` 会跑一次 pnpm 链接，并打出一大片**既有的** peer-dependency 警告墙
> （`dsh-better-sidebar`、`dsh-mnemon`、`@nanmicoder/dsh-agent-teams` 等），那与本插件无关。

### 发布到 dsh-market（被搜到、被别人装）

先澄清一件事：**dsh-market 本身不收录插件**。它读的是精选目录
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，
「上架」= 去那个仓库提一个 PR，PR 只加一个 YAML 文件：

```yaml
# data/plugins/gcwarmman__dsh-sidebar-narrator.yml
url: https://github.com/gcwarmman/dsh-sidebar-narrator   # 必须与仓库地址完全一致
name: gcwarmman/dsh-sidebar-narrator
category: ui                                             # UI 增强写 ui；主题/皮肤才写 theme
description:
  en: A right-sidebar narrator for DeepSeek Harness that says what the agent finished, is doing, and will do next, plus a read-only explain channel, a non-interrupting steer, and a stop that reports what it kept.
  zh: 右侧栏三行话：它干完什么、在干什么、下一步干什么；还能只读提问、不打断地提醒、以及把代价讲清楚再喊停。
```

README 是脚本生成的，**不要手改它**。除 YAML 之外还要满足：

| 要求 | 本仓库状态 |
| --- | --- |
| `package.json` 里有 `dsh.bundle` | ✅ |
| 仓库里有真能跑的代码，不是占位 | ✅ `lib/` 三个源文件、95 项测试 |
| 仓库创建满 1 天（CI 自动查） | ✅ 建于 2026-11-16 03:21 UTC，已满 24 小时 |
| 仓库加 `dsh-plugin` topic | ✅ 已加（另一并加了 `deepseek-harness`/`sidebar`/`observability`） |
| 描述属实（维护者会读源码核对每个数字与 API 名） | ✅ 本文档每条都给了证据 |
| 一个 PR 最多 3 条 | — |
| 依赖必须指向原作者 | ✅ 无第三方运行时依赖 |

`package.json` 已按上架要求改好：去掉 `private`、`author` 为 `gcwarmman`、
`repository`/`homepage`/`bugs` 指向本仓库、`engines.dsh`、以及带显式预发布分支的
`peerDependencies`（否则 node-semver 会静默排除预发布构建，导致用户 `ERESOLVE`）：

```json
"@deepseek-ai/dsh-client-ui-sidebar-right": ">=0.2.0-rc.2 || >=0.2.1-rc.2"
```

待提交的条目文件已经写好放在仓库里：`docs/catalog-entry.yml`，内容就是要提到
awesome-dsh-plugin 的那一个 YAML，和已提交的 PR 完全一致。

**PR 已经提了**：[awesome-dsh-plugin#16192](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/16192)，
只改一个文件，等维护者审。

剩余的两件事：

1. **可选但强烈建议：发 npm。** 现在预构建的 `.tgz` 已经挂在
   [Releases/v0.1.0](https://github.com/gcwarmman/dsh-sidebar-narrator/releases/tag/v0.1.0) 上，
   `latest/download/dsh-sidekick-lens.tgz` 可用（已验证 200 / 97798 字节），条目里也用
   `tarball:` 指了它 —— 所以**不发 npm 也能装、也不用给构建脚本授权**。
   发 npm 只是多一条更短的安装命令：`dsh plugin --profile web add dsh-sidekick-lens`
   （包名 `dsh-sidekick-lens` 目前未被占用）。
2. 等 PR 合并后，市场会自带更新，别人搜「侧写」就能装。

> 发版换 tarball 时：`latest/download/` 的资产名**不能带版本号**，否则下次发版 404。
> 本仓库的资产名固定为 `dsh-sidekick-lens.tgz`，`package.json` 的版本号可以照常升。

> YAML 描述里如果出现 `: `（冒号+空格），必须给整行加引号，否则解析失败。
> 图标只收 GitHub 托管的位图（png/jpg/webp，约 96px 显示），**SVG 和第三方图床会被拒**。
> 本仓库已经备好 `docs/icon.png`（256×256，由 `icon.svg` 渲染），条目里直接指向它的 raw 地址即可。

### 手动验证清单

| # | 场景 | 期望 |
| --- | --- | --- |
| 1 | agent 在读文件 | 「在看 XX，确认 YY」，**蓝**灯 |
| 2 | agent 在改文件 | 「在改 XX」，**黄**灯 |
| 3 | agent 在跑测试 | 「在跑测试，检查 YY」，**青**灯 |
| 4 | 工具报错 / 卡住 | **红**灯 + 「这里可能卡住了：XX」 |
| 5 | 只读提问 | 主会话**无**新消息，侧栏出解释 |
| 6 | steer 提醒 | 当前工具调用**不中断**，下个 step 采纳 |
| 7 | 先停一下 | 当前 turn 停，返回保留/中止说明 |
| 8 | 与终端/diff 并排 | 不挤爆、不横向滚动、文案不溢出 |
| 9 | 空闲 | 显示「空闲。上一轮用了 X 分 X 秒，改了 N 个文件。」 |
| 10 | 通篇文案 | 大白话、短句、无工具名、无长路径 |
| 11 | 做了一阵之后 | 底部总账先说**做成了什么**（点名文件），再说**还差什么**（下一件是哪件），而不是报「看过 N 处、跑过 N 次」 |

### 自动化测试

```bash
cd D:\work\tagclear\dsh-sidekick-lens
"C:\Program Files\nodejs\node.exe" test/narrative.test.mjs
```

95 项，覆盖上面 1–11 的全部场景 + 语言层单测 + 直播里踩出来的回归（见下）。
> Windows 沙箱下 `node --test test/` 会因为子进程 `spawn EPERM` 失败，直接跑测试文件本体即可。
> 用管道接 `node` 的输出（`| Select-Object`、`2>&1 | Select-String`）也会报「拒绝访问」，别接管道。

### 布局实测

`test/preview.mjs` 从 `lib/client.js` 里抠出**出货用的那段 CSS**，配上真 `view` 数据渲染成静态页，
用来量「和终端/diff 并排时会不会挤爆」：

```bash
$env:DSH_SESSION_ID = 'session-xxx'
"C:\Program Files\nodejs\node.exe" test/preview.mjs
```

实测 220 / 260 / 300 / 360 / 460 px 五档：`panelScrollX = 0`、`bodyScrollX = 0`、没有一行溢出，
展开态内容只纵向滚。真 GUI 里也验过：点侧栏「分栏」后与「Agent 浏览器」并排成 284px，
三行正常折行，三张门都无溢出——静态预览的数字和真机一致。

### 视觉：一张安静的卡片

面板就长在宿主主题里，不另起一套视觉语言：底色用 `--dsw-alias-bg-layer-1`，文字用 `--dsw-alias-label-primary/secondary/caption`，
浅色主题自动跟随。没有星野、没有极光、没有反应堆核心——那些试过，在 176–284px 的侧栏里只剩噪音。

留下的规则：

1. **一个强调色跟着灯走**。根节点带 `data-light`，派生 `--skl-accent`（蓝 `#5b8fd0` / 黄 `#c08b3e` / 青 `#3f9c94`；绿红直接取主题的成功/报错色）。灯、「正在做」行、三张门的标题都靠它级联，改一个属性整屏换色。
2. **没有边框，只有发丝线**。行与行、段与段之间是 8%（`--skl-hair`）与 15%（`--skl-hair-2`）的透明细线，不是盒子。
3. **只留两处动画，都携带信息**：灯的呼吸 `skl-breathe 2.6s`（在跑时才呼吸，说明它还在采样）与心跳波形（真实事件打点，静默时压平）。装饰性动效全部删掉了。
4. **来源徽标是纯文字**：`已观察到` / `仅据汇报`，后者用琥珀色 `#c9a26a`，全 panel 唯一的第二种颜色。
5. **位置感不用进度条**。`.skl-progress` 节点还在但 `display:none`；位置只靠头部「第 N / M 步」，避免第二条进度条制造噪音。
6. **窄栏靠容器查询，不靠媒体查询**（见下一节）。

`prefers-reduced-motion: reduce` 下动画全部关掉。

### 窄栏：面板问自己有多宽

侧栏会和终端、diff 分栏，最窄时只有 **176px**。硬按视口写媒体查询是错的——viewport 1264px，面板只有 176px。
所以 `.skl` 声明 `container-type: inline-size`，用 `@container (max-width: 215px)` 改版式：标签与徽标提到第一行（标签居左、徽标靠右），正文独占整行，详情字段名也从左侧栏改成上方标题。

实测（真 GUI 分栏态，`.skl` 宽 176px）：三行高 63 / 61 / 78px，三行正文 `scrollWidth - clientWidth = 0`，`panelScrollX = 0`，`bodyScrollX = 0`。
改造前同一宽度下「已完成」行会折成「看完了相关代 / 码。」这种断法。

### 直播里踩出来的错（都已修，都有回归测试）

这些问题只有接真会话才看得见，静态测试全绿也没用：

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| 在访问接口，**安装成功（ applied ，没有警告）** | 把「已完成」的口吻当成「为什么做」的理由 | `looksForward()` 只收朝前看的句子 |
| 做完了一件：**做点事** | 词表没兜住的动词被原样回显 | 兜底改成按动作类别说，不回显动词 |
| **zh** / **en** 裸文件名 | 两个字母的词干直接印出来 | 短词干说成「一个小文件（zh）」 |
| 明明走完 66 步，却说**还没干过活** | 冷启动只看 `lastTurn` | 有 `stepsDone` 就如实说走了多少步 |
| 绿灯旁边写着**在访问接口** | 上一轮残留的工具调用被当成当前动作 | 当前动作必须 `running` 才算数 |
| 写文件的**结果**写成「跑通了，没有报错」 | 一句话通用于所有动作 | 按 `kind` 分开说 |
| **第 138 步做完：**（冒号悬空） | 对象被 scrub 成空还留着冒号 | 对象为空就不带冒号 |
| **加载 我 重新 生成 预览** | 流式文本逐块切，汉字间留了空格 | scrub 收掉汉字之间的空格 |
| 空状态出现 **I'll run these one at a time** | 原样引用了 agent 的英文收尾 | `readableLine()` 只收有中文的句子 |
| 重载后**历史全丢** | 内存桶随插件消失，只从小活 agent 取种 | `sessionQuery.readSession()` 回读持久日志 |
| 重载后明明在跑却显示**绿灯、没在动** | `agent/status` 只在变化时发，不重放 | 播种时直接问 `agent.status` |
| 读文件之后说**办完了一件事** | 本 harness 的读工具叫 `read`，不在读表里 | 把 `read` 等本机常用工具补进分类表 |
| **在跑测试，</mcp 现在重新…** | 工具协议残留进了意图句子 | scrub 剥掉 `<...>` 与 ```` ``` ```` |
| **正在做永远是「在想下一步做什么」** | 重放真实日志：28% 的帧落在这句上。一半是英文思维链被「必须含中文」整条拒掉，一半是 step/start 清空缓冲区后无任何可读信号 | 英文思考按动词+对象读成「在看文件」；空档读上一步的对象说「刚改好了「旁白逻辑」，在找下一处」；回归测试断言整段会话里这句话出现 0 次 |
| **下一步一小时不换样** | 有清单时只印条目原文，条目一挂着这一行就冻结（4179 帧里只有 10 种取值） | 补上「还剩 N 件」与手上这步的对象；同样口径复测 109 种取值 |
| **「动了 2 个文件（旁白逻辑）」** | 脱敏占位词被当成文件名记进账本 | 占位词从名单里剔掉、但仍计入数量；名字数与总数对不上时干脆不点名单 |
| **下一步和账本各说各话** | 去重把整行换成模板句，行就不再提清单上那一件 | 改成丢掉重复的引子、保留条目（`guessNext(..., {plain:true})`），并加测试断言两处提到同一个名字 |
| **下一步退成「等这一步的结果出来再定」** | 去重靠「6 字重叠」判，两行都提到登录页就算重复 | 比较前先把「」里的对象摘掉，只有动作重复才算重复；回归断言点名的下一步不会被压成模板 |
| **「刚看过了「相关代码」」** | 「刚」已表过去，动词又带了个「了」 | `betweenText` 里把词尾「了」去掉；回归断言 `刚[^，]*过了` 不出现 |
| **正在做 → 在琢磨：读得太早了点现在展开 after1: true** | 意图句只过 `scrub`、没过屏蔽，英文调试碎片原样上屏 | `intentOf()` 补 `desensitize()`；残留 ASCII 一律丢弃，不给它配中性词 |
| 账本点名说 **narrative** / **sidekick-lens** | 词干映射表没覆盖本项目自己的文件名 | kebab 名、全大写名、整段路径三类先归一；仍未映射的拉丁词干统一说成「某个文件」 |
| 借来的句子末尾带**冒号/逗号** | 直接拼接 agent 原话 | `clause()` 收掉句尾标点 |
| 「已完成」老是说**办完了一件事** | 动词表漏了本机工具，全掉进兜底 | 按首个汉字判过去式 + 不变式测试：词表里漏一个就红 |
| **正在做**和**下一步**说同一句话 | 「下一步」只看上一件已完成的事 | 有正在做的一步就跟着它的目的猜下一步，重复了再换一套说法 |
| 总账只说**看过 29 处代码、跑过 25 次命令** | 摘要按「活动量」排，不按「结果 + 缺口」排 | `buildSummary` 重写成先结果后缺口；忙碌计数退到展开详情 |
| 「下一步」永远是**把结果对一遍** | 没有清单时只会套模板句 | 优先引用 agent 自己刚说要做什么的那句（标**仅据汇报**） |
| 点开某行**什么都不出来** | 详情块是 `<button>` 的子节点，被浏览器解析器抛出去 | 外层换 `div`，内层用 `role="button"` + 键盘事件 |
| 叫停之后**不解释**保留了什么 | host 算了 `cancelNote`，面板从没渲染 | 新增 `.skl-cancelled` 区块 |

---

## 配置项

在 `cordis.patch.yml` 里 `config:` 下写，全部有默认值：

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `showLight` | boolean | `true` | 状态灯开关。关掉后只剩三行字。 |
| `expandDetails` | boolean | `false` | 详情默认展开。默认收起（非目标里说了不许默认展开）。 |
| `explainProvider` | string | `''` | 「问解释助手」用的 provider。空=用主 agent 的默认模型。 |
| `explainModel` | string | `''` | 同上，model。 |
| `steerTemplate` | string | `'【侧边栏提醒】{text}'` | 提醒注入前的包装模板，`{text}` 会被替换。 |
| `emptyState` | string | `''` | 空闲文案模板，支持 `{duration}` 和 `{files}`。空=用内置句式。 |

```yaml
- insert:
    - id: sidekick-lens
      name: 'dsh-sidekick-lens'
      config:
        showLight: true
        expandDetails: false
        steerTemplate: '【侧边栏提醒】{text}'
```

配置校验**永不抛异常**：非法值一律回落默认，坏了不会拖垮启动。

---

## 文件结构

```
dsh-sidekick-lens/
├── lib/
│   ├── narrative.js   # 纯语言层：事件 → 三行话。无 I/O，可单测
│   ├── index.js       # 宿主半：事件订阅 + SSE/HTTP 路由 + 三条通道
│   └── client.js      # 客户端半：原生侧栏 tab 注册 + React 面板 + 全部样式
├── locale/{zh,en}.json
├── test/
│   ├── narrative.test.mjs   # 95 项自动化测试
│   ├── preview.mjs          # 从 client.js 抠真 CSS 渲染静态预览，量溢出
│   ├── preview.html         # 上者生成的默认（收起）态
│   ├── preview-expanded.html# 上者生成的展开态
│   └── check-leak.mjs       # 审会话日志：只读通道有没有偷偷塞消息
├── icon.svg
├── cordis.patch.yml
├── package.json
├── LICENSE
└── README.md
```

### 数据流

```
session/event ─┐
agent/status ──┼→ applySessionEvent(state) → buildView(state)
agent/error ───┤                                   │
assistant-stream┘                                  ↓
                                     SSE /__sidekick_lens/stream?session=
                                                   ↓
                                           侧栏 React 面板
                                                   │
              ┌────────────────────────────────────┼──────────────────┐
              ↓                                    ↓                  ↓
   POST /ask（隔离 llm.stream）      POST /steer（agent.steer）  POST /stop（agent.cancel）
```

宿主半负责所有会话动词，客户端只做展示 + `fetch`。这样客户端不依赖任何 Remote 命名空间，跨插件更稳。

---

## 已知限制

1. **只在有会话的侧栏里出现**。没打开会话时，tab 显示「还没有选中会话」。
2. **冷启动靠事件重放**。插件加载时先问活着的 agent 状态，再从 `session.snapshotEvents()` 重放最后 400 条事件；
   会话没挂着就回读持久日志（`sessionQuery.readSession`）。更早的历史不在面板里。
3. **「下一步」是推断，不是承诺**。它来自待办清单，或从上一步的动作推出来。真实下一步由主 agent 决定。
4. **红绿之间有灰区**。报错后主 agent 常常自己重试成功；灯会先红，重试通过才转绿。
5. **解释助手看不到原因，只看到摘要**。它拿的是剥掉工具名和路径的步骤摘要——这是有意的，代价是它不知道具体文件名。
6. **`steer` 依赖下个 step 边界**。如果 agent 正卡在一个特别长的工具调用里，提醒要等它跑完才生效。想立刻停就是「先停一下」。
7. **不做历史回放 UI**。只反映当前会话正在发生的事。
8. **`stop` 只对挂着的会话有效**。会话已经落盘但仍活着时能停；彻底不在进程里的会话会回「没有可停的步骤」。
9. **`?token=` 不会落盘**。GUI 的登录令牌由 Host 进程用 WeakMap 持有，只在启动时打印一次；重启进程就换新的。
   想重新拿到，得看 `dsh web` 的启动输出，或者临时挂个只读插件调 `connection.authenticatedUrl()`。
10. **`stop` 对正在跑的一轮只验证过一次**。用一个会数到 30 的子会话做的：返回
    「已经做完的 30 步都留着 / 停掉的是：在想下一步做什么」，日志里那一轮确实中止了。
11. **总账只算它看见的那一段**。计数来自本进程观察/重放的最近 400 条事件，不是整份历史账；
    插件重载后重新开始计数。所以「改了 4 个文件」是「这段里」，不是「有史以来」。
12. **总账的「文件」是文件名的口语化叫法**，不是路径。同一目录下的同名文件会被并成一项。

---

## 验收记录

逐条对着验收标准做的，结果如实写：

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 3 秒内看懂在干嘛 | ✅ | 三行 + 一盏灯 + 位置，无工具名 |
| 2 | 默认只有三行 + 一盏灯 | ✅ | `view.rows.length <= 3`，测试断言 |
| 3 | 点开看为什么/结果/可调整，再点收起 | ✅ | `aria-expanded` + 四段详情，截图确认 |
| 4 | 只读提问不碰主 agent | ✅ | 标记 `XQZMARK7` 审日志：`user/message 0`、`inbox/spliced 0` |
| 5 | steer 不打断当前步骤 | ✅ | 工具调用在跑时注入，下个 step 读到 |
| 6 | 先停一下能停 + 说清保留/中止 | ✅ | 子会话数到 30 时叫停，返回保留 30 步 / 中止「在想下一步做什么」 |
| 7 | 与 diff/终端并排不挤爆 | ✅ | 真 GUI 分栏，`.skl` 最窄 **176px**：`panelScrollX 0`、`bodyScrollX 0`、三行正文不溢出；另有 `@container (max-width:215px)` 窄栏版式 |
| 8 | 空闲状态有信息 | ✅ | 「空闲。上一轮用了 1 分 9 秒，改了 0 个文件。」 |
| 9 | 关键结论标来源 | ✅ | 每行都有 `observed`/`reported` 徽标 |
| 10 | 通篇大白话短句 | ✅ | 10 轮直播修正，见上面的缺陷表 |
| 11 | 说清「进行到哪一步、做了哪些」 | ✅ | 底部总账先说结果再补缺口：`到目前为止：动了 2 个文件（narrative、narrative.test）。` + 阶段词 + 清单 `d / t` |

真 GUI 内的验收也做了：侧栏引导页有「侧写」卡片 → 点开就是三行 + 一盏灯 + 三张门 → 点行展开四段详情 →
「问解释助手」提问真的回了话（`没卡住，它一直在跑命令…`）→ 点「分栏」后与「Agent 浏览器」并排 284px 不溢出。

拿到 GUI 令牌的办法：`?token=` 只活在 Host 进程的 WeakMap 里，不写盘。临时装一个只读插件，
在路由里 `ctx.get('connection').authenticatedUrl(ctx.get('webApp').getAdvertisedUrl())` 就能取到，用完即删。

---

## 设计取舍

**思维链进摘要，但不进「已观察到」。** 一开始只把思考拿来做心跳（思考也算在动，否则静默分不清是停住还是在想），内容丢掉。结果摘要只能靠工具名和少量最终发言拼，「它在翻文件」后面的理由全靠猜——实测这个会话里 1107 条消息带思考块，全部没被用上。现在思考会折进摘要的【仅据汇报】段，也会在还没有工具调用时接管「正在做」和「下一步」：`在想下一步做什么` 换成它真实的打算。但思考永远不标 `已观察到`，因为它只是它对自己说的话，没有任何工具证据。英文的思考不会进面板（面板只有中文），但解释助手能读到。

- **三行，不是三屏**：侧栏可能和 diff/终端共享宽度，文案一旦长就会挤到别人，所以主面板先做减法，详情按需展开。
- **不用百分比**：百分比在 agent 工作里是假的，没人知道总共几步。「第 3 / 7 步」也别当真，它只是位置感。
- **来源标注不可关**：这是产品的一部分，不是装饰。已观察到和仅据汇报混在一起，用户就没法判断该不该信。
- **三条通道在视觉上分开**：一个输入框让用户猜「我这句话会打断它吗」是最糟的设计。
- **解释助手拿的是摘要，不是会话**：它看不到工具名和路径（故意的），代价是它不知道具体文件名。但摘要分两段标注来源，所以它不会把 agent 的自吹当事实。
- **视觉上做了减法**：试过仪器网格、星野、反应堆核心、扫描带、频道号——在 176–284px 的侧栏里全部读起来像噪音。
  最后留下的是一个强调色、发丝线、两处真动画。**装饰越少，三行字越显眼**，这正是这个插件要的东西。

---

MIT License.

