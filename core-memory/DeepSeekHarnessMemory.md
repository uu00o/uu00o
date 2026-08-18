# DeepSeek Harness 核心记忆库

> 本文件是 DSH 磨砂玻璃项目的**核心记忆**：沉淀关键成果、架构决策、踩坑记录与可复用思考模式，供后续查找与调用。
> 最后更新：构建流程验证通过后

---

## 1. 项目概览

**DSH Frosted Glass**：DeepSeek Harness 的一键启动器 + 透明磨砂玻璃桌面壳。
- 无边框透明 Electron 窗口加载 DSH Web GUI（默认 `http://127.0.0.1:3080`）
- 自包含分发：内置 node.exe + 完整 `@deepseek-ai/dsh`（含全部依赖），开箱即用
- 可分享：别人下载分支 → 双击 `build.bat` → 得到可分发 exe

**关键路径**（本机）：
- 工作目录：`D:\project1\test\TestMyBrian\frosted-electron`（开发+运行）
- 源码仓库：`D:\project1\test\TestMyBrian\.upload-repo`（GitHub `uu00o/uu00o`）
- 隔离 worktree：`D:\project1\test\TestMyBrian\.upload-repo-main-wt`（本对话框专用，固定 main）
- 运行日志：`%LOCALAPPDATA%\DSHFrostedGlass\`（dsh-service.log / frost-crash.log / frost-diag.log）

---

## 2. 关键成果（功能清单）

| 功能 | 说明 | 实现位置 |
|---|---|---|
| 一键启动 | 探测 node/CLI → 检查 3080 端口 → 未运行则拉起服务 → 等待就绪 → 开窗 | main.js `ensureDshService` |
| 磨砂玻璃窗口 | 透明窗口 + 页面半透明 + 噪点/高光/模糊质感层 | FROST_CSS（insertCSS 注入） |
| Win11 Acrylic | 系统透明开启时 `backgroundMaterial:'acrylic'` 真模糊桌面；否则 transparent 回退 | `windowsFrostMaterial()` |
| 透明度滑杆 | 0%=实心（跟随深浅主题底色），100%=最透明（下限 0.15 不消失） | FROST_JS `--frost-alpha` |
| 深色模式 | 监听 `body[data-ds-dark-theme]` → `html.frost-dark`，深色玻璃 | FROST_JS `syncDark` |
| 标签页 | 对话/SSH/任务看板三态互斥切换，对话强制隐藏 | TAB_JS（html 激活属性） |
| 标签栏拖动 | 标签栏空白区按住拖动窗口 | 全局拖拽排除清单 |
| 归档会话 | 查看归档对话（只读）+ 恢复继续对话（停服务→改 workspace.json→重启） | ARCHIVE_JS + 主进程 IPC |
| 移动端控制 | 一键绑定局域网 IP，手机浏览器控制；安全确认弹框 | MOBILE_JS + 主进程（vendor schema 已放宽） |
| 皮肤兼容 | 磨砂穿透皮肤背景图（whale-song 等） | CSS 覆盖 backdrop/artLayer 等类名 |
| 自包含构建 | build.bat 双击构建，vendor 内嵌 node+dsh | build.ps1 |
| 崩溃恢复 | render-process-gone 自动重建窗口，不闪退 | 主进程 |
| 交互兼容 | 全局拖拽排除 xterm/弹窗/draggable；z-index 分层 | FROST_JS |

**控制条布局**（右下角）：`❄ 透明度滑杆` `📁 归档` `移 移动端`；右上角：`─ 最小化` `✕ 关闭`。

---

## 3. 架构与关键机制

### 注入机制（磨砂壳的灵魂）
Electron `did-finish-load` + 多次兜底重注入（2.5s/6s/12s/20s），`insertCSS` + `executeJavaScript`：
- **FROST_JS**：控制条/滑杆/拖拽/深色同步（幂等：`if frost-ctl return`）
- **TAB_JS**：标签栏三态切换
- **MOBILE_JS**：移动端按钮
- **ARCHIVE_JS**：归档面板
- 重复注入先 `removeInsertedCSS` 再插（await 拿 key，防样式累积）

### IPC 通道（preload.js → 主进程）
- `frost:minimize/close/drag-start/drag-end`（窗口控制）
- `frost:restore-archived`（归档恢复：停服务→改 workspace.json→重启→reload）
- `frost:mobile-toggle`（局域网绑定切换）
- 页面功能（归档查看）走 DSH 原生 HTTP API：`POST /api/<service>.<method>`，envelope `{type:'client-request', rpcId, method, payload}`

### 服务管理
- spawn vendor node + dsh CLI（`--profile web`），`windowsHide` 静默
- `DSH_PORT`/`DSH_URL`/`DSH_HOME` 环境变量可覆盖
- 服务重启 = 所有会话运行时状态中断（恢复归档/移动端切换时发生）

### 关键层级
z-index：普通内容(≤5) < 标签栏(34) < 控制条(35) < 窗口按钮(36) < 归档面板(38) < 插件弹窗(40)

---

## 4. 踩坑记录与思考模式（可复用）

### 4.1 透明窗口失效
- **坑**：Windows GPU 合成器把透明底色渲染成不透明
- **解**：`app.disableHardwareAcceleration()`（软件渲染保证 alpha）

### 4.2 "磨砂"≠"透明"
- **坑**：`backdrop-filter` 只模糊**页面内**内容，**无法模糊窗口后桌面**
- **解**：Win11 用系统级 `backgroundMaterial:'acrylic'` 真模糊；否则透明窗口+半透明
- **模式**：系统能力优先于 CSS 模拟

### 4.3 React 重渲染风暴 → 闪退
- **坑**：每 2 秒全页 `querySelectorAll('*')`+`getComputedStyle`+改 inline style → 重渲染风暴 → 内存暴涨 → 渲染进程 OOM 崩溃（表现为"运行一段时间闪退"）
- **解**：移除 2s 轮询；`!important` 持久 CSS 覆盖（不依赖 JS 改 inline，React 重渲染不影响）
- **模式**：**CSS 优先于 JS 修改 DOM**；避免高频全页遍历

### 4.4 透明度 0% 显示 bug
- **坑**：滑杆 0% 时 CSS 各层乘 0.85/0.9/0.55 系数 → 显示"0%"却仍半透明；100% 时全透明界面消失
- **解**：所有背景层 alpha 直接 = `--frost-alpha`（不乘系数）；下限 0.15
- **模式**：**显示值与实际严格一致**；极端值要设安全下限

### 4.5 深色模式 0% 变白
- **坑**：FROST_CSS 无条件白背景 → 深色模式实心时变白底
- **解**：`html.frost-dark` 分支用深色玻璃（`#0f1115` 系），MutationObserver 实时同步
- **模式**：**覆盖层必须跟随主题**（浅/深两套）

### 4.6 皮肤背景图遮挡磨砂
- **坑**：皮肤（whale-song/dragon-heir 等）画不透明背景图 → 桌面透不出
- **解**：CSS 覆盖常见背景层类名（backdrop/artLayer/wallpaper/hero/scene/gradient）+ `data-skin-chrome` 属性；低频清理 fixed/absolute 全屏背景层兜底
- **模式**：**插件 UI 的"表面层"与壳的"半透明层"要显式协调**

### 4.7 标签栏/面板遮挡
- **坑**：面板容器 `absolute inset:0` 盖住标签栏 → 看板"+新建任务"按钮不可见
- **解**：激活时面板 `top:46px` 避开标签栏；强制隐藏对话内容（`!important`）
- **模式**：**注入 UI 与宿主布局的层级/偏移要显式处理**

### 4.8 分支切换失败（git 层面）
- **坑**：`main` 误提交 frosted-electron（含 245MB vendor），`project/yisa` 未跟踪 → 切 main 时 untracked 覆盖冲突
- **解**：yisa 隔离 frosted-electron（rm --cached + 忽略）；main 移除 vendor 跟踪；两分支 frosted-electron 同步为最新
- **模式**：**分支间的跟踪状态不一致 = 切换必冲突**；构建产物/依赖（vendor）绝不入库

### 4.9 worktree 隔离（多对话框互不影响）
- **坑**：git HEAD 是仓库级共享，多会话切分支互相影响
- **解**：`git worktree add <path> main` 独立工作副本；注意**一个分支只能被一个 worktree 检出**
- **模式**：**多消费者共享 git 仓库 → worktree 隔离**

### 4.10 DSH 禁止局域网访问（安全边界）
- **坑**：`dsh-host-webserver` schema 只允许 `127.0.0.1`/`0.0.0.0`，0.0.0.0 被启动逻辑禁止（防远程代码执行）
- **解**：移动端功能放宽打包内 schema 允许具体局域网 IP（0.0.0.0 仍禁）；`--trusted-host <IP>` 过信任围栏
- **模式**：**改安全边界必须用户知情**（确认弹框+警告）；只放宽到最小必要范围

### 4.11 build 流程三连坑（从零构建验证）
- **坑1**：分支 package.json 缺 `@deepseek-ai/dsh` 依赖 → npm install 不装 → vendor 失败
- **坑2**：nested 安装 → >260 字符深层路径（Windows LongPathsEnabled=0）→ node 读不了；hoisted 则依赖在顶层 → **解：hoisted + 复制顶层依赖进 vendor**（排除构建工具）
- **坑3**：PowerShell 5.1 无 BOM UTF-8 中文注释乱码 → 语法错 → **解：build.ps1 存 UTF-8 with BOM**
- **模式**：**脚本必须用构建实际解释器验证**（PS 5.1 ≠ PS 7）；长路径/编码是 Windows 脚本隐形杀手

---

## 5. 仓库与分支状态

**GitHub `uu00o/uu00o`**：
| 分支 | 用途 | 最新 |
|---|---|---|
| `main` | .upload-repo 干净源码仓库 | 含 build 脚本+README |
| `project/DeepSeekHarness.exe` | **可分发分支**（根 main 内容+构建） | 完整功能+一键构建 |
| `project/yisa` | 已隔离 frosted-electron 的项目分支 | 仅 isaac-roguelike 等 |

**本地 worktree**：`.upload-repo-main-wt`（本对话框固定 main，与其他会话隔离）

**构建**：分支下载 → `frosted-electron\build.bat` 双击（需要 Node 18+）→ `dist\DSHFrostedGlass-win32-x64\`

---

## 6. 常用操作速查

```powershell
# 推送源码仓库 main（fast-forward）
git -C .upload-repo push origin main
# 推送可分发分支
git -C D:\project1\test\TestMyBrian push origin project/DeepSeekHarness.exe
# 同步 worktree（本对话框专用）
git -C .upload-repo-main-wt reset --hard main
# 验证构建脚本 PS5.1 语法
powershell -NoProfile -Command "[System.Management.Automation.Language.Parser]::ParseFile('build.ps1',[ref]\$null,[ref]\$null)|Out-Null"
```

**注意事项**：
- 改 main.js/preload.js 后需同步：dist（直接生效，asar 禁用）、.upload-repo、隔离 worktree、根仓库 frosted-electron
- vendor 的 `dsh-host-webserver` schema 放宽是**构建时自动修补**（build.ps1 3.5 步）
- 移动端开启期间同网段可无密码控制本机——用完即关
- 服务重启会中断所有活跃会话运行时状态
