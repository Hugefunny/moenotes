# MoeNotes 视觉设计规范（Material Design 3）

> 状态：生效中 · 版本：2.0 · 适用范围：所有 Astro 页面、React 岛屿、主题与后续新增功能

MoeNotes 遵循 [Material Design 3](https://m3.material.io)。本文档说明令牌从哪里来、组件怎么选、交付时检查什么。强度词：**必须**（合并前满足）、**应**（默认遵守）、**禁止**（不得出现）。

## 1. 来源与优先级

1. `src/lib/md3/scheme.ts`：由种子色生成完整 MD3 配色（tonal spot），含扩展色组。
2. `src/styles/md3/colors.css`：默认种子 `#395EA8` 的浅/深配色，**由 `bun scripts/generate-md3-tokens.ts` 生成，禁止手改**（测试会校验一致）。
3. `src/styles/md3/tokens.css`：形状、字号、高度、状态层、动效令牌。
4. `src/styles/md3/tailwind.css`：令牌映射为 Tailwind 工具类。
5. `src/lib/md3/mui-theme.ts`：MUI 组件的 MD3 外观（只引用 `var(--md-sys-*)`）。
6. `src/styles/md3/primitives.css`：非 MUI 场景的 MD3 CSS 原语。
7. `/tools/design-system`：可运行的组件陈列页，也是主题验收台。

新增颜色、形状、字号或动效时，必须先改上面的令牌或公共实现，再同步陈列页和本文档。

## 2. 颜色

- 只用 MD3 颜色角色：Tailwind `bg-surface-container-low`、`text-on-surface-variant`、`border-outline-variant`、`bg-primary text-on-primary`、`bg-secondary-container text-on-secondary-container`……，或 CSS `var(--md-sys-color-*)`。半透明用 `/alpha` 或 `rgb(var(--md-sys-color-<role>-rgb) / a)`。
- **禁止**旧的 `--mn-*` 颜色/阴影/字体令牌和 `mn-paper`、`mn-stamp*`、`mn-segmented` 等旧类名（`bun run lint:arch` 会拦截）。
- 角色用法：页面底色 `surface`；分区面板 `surface-container-low`；浮层 `surface-container`（菜单）/`surface-container-high`（对话框）；正文 `on-surface`，次要文字 `on-surface-variant`；分隔线 `outline-variant`，输入框轮廓 `outline`；主要行动 `primary`；选中态 `secondary-container`；错误 `error`。
- 扩展色组（已向种子色调和）：`success`、`warning`、`category1..5`（分类标签、图表），每组都有 `on-*`、`*-container`、`on-*-container`。
- 设置里选择乐队颜色时，整套配色由该颜色生成，并在首帧前写入 `<html>`；组件**禁止**按主题写死颜色。
- 内容色例外：游戏美术、稀有度框、属性色、乐队 Logo、谱面难度色、设置中的缓存分类色（`--mn-cache-*`），以及浏览器提示里给旧引擎的十六进制回退色。

## 3. 字体与排版

- 使用 MD3 字号体系：`text-display-*`、`text-headline-*`、`text-title-*`、`text-label-*`、`text-body-*`（每个工具类同时设置字号、行高、字距和字重）。
- 字重只有 400 / 500；Tailwind 的 `font-bold` 等已映射为 500。**禁止**强制大写和加宽字距充当强调；中文、日文、韩文不得 uppercase。
- 字族：`--md-ref-typeface-brand`（标题）、`--md-ref-typeface-plain`（正文）、`--md-ref-typeface-mono`（代码/数据）。

## 4. 形状、高度、状态

- 形状：`rounded-shape-xs|sm|md|lg|xl|full`（4/8/12/16/28/全圆）。卡片 md，对话框 xl，菜单 xs，按钮与纸片按 MD3 规范。
- 高度：优先用色调（surface-container 各级）区分层级；阴影只在 FAB、悬浮按钮、菜单、对话框等需要时用 `shadow-elevation-1..5`。
- 交互状态用状态层：MUI 组件自带；普通元素加 `md3-state`（hover 8%、focus/pressed 10%）。**禁止**用位移、放大、发光表达交互。
- 焦点：全局 3px `secondary` 轮廓、偏移 2px，不得移除。

## 5. 组件选型

- **交互控件与浮层用 MUI**（`@mui/material/<Component>` 路径导入，禁止桶导入和 `@mui/icons-material`）：Button（filled/tonal/elevated/outlined/text）、IconButton（`data-variant="filled|tonal|outlined"`，切换用 `aria-pressed`）、Fab、Chip（assist/filter/input/tonal）、Dialog、Drawer、Menu、TextField/Select/Autocomplete、Switch、Checkbox、Radio、Slider、ToggleButtonGroup（分段按钮）、Tabs、Snackbar、Tooltip、Progress、Badge、Table。每个 Astro 岛屿的根组件必须用 `withMd3()` 包裹。
- **密集列表、筛选面板和静态 Astro 标记用 CSS 原语**（同一套令牌，不为每项实例化 MUI）：`md3-surface`、`md3-card-filled|elevated|outlined`、`md3-list-card`、`md3-filter-chip`、`md3-segmented`/`md3-segment`、`md3-tabs`/`md3-tab`、`md3-text-field`/`md3-search-field`、`md3-switch`、`md3-range`、`md3-placeholder`、`md3-transparency-grid`、`md3-page-heading`、`md3-section-heading`。
- 共享组件优先：`shared/Modal`（MUI Dialog，含返回键与层级栈）、`shared/Popover`（MUI 菜单面）、`BaseFilters`/`FilterButton`/`SortControl`、`LevelSwitch`、`DataTable`、`SiriusLoader`（MD3 环形进度，CSS 实现）。
- 外壳：顶栏（`TopAppBar`）、导航抽屉（`Sidebar`，md 起常驻，以下为弹出式）、设置侧边面板、命令面板、筛选侧边面板、回到顶部 FAB、音频播放条、snackbar 提示。

## 6. 图标

使用站内自绘线性 SVG（`RouteGlyph`、`shared/icons.tsx`），24px 网格、2px 描边、圆角端点，`currentColor` 着色。导航和图标按钮内 24px，按钮与纸片内 18px。纯装饰 `aria-hidden`，无文字按钮必须有本地化 `aria-label`。

## 7. 动效

使用 MUI 过渡（主题里配置了 MD3 缓动与时长）和 `--md-sys-motion-*` 令牌。必须尊重 `prefers-reduced-motion`（MUI 设为 system，ripple 关闭，全局缩短 CSS 动画）。禁止用动画改变信息顺序或阻塞操作。

## 8. 响应式、国际化、无障碍

- 从 320–375px 起设计；断点沿用 Tailwind（sm/md/lg/xl/3xl/4xl/5xl）。
- 文案必须进入 `src/i18n/messages/`，5 个核心语言同步；禁止硬编码可见文本或 `aria-label`。
- 语义化元素、键盘可达、对比度满足 WCAG AA（配色生成器保证文字与容器对比 ≥ 4.5，测试覆盖乐队色与极端色）。

## 9. 交付检查清单

- [ ] 只用 MD3 角色、形状、字号和原语；`bun run lint` 通过。
- [ ] 浅色、深色和至少一个乐队种子色下观感与对比正常。
- [ ] 375 / 768 / 1024 / 1440px 无溢出遮挡；中英日文案布局稳定。
- [ ] 适用的 hover、focus、pressed、selected、disabled、loading、empty、error 状态完整。
- [ ] 新的通用模式已加入 `/tools/design-system`。
- [ ] `bun run lint`、`bun test`、`bun run check`、`bun run build` 通过。
