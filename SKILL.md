---
name: qigua-najia
description: >
  起卦入口与纳甲六爻断卦。支持三种入口：梅花年月日时起卦、梅花两数报数起卦、
  用户已有卦象输入（六爻爻值 / 本卦+变卦 / 本卦+动爻 / 明确静卦）。
  取数、上下卦、动爻、变卦、动爻识别全部由确定性代码计算，再由内置京房纳甲六爻引擎装卦
  （纳甲/世应/六亲/六神/旬空/伏神/神煞/卦爻辞），最后交给 references/duangua-prompt.md 断卦。
  Triggers: 起卦, 算一卦, 摇卦, 六爻, 六爻排盘, 纳甲, 梅花易数, 梅花起卦, 时间起卦, 两数起卦,
  报数起卦, 观梅占, 本卦变卦, 动爻, 断卦, 占卜, 周易占卜, divination, I Ching, liuyao, najia.
---

# 起卦入口与纳甲六爻断卦（qigua-najia-v1）

**一句话**：梅花两法（或外部卦象）只负责**生成/标准化卦画**，内置纳甲引擎负责**确定性装卦**，
模型只负责**取用与断卦**。任何数值都不许模型心算。

---

## 0. 铁律（违反即返工）

1. **一切算卦由代码完成**。取数、余数、上下卦、动爻、变卦、动爻识别、纳甲、世应、六亲、六神、
   旬空、伏神、神煞，全部来自 `scripts/`。模型**不得心算、不得按卦名反推爻画、不得猜动爻、
   不得手写变卦、不得改盘**。
2. **不许跳过脚本自己编一个盘**。哪怕你知道答案（例如观梅占），也必须先跑代码，
   报告里的卦必须与脚输出逐字一致。
3. **梅花两法恰好一条动爻**；**外部输入 0–6 条动爻全部保留**，不得压成一条，
   不得把静卦伪造成「本卦=变卦」的假变卦。
4. **两把时间分开**：`meihua_reference_time`（梅花取数）≠ `najia_cast_at`（月建/日辰/六神/旬空）。
   外部输入没有梅花取数时间，**不得伪造**。历史卦必须用**原始起卦时间**，不得默认当前时间。
5. **梅花口径不许换**：年支用**农历年支**（正月初一换年，`getYearZhi()`），
   月用农历月（闰月取绝对值），日用农历日，时用**时支**。
   **禁止**节气月、立春换年、八字月柱。
6. **失败关闭**：缺动爻/变卦/静卦声明 → `MISSING_CHANGE_INFORMATION`；
   爻值/本卦/变卦/动爻互相矛盾 → `CONFLICTING_HEXAGRAM_INPUT`；
   引擎与计算不一致 → `INTERNAL_CONSISTENCY_ERROR`；格式/名称/时间非法 → `INVALID_INPUT`。
   **出错就停，不得替用户修补数据**，也不得自己「选一套」继续算。
7. **体系不许混**：本 Skill 的断卦体系是**纳甲六爻**。梅花体用/生克/互卦**不得**混进用神体系，
   也不得把「体卦/用卦」说成「世爻/应爻」。用户要纯梅花分析 → 另开流程。
8. **来源必须披露**：梅花起卦不得包装成铜钱摇卦；外部输入不得标成梅花起卦。
9. **六亲名 ≠ 五行生克**：官鬼/父母/兄弟/子孙/妻财只是按**卦宫五行**定的**名号**，
   断生克一律按**两爻真实五行**算。「官鬼」＝克**卦宫**者，不是克**世**者；
   世五行≠宫五行时，官鬼对世完全可能是**生**（例：乾宫金之卦，上爻己巳火为官鬼，
   世爻辰土 → 巳火**生**辰土，名鬼而实生）。严禁「官鬼临火克土」这类写法；
   官鬼生世时，压力/风险象只能由其他依据（勾陈迟滞、化空、旬空、月破、动克他爻…）承担。
   详见 `references/duangua-prompt.md` §五 第 5 节。
10. **够了就别问**：只要「卦象 + 时间（公历或干支）+ 事由」齐了，**一句都不问，直接排盘断卦**。
    给了**本卦+变卦**就说明用户已有卦 → 走 `EXTERNAL_HEXAGRAM_INPUT`，**不走梅花取数**，
    不问「起卦方式」（缺省 `UNKNOWN`）、不问时区、不要求补公历日期。
    只给「申月 丙子日」这种干支 → 用 `--najia-ganzhi`，**不要追问公历日期**。
    只有「缺了就算不出来」的项才问：卦象本身、动爻/变卦/静卦声明、月建或日柱。
11. **只聊天，不弹窗**：所有缺信息都在**对话里**用一两句自然语言问，一次最多问两小项。
    **禁止**调用交互式表单/问卷类工具（如 interview）、打开浏览器让用户填表、生成 HTML 页面收集信息。
    用户说「随便/你定/都行」时，按默认值继续，并在报告里注明用了什么默认项。

---

## 1. 工作流程（按顺序执行）

### 第 1 步：在对话里问「要占什么事」（只用聊天，不弹表单）

先用**一句自然语言**问事由，不要一上来抛清单：

> 想占什么事？一句话说清就行（比如「下周去外地办事顺不顺」「猫丢了还能找回来吗」）。

拿到事由后，再顺手补两三项最关键背景（涉及谁、目前已知、最关心什么）——**仍然在对话里问**。
用户不需要选六亲/用神。

若用户一条消息里已经把「卦象 + 时间 + 事由」给全（例：「地火明夷之雷山小过，申月丙子日，占出行」），
**什么都不要再问**，直接进第 3 步跑脚本（见 §2.6 干支直输）。
只有真的缺项（如只给卦名、没说动爻/变卦/静卦，或没给月建/日柱）才问那一项。

### 第 2 步：确定入口

| 用户情形 | 入口 | `source_method` |
|---|---|---|
| 没有特殊数字线索，想按时间起卦（含「用某个事件时间取数」） | 梅花年月日时 | `MEIHUA_TIME` |
| 凭第一感觉报了两个整数 | 梅花两数 | `MEIHUA_TWO_NUMBERS` |
| 已经摇过/用别的工具得到卦，录入爻值、本卦+变卦、本卦+动爻或静卦 | 外部卦象输入 | `EXTERNAL_HEXAGRAM_INPUT` |

**必问项**（缺了跑不起来；**在对话里问**，一次问一到两项，不要一次抛全部）：

- 时间法：起卦时间（**含时区**）。默认用「现在」，但必须显式确认时区（如 `Asia/Shanghai`）。
  若用户用「事件时间/原始发布时间」取数，必须同时确认**实际占问时间**（两把时间不同）。
- 两数法：两个**正整数**（凭第一感觉；不许替用户挑数、不许反复换数）+ 实际占问时间。
- 外部输入：具体卦象 + **排盘基准**——二选一即可，**不要两个都要**：
  ① 原始起卦时间与时区（有公历时间时用）；② **干支直输**（用户给「申月 丙子日」时用 `--najia-ganzhi`，
  此时**不要再要公历日期**）。历史卦不得用今天的时间。
  起卦方式不知道就填 `UNKNOWN`，**不要为这个专门问用户**。
- 用户只报了本卦、**没提变卦/动爻**时：**在对话里问一句**「这卦有动爻吗？几爻动？还是静卦？」
  ——不要开表单、不要默认静卦、不要自己补变卦。答不出来 → 报 `MISSING_CHANGE_INFORMATION` 并说明为什么必须知道。

### 第 3 步：跑脚本（**唯一**允许的算卦方式）

```bash
# 本 skill 根目录（无需 npm install，node_modules 已内置）
cd ~/.pi/agent/skills/qigua-najia
```

环境要求：Node ≥ 20（用到 `node:test`、`Intl.DateTimeFormat` 的 IANA 时区）。无编译步骤。
本机已内置 `node_modules`（`lunar-javascript` 是唯一依赖）；**新克隆的仓库先跑一次 `npm install`**。

见 §2 命令示例。脚本输出 = `卦源说明` + `梅花取数/外部校验` + `卦象` + `六爻排盘` + `事实包 JSON`。

### 第 4 步：把「卦源说明 + 事实包」交给断卦规范

按 `references/duangua-prompt.md`（《六爻断卦提示词》v4 全文，58,890 字，**不删减不选章**，
复制基线 `docs/prompt-liuyao.md` @ `0801dca`，sha256 见 `references/engine-contract.md` §4）执行：

- 默认四段：**取用 / 盘面 / 走势 / 应期**，正文 **400–550 字**。
- 只读 `facts` 里的字段；缺字段就写「未提供」，不得按通行排法补算。
- 事项分流到规范里的专项（疾病、六畜/宠物、行人、婚姻、失物、求财经营、工作事业、家宅迁移、学业）。
- 输出开头保留脚本给的**卦源说明**（来源类型 / 取得方式 / 输入模式 / 纳甲引擎 / 事实来源 / 算法版本）。

---

## 2. 可直接执行的命令（复制即用）

> 前置：`cd ~/.pi/agent/skills/qigua-najia`。默认输出 text（卦源说明 + 排盘表 + 事实包 JSON）；
> 加 `--format json` 只出 JSON。

### 2.1 梅花时间法（年月日时）

```bash
node scripts/cast.mjs \
  --time "2025-01-16 15:30" --tz Asia/Shanghai \
  --question "朋友的父亲昨天走失，家属已报警，想问老人目前是否平安。"
```

- 这条就是《观梅占》样例（农历甲辰年腊月十七申时），应输出 **泽火革 → 泽山咸，初爻动**。
- 用「事件时间取数 + 现在占问」的组合模式：

```bash
node scripts/cast.mjs --time "2025-01-16 15:30" --tz Asia/Shanghai \
  --time-source "原始朋友圈发布时间" \
  --najia-cast-at now --najia-tz Asia/Shanghai \
  --question "这件事后续会怎么发展？"
```

### 2.2 梅花两数报数

```bash
node scripts/cast.mjs --numbers 5 3 --tz Asia/Shanghai --now \
  --question "最近准备换工作，已面试两家，想问其中一家是否给录用机会。"
```

- 5 / 3 → 上巽下离，动爻 (5+3)%6=2 → **风火家人 → 风天小畜，二爻动**。
- `--now` 表示「按当前时刻装纳甲」；老卦请改成 `--najia-cast-at "2024-05-06 21:10"`。
- 两数法**不依赖时辰**：时区只影响纳甲月日。

### 2.3 外部卦象输入（四种模式）

```bash
# 模式一：六爻爻值（初爻→上爻，第一次摇卦=初爻）
node scripts/cast.mjs --external '{
  "input_mode": "SIX_LINE_VALUES",
  "acquisition_method": "COIN_TOSS",
  "six_line_values": [6, 7, 9, 7, 8, 9]
}' --najia-cast-at "2025-01-16 15:30" --najia-tz Asia/Shanghai \
  --question "家里准备卖房，这次交易能否顺利完成？"

# 模式二：本卦 + 变卦（代码反推动爻）
node scripts/cast.mjs --external '{"input_mode":"ORIGINAL_PLUS_CHANGED","acquisition_method":"EXTERNAL_APP","original_hexagram":"泽火革","changed_hexagram":"泽山咸"}' \
  --najia-cast-at "2025-01-16 15:30" --najia-tz Asia/Shanghai

# 模式三：本卦 + 动爻（代码生成变卦）
node scripts/cast.mjs --external '{"input_mode":"ORIGINAL_PLUS_MOVING_LINES","original_hexagram":"风火家人","moving_lines":[2]}' \
  --najia-cast-at "2025-01-16 15:30" --najia-tz Asia/Shanghai

# 模式四：明确静卦（必须有 is_static=true，不许把静卦说成有动爻）
node scripts/cast.mjs --external '{"input_mode":"ORIGINAL_STATIC","original_hexagram":"水火既济","is_static":true}' \
  --najia-cast-at "2025-01-16 15:30" --najia-tz Asia/Shanghai
```

### 2.4 整份 JSON / 管道

```bash
node scripts/cast.mjs --file input.json        # 字段见 references/engine-contract.md §1
node scripts/cast.mjs < input.json
node scripts/cast.mjs --time "2025-01-16 15:30" --tz Asia/Shanghai --format json --out result.json
```

### 2.6 干支直输（用户只给「月建 + 日柱」，没有公历日期）

```bash
# 本卦+变卦 + 干支：一句都不问，直接排
node scripts/cast.mjs   --external '{"input_mode":"ORIGINAL_PLUS_CHANGED","original_hexagram":"地火明夷","changed_hexagram":"雷山小过"}'   --najia-ganzhi "申月 丙子日"   --question "占出行"

# 分项写法（等价）
node scripts/cast.mjs --external '{"input_mode":"SIX_LINE_VALUES","six_line_values":[9,8,7,6,8,8]}'   --najia-month 申 --najia-day 丙子 --najia-hour 申 --question "占出行"

# 带年柱（只用于显示）
node scripts/cast.mjs --external '...' --najia-ganzhi "乙巳年 甲申月 丙子日"
```

- 月建 = `申`、日辰 = `丙子`、旬空 = `申酉`、六神按日干起（丙日初爻朱雀）——与用公历时间排出的盘逐字一致。
- 干支与 `--najia-cast-at` **同时给且矛盾** → 报 `INVALID_INPUT`，不替用户择一。
- 梅花入口**不允许**干支直输（梅花取数要农历年支/月/日/时支）。

### 2.5 自检

```bash
node --test tests/*.test.mjs     # 34 项全绿（某些 Node 构建不接受裸目录参数，故用通配）
npm test                         # 同义（package.json 已配置）
```

---

## 3. 输出必含结构（给用户看的顺序）

```text
【卦源说明】来源类型 / 取得方式 / 输入模式 / 纳甲引擎 / 断卦体系 / 事实来源 / 算法版本
【双时间基准】纳甲起卦时间；时间法另列梅花取数时间（两者不同则明示「事件时间取数 + 占问时间装卦」）
【梅花取数】或【外部卦象输入校验】 年支/月/日/时支/S1/S2 或 A/B/和 + 动爻；或录入内容与机器校验摘要
【卦象】本卦（可注卦宫/结构）、动爻、变卦（静卦写「无变卦」）
【六爻排盘】六神 六亲 纳甲 世应 动静 变爻 伏神 旬空 月破 神煞 月建 日辰 卦爻辞
【断卦报告】取用 / 盘面 / 走势 / 应期，400–550 字
```

- 用户不需要看程序推导，但**必须能追溯**：取数、动爻、变卦、月建日辰都在报告里可见。
- 报告里不许出现「摇得老阳」这类说法去描述梅花两法（那是内部编码：动阳=9、动阴=6）。

---

## 4. 错误处理（失败关闭）

| 错误码 | 触发 | 你该做什么 |
|---|---|---|
| `MISSING_CHANGE_INFORMATION` | 只给本卦，没动爻/变卦/静卦声明 | 问用户：动爻是哪几爻？有没有变卦？还是静卦？ |
| `CONFLICTING_HEXAGRAM_INPUT` | 爻值 ↔ 本卦 ↔ 变卦 ↔ 动爻互相矛盾 | 指出矛盾点，请用户确认，**不许自己选一套** |
| `INVALID_INPUT` | 卦名不全/爻值非法/动爻越界/缺时间/缺时区/非正整数 | 按提示补，**不许猜**（时区不许用设备时区替代） |
| `INTERNAL_CONSISTENCY_ERROR` | 引擎输出与本 Skill 计算不一致 | 停止断卦，报告这是代码/数据层问题 |

CLI 行为：错误 JSON 打到 stderr、退出码 `2`、`fail_closed: true`。**出错就没有盘，不能断卦。**

---

## 5. 文件清单

```text
qigua-najia/
├── SKILL.md                        # 本文件：流程与禁令
├── package.json                    # npm test → node --test tests/*.test.mjs
├── references/
│   ├── method-spec.md              # 梅花两法 + 外部四模式的公式/历法口径/校验/错误码
│   ├── source-notes.md             # 《梅花易数》卷一依据、两数法的现代边界、观梅占样例
│   ├── engine-contract.md          # 输入 JSON / 输出事实包 / 字段映射 / 引擎来源
│   └── duangua-prompt.md           # 断卦规范全文（原样复制自 docs/prompt-liuyao.md @ 0801dca，勿改）
├── scripts/
│   ├── cast.mjs                    # CLI + 编排 + 一致性闸门 + 文本渲染
│   ├── meihua.mjs                  # 时间法 / 两数法（纯函数，BigInt）
│   ├── external.mjs                # 外部四模式标准化 + 冲突检测
│   ├── errors.mjs                  # 错误码与 fail-closed 异常
│   └── engine/
│       ├── najia.mjs               # 纳甲装卦（复制自 liuyao/lib/liuyao/najia.ts）
│       ├── ganzhi.mjs              # 时刻→干支/月建/时支（复制自 liuyao/lib/liuyao/ganzhi.ts）
│       ├── shensha.mjs             # 《古筮真诠》十三神煞（复制自 liuyao/lib/zhanbu/shensha.ts）
│       ├── oracle-text.mjs         # 64 卦卦爻辞（复制自 liuyao/lib/hexagram/oracle-text.ts）
│       └── facts.mjs               # 事实包（移植自 liuyao/lib/readings/facts.ts，改相对导入）
├── node_modules/lunar-javascript/  # 农历/干支依赖（整包复制，自包含）
└── tests/
    ├── cast.test.mjs               # 34 项回归（观梅占/两数/静卦/多动爻/冲突/方向/边界）
    └── fixtures.json               # 黄金样例与边界数据
```

**自包含**：不 import、不依赖 `C:\Users\奇哥\Desktop\liuyao` 仓库的任何路径或运行时。
引擎是编译进 `scripts/engine/` 的独立副本（来源与重建命令见 `references/engine-contract.md` §4）。

---

## 6. 常见误用（出现即返工）

| 误用 | 正确做法 |
|---|---|
| 自己心算 34%8=2 兑、43%6=1，然后直接开始断卦 | 必须跑 `scripts/cast.mjs`，用它的输出 |
| 时间法用了立春换年 / 节气月 | 用农历年支（`getYearZhi()`）+ 农历月 + 农历日 + 时支 |
| 两数法「再加个时辰更准」 | 不加。两数法只有 A、B、(A+B) |
| 外部多动爻被写成「主要动爻一条」 | 全部保留，几爻动就几爻动 |
| 静卦报告成「本卦=变卦」并分析「变卦」 | 静卦就是无变卦，`changed=null` |
| 外部输入的卦被写成「梅花起卦」 | 标「外部卦象输入」+ 具体取得方式 |
| 梅花起卦报告里写「摇得老阳」 | 那是内部编码，不是摇卦 |
| 拿梅花体用生克去定六爻用神吉凶 | 两套体系分开，本 Skill 只做纳甲六爻 |
| 写「官鬼临火克世之土」「父母临土克子孙」 | 名号不是生克：按两爻真实五行算（官鬼＝克卦宫者，非克世者）；见规范 §五.5 |
| 官鬼生世却硬安「压力/阻滞」 | 生就是生；压力象要靠勾陈迟滞、化空、旬空、月破等实证，不得靠名号凑 |
| 用户说「这卦不好，重摇」就悄悄换一卦 | 新卦可另起；两卦独立呈现，不得择优 |
| 只给本卦就默认静卦开始断 | 报 `MISSING_CHANGE_INFORMATION`，先问 |
