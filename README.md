<p align="center">
  <img src="public/git-atlas-mark.png" width="88" alt="Git Atlas 标志">
</p>

<h1 align="center">Git Atlas</h1>

<p align="center">
  <strong>为 Codex 打造的本地 Git 仓库情报工作台。</strong><br>
  看历史、查因果、找热点、控风险；拓扑始终稳定，数据始终留在本机。
</p>

<p align="center">
  <a href="https://github.com/Kurtor/codex-git-atlas/releases/latest"><img src="https://img.shields.io/github/v/release/Kurtor/codex-git-atlas?style=flat-square&color=2388c9&label=release" alt="最新版本"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20x64-2388c9?style=flat-square" alt="Windows x64">
  <img src="https://img.shields.io/badge/data-local%20only-2a9d63?style=flat-square" alt="数据仅保存在本地">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-30363d?style=flat-square" alt="MIT License"></a>
</p>

<p align="center">
  <a href="https://github.com/Kurtor/codex-git-atlas/releases/latest"><strong>下载 Windows 便携版</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp; <a href="#30-秒开始">30 秒开始</a>
  &nbsp;&nbsp;|&nbsp;&nbsp; <a href="#界面怎么读">界面怎么读</a>
</p>

![Git Atlas 因果场与提交详情工作区](docs/assets/git-atlas-workbench.png)

<p align="center"><sub>因果场、稳定拓扑、Merge 锚点与按需详情浮层；1280 × 720 仍可完整阅读约 10 条提交。</sub></p>

## 为什么需要 Git Atlas

传统 Git 分支图擅长回答“线是怎么连的”，却不擅长回答开发时更常见的问题：某个提交从哪里来、会影响哪些后继，改动长期集中在哪些模块，哪些提交应该先检查，以及切换 Codex 项目后我是不是还在看正确的仓库。

Git Atlas 把这些问题拆成四个真正不同的工作模式，同时保留一张不会因点击节点而重排的稳定拓扑。选中提交只移动焦点，不破坏你对图谱位置的记忆。

| 能力 | 带来的结果 |
| --- | --- |
| 完整分支历史 | 使用 Git 可达性计算分支成员，不再只显示带分支标签的少数提交 |
| 稳定因果拓扑 | 节点选择只改变焦点和关系高亮，不重排节点、曲线或列表几何 |
| 分支行为锚点 | Merge 使用汇合菱形，Rebase 使用重写双环；提交行和详情同步解释来源、目标与识别依据 |
| 四种分析模式 | 提交演化、因果场、模块影响、风险路径各有专属指标、列表语义与操作区 |
| 图谱优先工作台 | 四模式拥有独立色彩与信息语法；Git 分支、Merge、Rebase、增删行使用另一套固定语义色 |
| 高密度范围档案 | 同屏聚合模块分布、贡献者、风险信号，并填补小仓库的无效空白 |
| 内嵌仓库浏览 | 在左栏直接查看最近仓库、本机目录和文件，不被系统选择弹窗打断 |
| 跟随 Codex | Codex 切换本地项目时自动切换 Git 仓库，并提供明确开关 |
| Git 快捷操作台 | 在当前页面完成获取、快进拉取、普通推送、暂存、提交和本地分支切换；命令白名单与结果回显始终可见 |
| 真实提交活跃度 | 左栏直观看到历史时间分布，点击柱形即可定位对应提交 |
| 父提交对比 | 查看真实 `git diff` 文件列表；根提交也能正确展示完整变更 |
| Codex 分析 | 通过本机 Codex CLI 只读分析提交意图、风险与建议测试 |

## 30 秒开始

1. 从 [Releases](https://github.com/Kurtor/codex-git-atlas/releases/latest) 下载 `Git-Atlas-*-Windows-x64.exe`。
2. 双击运行便携版，点击顶部仓库名称打开左侧导航；点击导航中的“切换”即可从最近仓库或本机文件列表打开 Git 仓库。
3. 如果希望它跟随 Codex，在顶部或仓库导航中显式开启“跟随 Codex”。

运行要求：Windows 10/11 x64，并确保 `git` 可在系统命令行中使用。Codex CLI 只在使用“用 Codex 分析”时需要。

## 界面怎么读

### 提交演化

默认工作区。按时间扫描稳定 Git DAG、提交信息、模块构成、变更规模、作者与时间；“模块构成”直接显示主要模块、占比和次要模块色段，不再使用含义不明的色块。顶部显示提交范围、分支、贡献者和代码变更总量。

### 因果场

围绕当前提交计算完整的祖先与后继集合。顶部用“上游祖先 → 当前焦点 → 下游后继”表达路径，列表中的每条提交会明确标记为上游、下游或当前焦点。“只看关联路径”会真正过滤列表，不只是降低亮度。

### 模块影响

把当前范围内的提交聚合成模块热区，按累计变更量排序，并显示触达次数和平均风险。点击模块卡片即可筛选所有触达该模块的提交，再次选择“全部模块”恢复全局。

### 风险路径

根据变更规模、删除比例、合并结构和模块跨度生成 0-100 风险评分。风险队列列出优先检查项，主列表只保留中高风险提交；详情面板同时展示四个评分因子，列表、队列与详情使用同一套规则。

![Git Atlas 的四种分析模式](docs/assets/git-atlas-four-modes.png)

<p align="center"><sub>左上为提交演化，右上为因果场，左下为模块影响，右下为风险路径。</sub></p>

### 列表密度

顶部的“紧凑 / 标准 / 宽松”只控制提交行距，不会改变数据。它取代了含义不清、难以拖动的滑块，并提供更大的点击目标与键盘焦点状态。

### 本地仓库浏览

点击顶部仓库名称会打开左侧导航，分支、标签、活跃度和工作区状态都在这里按需出现；点击导航中的“切换”后，同一抽屉原位切换为仓库浏览器。最近仓库最多保留 8 个，界面优先显示其中 3 个；下方文件列表支持逐级浏览、返回上级和直接输入路径。Git 文件夹会得到明确标记，普通文件只用于确认当前位置。手动打开仓库时会自动关闭“跟随 Codex”，避免随后被后台切回其他项目。

![Git Atlas 内嵌仓库浏览器](design/repository-browser-final.png)

<p align="center"><sub>仓库浏览在左栏完成，提交拓扑和详情始终保持可见。</sub></p>

### 提交活跃度

左下角柱形图来自当前仓库的真实提交时间：横向从较早到最近，柱高代表该时间段的提交数，绿色柱代表当前选中提交所在区间。点击有数据的柱形可以快速定位。

### 跟随 Codex

此功能默认关闭。开启后，Git Atlas 会读取 Codex 当前选择的本地项目：

- 项目根目录是 Git 仓库时，直接跟随。
- 项目只包含一个直属 Git 子仓库时，跟随该仓库。
- 项目包含多个 Git 仓库时，保持当前仓库并提示歧义，不擅自猜测。
- 用户手动打开仓库或关闭开关后，停止跟随并保留当前视图。

### Merge 与 Rebase

分支的关键操作会被提升为拓扑事件，而不是淹没在普通提交里：

- Merge：从提交的多父结构稳定识别。图中使用琥珀色菱形汇合节点，提交行显示“合并”，详情区展示来源分支、目标分支与父线数量。
- Rebase：从本机 Git reflog 识别最近完成的操作。图中使用紫色双环重写节点，提交行显示 `REBASE`，详情区展示变基分支与新基线。
- 搜索框支持按 `merge`、`rebase` 和涉及的分支名定位相关提交。
- 提交演化顶部与范围档案会统计当前视图中的合并和 Rebase 事件。

Git 提交对象本身不保存 Rebase 操作记录，因此 Rebase 标记只在本机 reflog 尚未过期时可用。Git Atlas 会在详情区明确标注这一证据边界；Merge 不受此限制。

### Git 快捷操作

点击顶部“Git 操作”、左下角工作区状态，或按 `Ctrl + Shift + P`，即可在提交图上方展开操作台。它不是任意命令终端，而是一组围绕日常工作流设计的 Git 白名单：

| 区域 | 支持的操作 | 明确边界 |
| --- | --- | --- |
| 远端同步 | `fetch --prune`、`pull --ff-only`、普通 `push` | 拉取与推送需要二次确认；不提供强推 |
| 工作区 | 查看 staged / unstaged / untracked、暂存全部、取消暂存 | 取消暂存只修改索引，不丢弃工作区内容 |
| 提交 | 单行提交说明、按钮提交、`Ctrl + Enter` | 只有存在已暂存更改时才可提交 |
| 分支 | 切换已有本地分支、新建并切换分支 | 工作区不干净时暂停操作，避免把修改意外带走 |

![Git Atlas Git 快捷操作台](docs/assets/git-atlas-git-actions.png)

<p align="center"><sub>操作、状态、确认和 Git 输出均留在当前工作区；图中展示普通推送的显式确认。</sub></p>

Git Atlas 不提供强制推送、硬重置、丢弃修改、删除分支或任意 Shell 输入。所有参数通过进程参数数组传给本机 Git，不经过 Shell 拼接；远端操作同时关闭终端式交互，失败原因会回显在操作台底部。

## 资源占用策略

Git Atlas 是 Electron 桌面应用，但持续工作保持克制：

- Git 历史单次最多读取 500 条提交，避免无界加载。
- 拓扑使用 Canvas 2D 绘制，数据列使用 DOM，兼顾滚动性能与文字可读性。
- 分支成员最多计算 16 个本地分支，并限制为 3 个并发 Git 进程，避免仓库打开时瞬时抢占资源。
- 模块、作者、因果关系和风险聚合均使用内存中的提交数据与 React 缓存，不增加后台扫描。
- Codex 跟随只在开关开启且窗口可见时检查；隐藏或最小化后暂停。
- Codex 状态文件按修改时间缓存，无变化时不重复解析，也不触发 React 重绘。
- 跟随检查间隔为 3 秒，仓库路径变化时才重新读取 Git 历史。
- 本机文件列表只在用户打开仓库浏览器或切换目录时读取，单次最多展示 180 项，不做后台磁盘扫描。

v1.5.0 在 Windows x64、16 逻辑处理器和真实本地仓库下的便携版实测：5 个进程合计可见空闲工作集约 377.5 MB、私有内存约 245.4 MB、5 秒整机 CPU 采样为 0%。本次分支行为功能没有增加 UI 框架、字体包或动画库，前端产物约为 286.8 KB JavaScript（gzip 86.1 KB）与 55.2 KB CSS（gzip 12.1 KB）。不同仓库规模与系统环境下会有差异，Electron 基线内存也不应被包装成“原生级轻量”。

v1.6.0 的内嵌仓库浏览同样没有新增运行依赖或常驻任务；目录访问只由用户操作触发。生产前端产物约为 308.4 KB JavaScript（gzip 91.1 KB）与 62.9 KB CSS（gzip 13.5 KB）。

v1.7.0 的 Git 快捷操作同样完全按需执行，不增加轮询、后台扫描或第三方运行依赖；操作台只在打开时读取一次工作区状态，命令完成后再刷新。生产前端产物约为 336.6 KB JavaScript（gzip 97.6 KB）与 71.6 KB CSS（gzip 15.1 KB）。

v1.8.0 将常驻左右栏改为按需抽屉与浮层，并把四层历史样式收敛为单一 token 化视觉系统。没有新增运行依赖、后台任务或动画库；生产前端产物为 336.7 KB JavaScript（gzip 97.3 KB）与 44.1 KB CSS（gzip 8.9 KB），样式体积相较 v1.7.0 下降约 38%。同一台 Windows x64 设备上，便携版空闲运行的 5 个 Electron 进程合计工作集约 401.1 MB、私有内存约 240.4 MB，5 秒 CPU 增量为 0.00 秒；内存仍主要来自 Electron 基线。

## 隐私与安全

- 仓库数据通过本机 `git` 命令读取，不上传到 Git Atlas 服务。
- “跟随 Codex”只读检查本机 Codex 项目映射，不读取聊天内容。
- 只有主动点击“用 Codex 分析”时，才调用已经安装并登录的本机 Codex CLI。
- Codex 分析使用临时会话与只读沙盒，并明确要求不得修改文件。
- Git 快捷操作只接受应用内置的命令与结构化参数，不提供任意 Shell；推送永不附加 `--force`，拉取固定使用 `--ff-only`。

## 接下来适合补什么

优先级按“减少日常操作”排序，而不是按视觉噱头排序：

1. 任意两点比较：固定 A、B 两个提交后查看净变更与路径差异。
2. 逐文件暂存：在操作台里选择文件或 hunk，而不只操作全部更改。
3. 提交书签与本地备注：给排查中的关键节点留下只存在本机的标记。
4. 大仓库性能模式：按需分页、关闭光晕，并显示实际渲染与 Git 读取耗时。
5. 键盘命令搜索：统一调用仓库、筛选、比较与 Git 快捷操作。

## 本地开发

需要 Node.js 22+ 与 Git。

```bash
git clone https://github.com/Kurtor/codex-git-atlas.git
cd codex-git-atlas
npm install
npm run dev
```

常用命令：

```bash
npm run typecheck   # TypeScript 检查
npm run test:git-actions # 在临时仓库验证 Git 快捷操作与安全拒绝
npm run build:web   # 构建渲染层
npm run build       # 生成 Windows 便携版到 release/
```

## 技术栈

Electron · React · TypeScript · Vite · Canvas 2D · 原生 Git CLI

## License

[MIT](LICENSE)
