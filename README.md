# DSH Frosted Glass

透明磨砂玻璃窗口壳：以无边框透明窗口加载 DSH（DeepSeek Harness）Web 界面（默认 `http://127.0.0.1:3080`），窗口透明度可调，透过窗口可以看到桌面。

## 功能特性

- **一键启动**：双击 exe 即可——自动探测 node 与 DSH CLI → 检查 3080 端口 → 若服务未运行则后台拉起 → 等待就绪 → 打开磨砂玻璃窗口
- **透明磨砂窗口**：无边框透明 Electron 窗口（`disableHardwareAcceleration()` 规避 Windows 透明窗口渲染失效问题），透明度可调
- **自包含分发**：`vendor/` 目录随程序一起分发，内含内置的 `node.exe` 与完整的 `@deepseek-ai/dsh`（含全部依赖），开箱即用，无需单独安装 node 或 dsh
- **智能退出**：窗口全部关闭时，若 DSH 服务由本实例拉起，则一并退出
- **开机自启开关**：`自开关.bat` 一键设置/取消开机自启

## 目录结构

```
frosted-electron/
├── main.js                 # Electron 主进程（窗口 + 服务拉起逻辑）
├── preload.js              # 预加载脚本
├── package.json            # 项目配置（Electron 33）
├── package-lock.json
├── start.bat               # 启动脚本
├── 自开关.bat              # 开机自启开关
├── make-icon.ps1           # 生成/替换图标脚本
├── icon.ico
├── screen.png              # 效果截图
├── vendor/
│   ├── node/node.exe       # 内置 Node.js 运行时（约 88MB）
│   └── dsh/                # @deepseek-ai/dsh CLI 及全部依赖
├── .test-dsh-home/         # 本地测试用的 DSH 主目录（测试数据）
└── .electron-cache/        # Electron 下载缓存（仅校验文件）
```

> 仓库根目录同时包含 `.gitignore`（当前策略：仅跟踪 `frosted-electron/` 与仓库说明文件）与 `README.md`。

## 运行方式

```bash
# 开发运行（需本机已安装 node 与 electron）
npm install
npm start

# 或直接双击 start.bat
```

## 打包发布

```powershell
# 使用 electron-packager 打包 64 位 Windows 应用
npx electron-packager . DSHFrostedGlass --platform=win32 --arch=x64 --icon=icon.ico
```

打包后把 `vendor/` 目录一同放进应用目录，即可实现自包含分发。

## 环境变量（可选）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DSH_PORT` | `3080` | DSH Web 服务端口 |
| `DSH_URL` | `http://127.0.0.1:3080` | 窗口加载的地址 |
| `DSH_PROFILE` | `web` | DSH 启动配置档 |
| `DSH_CLI` | 自动探测 | 指定 DSH CLI 路径 |
| `NODE_DIR` | 自动探测 | 指定 node 所在目录 |

## 说明

- `vendor/node/node.exe` 约 88.5MB，已超过 GitHub 建议的 50MB 但低于 100MB 硬上限，可正常托管（推送时会有 Large files 提示，属正常警告）。
- 本仓库只跟踪 `frosted-electron/` 应用本体，工作区中的其他大目录（UE 工程资源、PPT 素材等）不纳入版本控制。
