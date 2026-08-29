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

![Git Atlas 使用自身仓库展示模块影响工作区](docs/assets/git-atlas-workbench.png)

<p align="center"><sub>Git Atlas 自身仓库，模块影响模式，跟随 Codex 已开启</sub></p>

## 为什么需要 Git Atlas

传统 Git 分支图擅长回答“线是怎么连的”，却不擅长回答开发时更常见的问题：某个提交从哪里来、会影响哪些后继，改动长期集中在哪些模块，哪些提交应该先检查，以及切换 Codex 项目后我是不是还在看正确的仓库。

Git Atlas 把这些问题拆成四个真正不同的工作模式，同时保留一张不会因点击节点而重排的稳定拓扑。选中提交只移动焦点，不破坏你对图谱位置的记忆。

| 能力 | 带来的结果 |
| --- | --- |
| 完整分支历史 | 使用 Git 可达性计算分支成员，不再只显示带分支标签的少数提交 |
| 稳定因果拓扑 | 节点选择只改变焦点和关系高亮，不重排节点、曲线或列表几何 |
| 分支行为锚点 | Merge 使用汇合菱形，Rebase 使用重写双环；提交行和详情同步解释来源、目标与识别依据 |
| 四种分析模式 | 提交演化、因果场、模块影响、风险路径各有专属指标、列表语义与操作区 |
| 石墨工作台视觉 | 用克制的层次、单一品牌蓝和模式辅助色提高可读性，不牺牲同屏信息量 |
| 高密度范围档案 | 同屏聚合模块分布、贡献者、风险信号，并填补小仓库的无效空白 |
| 跟随 Codex | Codex 切换本地项目时自动切换 Git 仓库，并提供明确开关 |
| 真实提交活跃度 | 左栏直观看到历史时间分布，点击柱形即可定位对应提交 |
| 父提交对比 | 查看真实 `git diff` 文件列表；根提交也能正确展示完整变更 |
| Codex 分析 | 通过本机 Codex CLI 只读分析提交意图、风险与建议测试 |

## 30 秒开始

1. 从 [Releases](https://github.com/Kurtor/codex-git-atlas/releases/latest) 下载 `Git-Atlas-*-Windows-x64.exe`。
2. 双击运行便携版，点击左上角仓库卡片选择本地 Git 仓库。
3. 如果希望它跟随 Codex，在左栏显式开启“跟随 Codex”。

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

## 资源占用策略

Git Atlas 是 Electron 桌面应用，但持续工作保持克制：

- Git 历史单次最多读取 500 条提交，避免无界加载。
- 拓扑使用 Canvas 2D 绘制，数据列使用 DOM，兼顾滚动性能与文字可读性。
- 分支成员最多计算 16 个本地分支，并限制为 3 个并发 Git 进程，避免仓库打开时瞬时抢占资源。
- 模块、作者、因果关系和风险聚合均使用内存中的提交数据与 React 缓存，不增加后台扫描。
- Codex 跟随只在开关开启且窗口可见时检查；隐藏或最小化后暂停。
- Codex 状态文件按修改时间缓存，无变化时不重复解析，也不触发 React 重绘。
- 跟随检查间隔为 3 秒，仓库路径变化时才重新读取 Git 历史。

v1.5.0 在 Windows x64、16 逻辑处理器和真实本地仓库下的便携版实测：5 个进程合计可见空闲工作集约 377.5 MB、私有内存约 245.4 MB、5 秒整机 CPU 采样为 0%。本次分支行为功能没有增加 UI 框架、字体包或动画库，前端产物约为 286.8 KB JavaScript（gzip 86.1 KB）与 55.2 KB CSS（gzip 12.1 KB）。不同仓库规模与系统环境下会有差异，Electron 基线内存也不应被包装成“原生级轻量”。

## 隐私与安全

- 仓库数据通过本机 `git` 命令读取，不上传到 Git Atlas 服务。
- “跟随 Codex”只读检查本机 Codex 项目映射，不读取聊天内容。
- 只有主动点击“用 Codex 分析”时，才调用已经安装并登录的本机 Codex CLI。
- Codex 分析使用临时会话与只读沙盒，并明确要求不得修改文件。

## 接下来适合补什么

优先级按“减少日常操作”排序，而不是按视觉噱头排序：

1. 工作区未提交变更视图：直接查看 staged / unstaged 文件和规模。
2. 任意两点比较：固定 A、B 两个提交后查看净变更与路径差异。
3. 提交书签与本地备注：给排查中的关键节点留下只存在本机的标记。
4. 大仓库性能模式：按需分页、关闭光晕，并显示实际渲染与 Git 读取耗时。
5. 快捷操作面板：用键盘完成打开仓库、切换分支、筛选和比较。

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
npm run build:web   # 构建渲染层
npm run build       # 生成 Windows 便携版到 release/
```

## 技术栈

Electron · React · TypeScript · Vite · Canvas 2D · 原生 Git CLI

## License

[MIT](LICENSE)
