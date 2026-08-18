# DSH Frosted Glass

透明磨砂玻璃窗口壳：以无边框透明窗口加载 DSH（DeepSeek Harness）Web 界面（默认 `http://127.0.0.1:3080`），窗口透明度可调，透过窗口可以看到桌面。

## 功能特性

- **一键启动**：双击 exe 即可——自动探测 node 与 DSH CLI → 检查 3080 端口 → 若服务未运行则后台拉起 → 等待就绪 → 打开磨砂玻璃窗口
- **透明磨砂窗口**：无边框透明 Electron 窗口，Apple 风格毛玻璃质感（噪点 + 高光 + 模糊 + 顶部亮边），透明度滑杆可调（0% = 跟随主题的完全不透明，100% = 最透明且界面不消失）
  - Windows 11（开启系统"透明效果"）自动使用系统级 **Acrylic 材质**，真正模糊桌面
  - Windows 10 / 未开启系统透明时回退透明窗口方案，任何版本都能透出桌面
- **深色模式适配**：磨砂层实时跟随 DSH 深浅主题切换，深色模式下为深色玻璃
- **标签页切换**：窗口顶部标签栏在「对话 / SSH / 任务看板」间一键切换，三个界面互斥显示、不叠加（SSH 与任务看板由 dsh-web-ui 全家桶插件提供）
- **标签栏可拖动**：按住顶部标签栏空白处即可移动窗口（tab 按钮点击不受影响），配合页面空白处拖拽与控制条拖拽
- **归档对话**：控制条的归档按钮列出已归档会话，可只读查看对话内容；「恢复」按钮将会话移出归档并自动重启服务，回到活跃列表即可继续对话
- **皮肤兼容**：磨砂效果自动穿透 DSH 皮肤（whale-song / blue-fantasy / dragon-heir 等）的背景图——独立背景层会被覆盖为半透明，桌面始终透出
- **交互兼容**：全局窗口拖拽自动排除 SSH 终端（xterm）文本选择、面板与弹窗操作、原生拖拽元素；磨砂控制条层级让位于插件弹窗；SSH/看板面板头部自动避开顶部标签栏（新增任务等工具栏完整可见）
- **移动端控制**：控制条「移」按钮一键开启/关闭局域网访问——开启后手机（同一 Wi-Fi）浏览器打开访问地址即可控制本机；开启前有安全确认与警告，关闭即恢复仅本机访问
- **自包含分发**：构建产物内置 `node.exe` 与完整的 `@deepseek-ai/dsh`（含全部依赖），开箱即用，无需安装 node 或 dsh
- **稳定运行**：无 2 秒全页轮询（避免重渲染风暴）；渲染进程崩溃自动重建窗口，不闪退；崩溃原因记录到 `%LOCALAPPDATA%\DSHFrostedGlass\frost-crash.log`
- **智能退出**：窗口全部关闭时，若 DSH 服务由本实例拉起，则一并退出
- **开机自启开关**：`自启开关.bat` 一键设置/取消开机自启

## 目录结构

```
frosted-electron/
├── main.js                 # Electron 主进程（窗口 + 服务拉起 + 磨砂注入）
├── preload.js              # 预加载脚本（控制条/拖拽 IPC 桥）
├── package.json            # 项目配置（Electron 33）
├── build.ps1               # 一键构建脚本（生成可分发 exe 包）
├── start.bat               # 开发机直接启动脚本
├── 自启开关.bat            # 开机自启开关
├── make-icon.ps1           # 生成/替换图标脚本
├── icon.ico
└── screen.png              # 效果截图
```

## 运行方式

```bash
# 开发运行（需本机已安装 node 与 electron）
npm install
npm start
```

或使用 `start.bat`（会自动拉起 DSH 服务并打开磨砂窗口）。

## 自行构建（生成可分享的 exe）

需要：Windows + Node.js 18+（构建机）

```powershell
cd frosted-electron
powershell -ExecutionPolicy Bypass -File build.ps1
```

脚本自动完成：安装依赖（electron / electron-packager / @deepseek-ai/dsh）→ 复制本机 node.exe → 打包 Electron 壳 → 内嵌 vendor → 产出 `dist\DSHFrostedGlass-win32-x64\`。

> 构建产物约 500MB（含 Electron 运行时与 dsh 依赖）。分享时请**整个文件夹一起发**（含 `resources\app\vendor`），单独拷 exe 无法工作。国内网络较慢时可取消 `build.ps1` 中镜像配置的注释（npmmirror）。

## 技术说明

| 项 | 说明 |
|---|---|
| 窗口 | Electron 无边框；Win11+系统透明开启时 `backgroundMaterial: 'acrylic'`，否则 `transparent: true` |
| 服务启动 | `spawn(node, [cli, '--profile', 'web'])`，端口可用 `DSH_PORT` 环境变量覆盖并透传 `--port` |
| 磨砂注入 | `insertCSS` + `executeJavaScript` 幂等注入（重复注入先移除旧样式），含多次兜底重注入 |
| 透明度 | CSS 变量 `--frost-alpha`（1=实心，0.15=最透明），所有覆盖层直接引用，显示值与实际严格一致 |
| 主题 | 监听 `body[data-ds-dark-theme]` 镜像到 `html.frost-dark`，深浅主题分别使用白/深色玻璃 |
| 标签页 | 注入顶部标签栏，切换 `data-dsh-ssh-active` / `data-dsh-taskboard-active` 激活属性；`!important` 规则强制隐藏对话内容，三界面严格互斥 |
| 标签栏拖动 | 标签栏不在全局拖拽排除清单，空白区按住拖动窗口；tab 按钮仍排除（点击切换） |
| 皮肤背景层 | 覆盖 `backdrop`/`artLayer`/`wallpaper`/`hero`/`scene`/`gradient` 等常见皮肤背景类名 + `data-skin-chrome="backdrop"`，清除不透明背景图；另低频清理 fixed/absolute 全屏背景层兜底 |
| 面板偏移 | 激活 SSH/看板时容器 `top: 46px` 避开顶部标签栏（高约 44px），面板头部工具栏不被遮挡 |
| 归档 | 调用 DSH 原生 API（`workspace.list` / `session.list` / `session.history`）只读查看；恢复由主进程「停服务 → 改 `workspace.json` → 重启服务 → 刷新窗口」完成 |
| 交互兼容 | 全局拖拽排除 xterm 终端、SSH/看板面板、弹窗与 `[draggable]` 元素；控制条 z-index 35/36、归档面板 38，让位于插件弹窗（z-index 40） |
| 移动端 | 控制条「移」按钮：主进程把服务重启为 `--host <局域网IP> --trusted-host <局域网IP>` 并显示访问地址；关闭恢复 `127.0.0.1`。打包内 `dsh-host-webserver` 的 host schema 已放宽以允许局域网 IP（官方默认仅 127.0.0.1/0.0.0.0，0.0.0.0 仍被启动逻辑禁止）。安全警告：开启期间同网段可无密码控制本机，用完即关 |
| 崩溃恢复 | `render-process-gone` 自动重建窗口（1 分钟内超 3 次才放弃），日志写入 `frost-crash.log` |
