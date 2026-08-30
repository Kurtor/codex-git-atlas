# Git Atlas v1.8 设计 QA

## 对比目标

- 设计真值：`C:\Users\33013\.codex\generated_images\01a042ad-1825-79d1-88ed-ec6fb116db91\exec-2fc6720e-d7e0-4ef2-bf4c-7442c62bcf88.png`
- 最终实现：`E:\GithubProject\codex-git-atlas\design\implementation-final.png`
- 并排证据：`E:\GithubProject\codex-git-atlas\design\design-qa-comparison-v1.8.png`
- 仓库抽屉：`E:\GithubProject\codex-git-atlas\design\repository-browser-final.png`
- 浏览器：Codex 内置浏览器，本地 `http://localhost:5173/`
- CSS 视口：1280 × 720
- 设备像素比：1
- 设计真值像素：1487 × 1058
- 实现截图像素：1280 × 720
- 归一化：设计真值按高度缩放到 720px，与 1280 × 720 实现图并排比较；未把浏览器外壳纳入画面。
- 状态：深色主题、因果场、选中 Merge 提交 `a7c2e18`、详情浮层开启。

## Findings

最终轮没有仍需处理的 P0、P1 或 P2。

- 字体与排版：采用 Segoe UI Variable / 微软雅黑与 Cascadia Code；核心列表为 11–12px，最弱元数据已从 8–9px 提升并增加对比度。模式名、提交标题、哈希与行为标签层级清楚。
- 间距与布局：1280 × 720 同屏显示表头、约 10 行提交和底部图例。270px 图谱列不缩窄；右侧 352px 检查器采用覆盖而非重排，可关闭。
- 颜色与语义：四模式使用蓝、紫、绿、珊瑚红；分支、Merge、Rebase、增删行使用独立语义色，不与当前模式状态复用。
- 图像与资产：唯一品牌图像使用项目现有 `git-atlas-mark.png`；所有 UI 图标来自 Phosphor；没有占位图、手绘 SVG、表情符号或假图像资产。
- 文案：中文 UI 独立成立，不包含本机仓库名作为宣传文案；风险评估明确说明由变更规模、删除比例、模块跨度与提交结构计算。
- 交互与状态：模式、提交、仓库抽屉、分支筛选、Codex 跟随、搜索、密度、详情关闭、Merge/Rebase、Git 快捷操作入口均有真实状态。
- 可访问性：按钮具备可见键盘焦点，选择态、HEAD、Merge、Rebase 与因果关系均不只依赖颜色；支持 `prefers-reduced-motion`。
- 长期一致性：`src/main.tsx` 只导入 `src/atlas-v2.css`，旧三层覆盖样式已移除，所有颜色、圆角、字号和状态规则来自单一来源。

## 聚焦区域

- 模式导航：四个模式都以大字号名称、专属图标、编号、解释语和底边色表达，状态差异明显。
- 图谱与提交行：稳定拓扑不会因选中提交而重排；Merge 为菱形，Rebase 为双环，当前选中使用白色边缘与模式色双重提示。
- 提交详情：Merge/Rebase 行为在标题和正文中显式显示，变更、模块、风险与父提交顺序符合排查路径。
- 仓库导航：抽屉保留当前分支、所有分支、标签、活跃度及本机目录入口，不长期占用图谱宽度。

## 迭代记录

### 第 1 轮

- [P0] 提交行重叠：新样式误将行设为绝对定位，只剩一行可读。
  - 修复：恢复相对文档流，保持 Canvas 绝对定位。
  - 证据：`design/implementation-v1.8-pass1.png` → `design/implementation-v1.8-pass2.png`。
- [P1] 顶部工具栏被旧拖拽层覆盖。
  - 修复：重置 titlebar 的旧 fixed/inset 规则。
  - 证据：第二轮截图显示完整工具栏。

### 第 2 轮

- [P2] 风险队列、模块说明、仓库抽屉与检查器元数据存在 8–9px 低对比文字。
  - 修复：提高关键元数据字号和颜色对比，不增加区域高度。
  - 证据：`design/implementation-v1.8-single-css.png`。
- [P2] 四层 CSS 级联会造成长期视觉漂移。
  - 修复：移除 `styles.css`、`overrides.css`、`visual-system.css`，只保留 token 化 `atlas-v2.css`。
  - 证据：最终构建仅输出一份 44.05kB CSS。

### 最终复评

- 独立审美任务评分：92 / 100。
- P0：0；P1：0；P2：0。
- 剩余意见仅为可选 P3 级微调，不阻断发布。

## 浏览器验证

- 四个模式逐一切换并截图。
- 搜索 `a7c2e18` 后只显示 1 条匹配提交，清空后恢复。
- 标准与宽松密度可切换。
- 提交点击可重新打开详情，详情和仓库抽屉均可关闭。
- 仓库抽屉可进入本机目录浏览状态；Web 演示环境正确提示“仅在桌面版中可用”。
- 浏览器控制台 error / warn：0。
- `npm run typecheck`：通过。
- `npm run test:operations`：通过。
- `npm run test:git-actions`：通过。
- `npm run build:web`：通过。

## Implementation Checklist

- [x] 1280 × 720 显示至少 8 条提交
- [x] 四模式具有不同且一致的视觉语法
- [x] 仓库、分支、标签入口显式可见
- [x] 详情浮层不改变图谱拓扑
- [x] Merge / Rebase 使用独立形状与标签
- [x] Git 快捷操作保留安全白名单与确认状态
- [x] 单一视觉规则来源
- [x] 无阻断级设计问题

final result: passed
