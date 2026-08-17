const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')
const { spawn, execFileSync } = require('child_process')

// 透明窗口在 Windows 上最常见的失效原因：GPU 合成器把透明底色渲染成不透明
app.disableHardwareAcceleration()

// ============================================================================
// 一键启动：DSH (DeepSeek Harness) Web 服务
//   双击 exe -> 探测 node 与 DSH CLI -> 检查 3080 端口 -> 未运行则后台拉起
//   -> 等待就绪 -> 打开磨砂玻璃窗口。窗口全部关闭时，若服务由本实例拉起则一并退出。
// ============================================================================
const PORT = Number(process.env.DSH_PORT || 3080)
const TARGET_URL = process.env.DSH_URL || `http://127.0.0.1:${PORT}`
const DSH_PROFILE = process.env.DSH_PROFILE || 'web'
// 自包含分发：vendor/ 目录随 exe 一起分发，内含 node.exe 与完整的 @deepseek-ai/dsh（含全部依赖）
const VENDOR_DIR = path.join(__dirname, 'vendor')
const BUNDLED_NODE = path.join(VENDOR_DIR, 'node', 'node.exe')
const BUNDLED_DSH_CLI = path.join(VENDOR_DIR, 'dsh', 'lib', 'bin.js')
const DSH_CLI_CANDIDATES = [
  process.env.DSH_CLI,
  BUNDLED_DSH_CLI,
  // 本机默认安装位置（npm 全局 prefix 指向项目 .tools/global）
  'D:\\project1\\test\\TestMyBrian\\.tools\\global\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js',
  // 常见全局安装位置
  path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
]
const NODE_CANDIDATES = [
  BUNDLED_NODE,                                    // 自带 node 优先（自包含分发，开箱即用）
  process.env.NODE_DIR ? path.join(process.env.NODE_DIR, 'node.exe') : null,
  'C:\\Program Files\\nodejs\\node.exe',
  'C:\\Program Files (x86)\\nodejs\\node.exe',
]
const LOG_DIR = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'DSHFrostedGlass')
  : path.dirname(process.execPath)

let serviceProc = null          // 本实例拉起的 DSH 服务子进程
let serviceStartedByUs = false  // 服务是否由本实例拉起（关窗口时决定是否带走）

function firstExisting (list) {
  for (const p of list) if (p && fs.existsSync(p)) return p
  return null
}

// 服务进程的工作目录 = DSH 的会话工作区根。exe 目录可写则用它（行为与本机一致），
// 否则退回用户主目录，避免 exe 放在只读位置时无法创建工作区。
function pickServiceCwd () {
  const exeDir = path.dirname(process.execPath)
  try {
    const probe = path.join(exeDir, '.dsh-frosted-write-probe')
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
    return exeDir
  } catch (e) {
    const home = process.env.USERPROFILE || process.env.HOME
    if (home) {
      try { fs.mkdirSync(home, { recursive: true }); return home } catch (e2) { /* fall through */ }
    }
    return exeDir
  }
}

function findNode () {
  return firstExisting(NODE_CANDIDATES) || 'node'
}

function findDshCli () {
  return firstExisting(DSH_CLI_CANDIDATES)
}

// 检查端口是否有服务在响应（任何 HTTP 响应都算存活，与 start.bat 行为一致）
function checkPort (port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, timeout: timeoutMs }, (res) => {
      res.resume()
      resolve(true)
    })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
  })
}

// 后台拉起 DSH 服务，日志写入 %LOCALAPPDATA%\DSHFrostedGlass\dsh-service.log
function startDshService () {
  const node = findNode()
  const cli = findDshCli()
  if (!cli) {
    return { ok: false, error: '找不到 DSH CLI。\n\n自带的 vendor 目录缺失（请完整分发整个文件夹），或设置环境变量 DSH_CLI 指向 @deepseek-ai/dsh 的 lib/bin.js。' }
  }
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    const logFd = fs.openSync(path.join(LOG_DIR, 'dsh-service.log'), 'a')
    fs.writeSync(logFd, `\n===== ${new Date().toLocaleString()} launch by DSH Frosted Glass =====\n`)
    fs.writeSync(logFd, `[config] node=${node}\n[config] cli=${cli}\n[config] cwd=${pickServiceCwd()}\n`)
    fs.writeSync(logFd, `[diag] bundledNode=${BUNDLED_NODE} exists=${fs.existsSync(BUNDLED_NODE)}\n`)
    fs.writeSync(logFd, `[diag] bundledCli=${BUNDLED_DSH_CLI} exists=${fs.existsSync(BUNDLED_DSH_CLI)}\n`)
    const cliArgs = [cli, '--profile', DSH_PROFILE]
    if (process.env.DSH_PORT) cliArgs.push('--port', String(PORT))
    serviceProc = spawn(node, cliArgs, {
      cwd: pickServiceCwd(),
      windowsHide: true,                       // 不弹黑色命令行窗口
      stdio: ['ignore', logFd, logFd],
    })
    serviceProc.on('error', (err) => {
      fs.writeSync(logFd, `[spawn error] ${String(err)}\n`)
    })
    serviceProc.on('exit', (code, signal) => {
      try { fs.writeSync(logFd, `[service exit] code=${code} signal=${signal}\n`) } catch (e) { /* ignore */ }
      serviceProc = null
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: '启动 DSH 服务失败：' + String(err) }
  }
}

async function waitForService (timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await checkPort(PORT, 2000)) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

// 确保 DSH 服务可用：已运行则直接复用；否则拉起并等待
async function ensureDshService () {
  if (await checkPort(PORT)) return { ok: true, alreadyUp: true }
  const r = startDshService()
  if (!r.ok) return r
  const up = await waitForService(90 * 1000)
  if (!up) {
    return { ok: false, error: 'DSH 服务 90 秒内未就绪。\n\n详见日志：' + path.join(LOG_DIR, 'dsh-service.log') }
  }
  serviceStartedByUs = true
  return { ok: true }
}

function shutdownServiceIfOurs () {
  if (serviceStartedByUs && serviceProc && !serviceProc.killed) {
    try { serviceProc.kill() } catch (e) { /* ignore */ }
  }
}

// 崩溃/诊断日志（写入 %LOCALAPPDATA%\DSHFrostedGlass\frost-crash.log），
// 便于远程排查"运行一段时间后闪退"类问题
function logFrost (msg) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(path.join(LOG_DIR, 'frost-crash.log'), new Date().toLocaleString() + ' ' + msg + '\n')
  } catch (e) { /* ignore */ }
}

// 主进程未捕获异常/拒绝：记录而不是静默退出
process.on('uncaughtException', (err) => {
  try { logFrost('[main-uncaught] ' + String((err && err.stack) || err)) } catch (e) { /* ignore */ }
})
process.on('unhandledRejection', (reason) => {
  try { logFrost('[main-rejection] ' + String(reason)) } catch (e) { /* ignore */ }
})

// ============================================================================
// 磨砂玻璃窗口（原有实现 + 增强）
// ============================================================================

let dragTimer = null
let dragOffset = { x: 0, y: 0 }

// Windows 11 (build >= 22000) 且系统开启"透明效果"时，用系统级 Acrylic 材质实现
// 真正的磨砂玻璃（模糊窗口背后的桌面）；否则回退 transparent 透明窗口方案
// （任何 Windows 版本都能透出桌面，只是不模糊桌面）。
function windowsFrostMaterial () {
  try {
    const build = Number(os.release().split('.')[2]) || 0
    if (build < 22000) return null
    const out = execFileSync('reg', [
      'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
      '/v', 'EnableTransparency'
    ], { encoding: 'utf8', timeout: 5000, windowsHide: true })
    return /0x1\b/i.test(out) ? 'acrylic' : null
  } catch (e) {
    return null
  }
}

// 注入 CSS：让窗口真正透明、应用表面半透明（露出桌面）、叠加磨砂质感层
// 不透明度语义：--frost-alpha = 1 完全不透明（实心），0 完全透明。
// 所有背景层的 alpha 直接使用该变量（不再乘系数），保证滑杆 0% 时窗口完全实心、
// 显示值与实际严格一致；滑杆 100% 时保留 15% 可见度，避免界面完全消失。
const FROST_CSS = `
html, body {
  background: rgba(250,247,240, var(--frost-alpha, 0.35)) !important;
}
:root {
  --dsw-alias-bg-base: rgba(255,255,255,var(--frost-alpha, 0.35)) !important;
  --dsw-alias-bg-layer-1: rgba(255,255,255,var(--frost-alpha, 0.35)) !important;
  --dsw-alias-bg-layer-2: rgba(255,255,255,var(--frost-alpha, 0.35)) !important;
  --dsw-alias-bg-overlay: rgba(255,255,255,var(--frost-alpha, 0.35)) !important;
  --dsw-specific-sidebar-fill: rgba(248,249,255,var(--frost-alpha, 0.35)) !important;
}
/* DSH 默认主题的应用框架是白色不透明背景，React 重渲染会覆盖 JS 的 inline 样式，
   所以用持久 CSS 规则（!important）按透明度变量覆盖为半透明白，让磨砂透出桌面 */
[id='root'] > div,
[class*="_frame"],
[class*="sidebarCol"],
[class*="centerCol"],
[class*="scrollBody"],
[class*="composerSeat"],
[class*="contentSeat"] {
  background-color: rgba(255, 255, 255, var(--frost-alpha, 0.35)) !important;
  background-image: none !important;
}
/* 磨砂质感层：Apple 风格毛玻璃 —— 半透明白底 + 细腻噪点 + 高光渐变 + 顶部亮边（位于内容之下，不遮挡文字） */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-color: rgba(246, 244, 250, var(--frost-alpha, 0.35));
  background-image:
    /* 玻璃厚度渐变：上浅下深，模拟 Apple 材质 */
    linear-gradient(180deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.08) 28%, rgba(255,255,255,0) 100%),
    /* 玻璃反光斜射高光 */
    linear-gradient(135deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0) 42%),
    /* 细颗粒噪点（Apple 材质标志性颗粒感） */
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E"),
    /* 大颗粒低透明噪点：增加层次 */
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n2'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.15' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n2)' opacity='0.035'/%3E%3C/svg%3E");
  background-repeat: repeat;
  /* 玻璃材质：大模糊 + 饱和度增强 + 轻微提亮（模糊页面内内容，形成磨砂质感） */
  -webkit-backdrop-filter: blur(calc(var(--frost-blur, 16px))) saturate(185%) brightness(1.08);
  backdrop-filter: blur(calc(var(--frost-blur, 16px))) saturate(185%) brightness(1.08);
  /* 玻璃顶部亮边 + 内阴影，营造立体玻璃感 */
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.55),
    inset 0 0 80px rgba(255,255,255,0.16);
}
/* 底部边缘微光 */
body::after {
  content: '';
  position: fixed;
  left: 0; right: 0; bottom: 0;
  height: 1px;
  z-index: -1;
  pointer-events: none;
  background: rgba(255,255,255,0.4);
}
/* ---- 深色主题（DSH 深色模式）：深色玻璃，避免完全不透明(0%)时背景变白 ---- */
html.frost-dark,
html.frost-dark body {
  background: rgba(15, 17, 21, var(--frost-alpha, 0.35)) !important;
}
html.frost-dark {
  --dsw-alias-bg-base: rgba(15,17,21,var(--frost-alpha, 0.35)) !important;
  --dsw-alias-bg-layer-1: rgba(18,20,26,var(--frost-alpha, 0.35)) !important;
  --dsw-alias-bg-layer-2: rgba(21,23,30,var(--frost-alpha, 0.35)) !important;
  --dsw-alias-bg-overlay: rgba(15,17,21,var(--frost-alpha, 0.35)) !important;
  --dsw-specific-sidebar-fill: rgba(15,17,21,var(--frost-alpha, 0.35)) !important;
}
html.frost-dark [id='root'] > div,
html.frost-dark [class*="_frame"],
html.frost-dark [class*="sidebarCol"],
html.frost-dark [class*="centerCol"],
html.frost-dark [class*="scrollBody"],
html.frost-dark [class*="composerSeat"],
html.frost-dark [class*="contentSeat"] {
  background-color: rgba(15, 17, 21, var(--frost-alpha, 0.35)) !important;
  background-image: none !important;
}
html.frost-dark body::before {
  background-color: rgba(18, 22, 32, var(--frost-alpha, 0.35));
}
/* 皮肤/独立背景层覆盖：皮肤（whale-song / blue-fantasy / dragon-heir / miku 等）
   常用 body 背景或独立背景层画不透明图。body 级已被上面覆盖，这里兜底覆盖
   独立背景层（fixed/absolute 全屏 div、artLayer、backdrop 等常见类名）。 */
[data-skin-chrome="backdrop"],
[class*="backdrop"], [class*="backDrop"], [class*="wallpaper"],
[class*="artLayer"], [class*="art-"], [class*="hero"], [class*="scene"],
[class*="bgLayer"], [class*="bg-layer"], [class*="backgroundLayer"],
[class*="ocean"], [class*="sky"], [class*="gradient"] {
  background-image: none !important;
  background-color: rgba(255, 255, 255, var(--frost-alpha, 0.35)) !important;
}
html.frost-dark [data-skin-chrome="backdrop"],
html.frost-dark [class*="backdrop"], html.frost-dark [class*="backDrop"],
html.frost-dark [class*="wallpaper"], html.frost-dark [class*="artLayer"],
html.frost-dark [class*="art-"], html.frost-dark [class*="hero"],
html.frost-dark [class*="scene"], html.frost-dark [class*="bgLayer"],
html.frost-dark [class*="bg-layer"], html.frost-dark [class*="backgroundLayer"],
html.frost-dark [class*="ocean"], html.frost-dark [class*="sky"],
html.frost-dark [class*="gradient"] {
  background-color: rgba(15, 17, 21, var(--frost-alpha, 0.35)) !important;
}
`

// 注入 JS：悬浮控制条（拖拽 + 透明度滑杆 + 最小化/关闭）
const FROST_JS = `
(function () {
  if (document.getElementById('frost-ctl')) return
  var root = document.documentElement
  var css = [
    '#frost-ctl {',
    '  position: fixed; right: 18px; bottom: 18px; z-index: 2147483001;',
    '  display: flex; align-items: center; gap: 8px;',
    '  padding: 7px 14px; border-radius: 999px;',
    '  background: rgba(250, 249, 253, 0.55);',
    '  -webkit-backdrop-filter: blur(28px) saturate(180%) brightness(1.08);',
    '  backdrop-filter: blur(28px) saturate(180%) brightness(1.08);',
    '  border: 1px solid rgba(255,255,255,0.65);',
    '  box-shadow:',
    '    inset 0 1px 0 rgba(255,255,255,0.7),',
    '    0 8px 28px rgba(20,30,60,0.14),',
    '    0 2px 6px rgba(20,30,60,0.08);',
    '  font: 12px/1 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;',
    '  color: #3a4466; user-select: none; cursor: default;',
    '}',
    '#frost-ctl .frost-ico { font-size: 13px; }',
    '#frost-ctl label { display: flex; align-items: center; gap: 4px; color: #4a5578; }',
    '#frost-ctl input[type=range] { width: 90px; accent-color: #6d7cff; cursor: pointer; }',
    '#frost-ctl .frost-val { min-width: 34px; text-align: right; font-variant-numeric: tabular-nums; color: #4a5578; }',
    '#frost-winctl {',
    '  position: fixed; top: 10px; right: 10px; z-index: 2147483002;',
    '  display: flex; align-items: center; gap: 6px;',
    '  padding: 4px; border-radius: 12px;',
    '  background: rgba(250, 249, 253, 0.5);',
    '  -webkit-backdrop-filter: blur(24px) saturate(170%) brightness(1.06);',
    '  backdrop-filter: blur(24px) saturate(170%) brightness(1.06);',
    '  border: 1px solid rgba(255,255,255,0.6);',
    '  box-shadow:',
    '    inset 0 1px 0 rgba(255,255,255,0.65),',
    '    0 4px 16px rgba(20,30,60,0.12);',
    '}',
    '#frost-winctl .frost-btn {',
    '  width: 30px; height: 26px; border-radius: 9px; border: 0;',
    '  background: transparent; color: #4a5578;',
    '  font-size: 13px; line-height: 1; cursor: pointer;',
    '  display: inline-flex; align-items: center; justify-content: center;',
    '  transition: background 0.15s ease;',
    '}',
    '#frost-winctl .frost-btn:hover { background: rgba(109,124,255,0.22); color: #4a54c8; }',
    '#frost-winctl .frost-btn.frost-close:hover { background: rgba(224,49,49,0.85); color: #fff; }'
  ].join('\\n')
  var style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)

  // 右下角：磨砂控制条（❄ + 透明度滑杆，按住可拖动窗口）
  var bar = document.createElement('div')
  bar.id = 'frost-ctl'
  bar.innerHTML = [
    '<span class="frost-ico">❄</span>',
    '<label>透明<input type="range" id="frost-alpha" min="0" max="100" value="65"></label>',
    '<span class="frost-val" id="frost-val">65%</span>'
  ].join('')
  document.body.appendChild(bar)

  // 右上角：窗口控制按钮（最小化 / 关闭）
  var winctl = document.createElement('div')
  winctl.id = 'frost-winctl'
  winctl.innerHTML = [
    '<button class="frost-btn" id="frost-min" title="最小化">─</button>',
    '<button class="frost-btn frost-close" id="frost-close" title="关闭">✕</button>'
  ].join('')
  document.body.appendChild(winctl)

  var alpha = document.getElementById('frost-alpha')
  var val = document.getElementById('frost-val')
  // 滑杆 = 透明度：0% 完全不透明（实心，--frost-alpha=1），100% 最透明。
  // 下限 15% 可见度（--frost-alpha=0.15），防止 100% 时界面完全消失。
  function apply () {
    var v = Number(alpha.value) / 100
    var a = Math.max(0.15, Math.min(1, 1 - v))
    root.style.setProperty('--frost-alpha', String(a))
    val.textContent = alpha.value + '%'
    if (typeof applyTranslucent === 'function') applyTranslucent()
  }
  alpha.addEventListener('input', apply)
  apply()

  // 深色主题同步：DSH 在 body 上切换 data-ds-dark-theme，这里镜像到 html.frost-dark，
  // 使磨砂覆盖层跟随主题（深色模式下用深色玻璃，0% 时不至于变白底）
  function syncDark () {
    var dark = document.body ? document.body.hasAttribute('data-ds-dark-theme') : false
    root.classList.toggle('frost-dark', dark)
  }
  syncDark()
  try {
    new MutationObserver(function () { syncDark() }).observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  } catch (e) { /* older engines */ }
  var darkTimer = setInterval(function () {
    if (!document.getElementById('frost-ctl')) { clearInterval(darkTimer); return }
    syncDark()
  }, 3000)

  // 精细透明：把每个元素的背景色 alpha 按 --frost-alpha 缩放（保留配色层次，文字不受影响）。
  // 仅在滑杆调整时执行一次（不再 2 秒轮询全页——全页 getComputedStyle + inline 改写
  // 会持续触发 React 重渲染与强制布局，长时间运行导致内存暴涨、渲染进程崩溃闪退）。
  // 同时不再写 backgroundImage（破坏 React 管理的 DOM，且会删掉 DSH 的渐变装饰）。
  function applyTranslucent () {
    var alphaVal = Number(root.style.getPropertyValue('--frost-alpha'))
    if (!(alphaVal >= 0)) alphaVal = 0.35
    var all = document.querySelectorAll('*')
    for (var i = 0; i < all.length; i++) {
      var el = all[i]
      if (el.id === 'frost-ctl' || el.id === 'frost-winctl' || el === document.body || el === document.documentElement) continue
      var bg = getComputedStyle(el).backgroundColor
      var m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
      if (m) {
        var origA = m[4] !== undefined ? parseFloat(m[4]) : 1
        var next = Math.min(1, origA * alphaVal)
        // 仅在变化超过阈值时才写 inline（避免每次都触发样式重算/重渲染）
        if (origA > 0.02 && Math.abs(next - origA) > 0.01) {
          el.style.backgroundColor = 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + next + ')'
        }
      }
    }
  }
  // 初始精细透明一次；之后仅随滑杆调整执行
  applyTranslucent()

  // 全屏背景层清理（皮肤/背景图兜底）：只处理 fixed/absolute 且覆盖大部分视口的元素
  // （独立背景层、artLayer、backdrop div 等），低频 30s 运行，不做全页 getComputedStyle
  // 风暴，避免重渲染/崩溃问题。
  function clearFullscreenBackdrops () {
    var vw = window.innerWidth
    var vh = window.innerHeight
    var all = document.querySelectorAll('body *')
    for (var i = 0; i < all.length; i++) {
      var el = all[i]
      if (el.id === 'frost-ctl' || el.id === 'frost-winctl') continue
      var cs = getComputedStyle(el)
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue
      var r = el.getBoundingClientRect()
      if (r.width < vw * 0.8 || r.height < vh * 0.8) continue
      var b = cs.backgroundImage
      if (b && b !== 'none') {
        el.style.backgroundImage = 'none'
        var dark = document.body ? document.body.hasAttribute('data-ds-dark-theme') : false
        var rgb = dark ? '15, 17, 21' : '255, 255, 255'
        var a = Number(root.style.getPropertyValue('--frost-alpha'))
        if (!(a >= 0)) a = 0.35
        el.style.backgroundColor = 'rgba(' + rgb + ',' + a + ')'
      }
    }
  }
  clearFullscreenBackdrops()
  var backdropTimer = setInterval(function () {
    if (!document.getElementById('frost-ctl')) { clearInterval(backdropTimer); return }
    clearFullscreenBackdrops()
  }, 30000)

  // 手动拖拽：按住控制条空白处移动窗口（透明窗口下系统拖拽常失效）
  var dragging = false
  bar.addEventListener('mousedown', function (e) {
    if (e.target.closest('button, input')) return
    dragging = true
    if (window.frostAPI) window.frostAPI.dragStart({
      x: e.screenX - window.screenX,
      y: e.screenY - window.screenY,
    })
    e.preventDefault()
  })
  window.addEventListener('mouseup', function () {
    if (dragging) {
      dragging = false
      if (window.frostAPI) window.frostAPI.dragEnd()
    }
  })

  // 全局拖拽：按住页面任意非交互区域拖动窗口（移动超过 5px 阈值才触发，避免单击误触）
  var gDrag = { active: false, started: false, x: 0, y: 0 }
  var IGNORE_SEL = 'button, input, textarea, select, a, label, iframe, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], [contenteditable="true"], #frost-ctl, #frost-winctl'
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return
    if (e.target.closest && e.target.closest(IGNORE_SEL)) return
    gDrag.active = true
    gDrag.started = false
    gDrag.x = e.screenX
    gDrag.y = e.screenY
  }, true)
  document.addEventListener('mousemove', function (e) {
    if (!gDrag.active || gDrag.started) return
    var dx = e.screenX - gDrag.x
    var dy = e.screenY - gDrag.y
    if (dx * dx + dy * dy > 25) {
      gDrag.started = true
      if (window.frostAPI) window.frostAPI.dragStart({
        x: e.screenX - window.screenX,
        y: e.screenY - window.screenY,
      })
    }
  }, true)
  document.addEventListener('mouseup', function () {
    if (gDrag.active) {
      gDrag.active = false
      if (gDrag.started && window.frostAPI) window.frostAPI.dragEnd()
      gDrag.started = false
    }
  }, true)

  document.getElementById('frost-min').addEventListener('click', function (e) {
    e.stopPropagation()
    if (window.frostAPI) window.frostAPI.minimize()
  })
  document.getElementById('frost-close').addEventListener('click', function (e) {
    e.stopPropagation()
    if (window.frostAPI) window.frostAPI.close()
  })
})()
`

function createWindow () {
  const material = windowsFrostMaterial()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: material === null,          // Acrylic 材质窗口不透明（材质由系统绘制），否则透明窗口
    backgroundColor: '#00000000',
    hasShadow: true,                          // 保留 DWM 阴影，增强玻璃立体感
    resizable: true,
    ...(material !== null ? { backgroundMaterial: material } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadURL(TARGET_URL)

  win.webContents.on('did-fail-load', (e, code, desc) => {
    console.log('[frost-fail-load] ' + code + ' ' + desc)
  })

  // 磨砂注入（幂等）。did-finish-load + 多次定时兜底：
  // 冷启动/慢机器上 SPA 可能数秒后才渲染完成，多次注入保证任何时机都生效。
  // insertCSS 返回 Promise<key>，必须 await 拿到真正的 key 才能 removeInsertedCSS，
  // 否则旧样式表无法移除、会无限累积。
  let frostCssKey = null
  async function injectFrost () {
    if (win.isDestroyed()) return
    try {
      if (frostCssKey !== null) {
        try { await win.webContents.removeInsertedCSS(frostCssKey) } catch (e) { /* ignore */ }
        frostCssKey = null
      }
      frostCssKey = await win.webContents.insertCSS(FROST_CSS)
      win.webContents.executeJavaScript(FROST_JS)
    } catch (err) {
      console.log('[frost-inject-err] ' + String(err))
    }
  }

  // 渲染进程崩溃自动恢复：记录原因，销毁坏窗口并重建，避免直接闪退退出。
  // 1 分钟内崩溃超过 3 次则停止（防无限重启）。
  let crashCount = 0
  let crashWindowStart = Date.now()
  win.webContents.on('render-process-gone', (e, details) => {
    const now = Date.now()
    if (now - crashWindowStart > 60000) { crashCount = 0; crashWindowStart = now }
    crashCount++
    const msg = '[render-gone] reason=' + (details && details.reason) + ' exitCode=' + (details && details.exitCode) + ' count=' + crashCount
    console.log(msg)
    logFrost(msg)
    if (crashCount > 3) {
      logFrost('[render-gone] too many crashes, giving up')
      shutdownServiceIfOurs()
      app.quit()
      return
    }
    recovering = true
    try { win.destroy() } catch (err) { /* ignore */ }
    setTimeout(() => {
      if (app.isReady() && BrowserWindow.getAllWindows().length === 0) createWindow()
    }, 500)
  })

  win.webContents.on('did-finish-load', () => {
    injectFrost()
    // 注入后立即诊断
    win.webContents.executeJavaScript(`(function () {
      var root = document.documentElement
      var out = {
        hasCtl: !!document.getElementById('frost-ctl'),
        htmlBg: getComputedStyle(root).backgroundColor,
        htmlBgImage: getComputedStyle(root).backgroundImage.slice(0, 60),
        frostAlpha: root.style.getPropertyValue('--frost-alpha'),
        bodyChildren: document.body ? document.body.children.length : -1,
        url: location.href,
      }
      return JSON.stringify(out)
    })()`).then((r) => console.log('[frost-dom] ' + r)).catch((e) => console.log('[frost-dom-err] ' + String(e)))
  })

  // SPA 重渲染兜底：多次重注入（幂等，不会重复创建控制条）
  ;[2500, 6000, 12000, 20000].forEach((ms) => setTimeout(injectFrost, ms))

  // 透明诊断：capturePage 检查渲染结果是否包含透明像素（alpha < 255），结果写入日志文件便于远程排查
  setTimeout(async () => {
    try {
      if (win.isDestroyed()) return
      const image = await win.webContents.capturePage()
      const size = image.getSize()
      const buf = image.toBitmap() // BGRA
      let transparentCount = 0
      const samples = []
      const total = size.width * size.height
      for (let i = 0; i < total; i += 97) {
        const a = buf[i * 4 + 3]
        if (a < 250) transparentCount++
        if (samples.length < 5) {
          samples.push('a=' + a + ' rgb=(' + buf[i * 4 + 2] + ',' + buf[i * 4 + 1] + ',' + buf[i * 4] + ')')
        }
      }
      const msg = `[frost-alpha] size=${size.width}x${size.height} sampledTransparent=${transparentCount} first=${samples.join(' | ')}`
      console.log(msg)
      try {
        fs.mkdirSync(LOG_DIR, { recursive: true })
        fs.appendFileSync(path.join(LOG_DIR, 'frost-diag.log'), new Date().toLocaleString() + ' ' + msg + '\n')
      } catch (e) { /* ignore */ }
    } catch (err) {
      console.log('[frost-alpha-error] ' + String(err))
    }
  }, 12000)

  return win
}

ipcMain.on('frost:minimize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (win) win.minimize()
})

ipcMain.on('frost:close', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (win) win.close()
})

// 手动拖拽：透明窗口下 -webkit-app-region 常失效，改为轮询光标位置移动窗口
ipcMain.on('frost:drag-start', (e, offset) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return
  dragOffset = offset || { x: 0, y: 0 }
  if (dragTimer) clearInterval(dragTimer)
  dragTimer = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(dragTimer)
      dragTimer = null
      return
    }
    const p = screen.getCursorScreenPoint()
    win.setPosition(p.x - dragOffset.x, p.y - dragOffset.y)
  }, 16)
})

ipcMain.on('frost:drag-end', () => {
  if (dragTimer) {
    clearInterval(dragTimer)
    dragTimer = null
  }
})

// ============================================================================
// 启动流程：先确保 DSH 服务就绪，再打开磨砂窗口
// ============================================================================
let recovering = false   // 渲染进程崩溃后正在自动重建窗口（期间 window-all-closed 不退出）

app.whenReady().then(async () => {
  const boot = await ensureDshService()
  if (!boot.ok) {
    dialog.showErrorBox('DSH 磨砂玻璃 - 启动失败', boot.error)
    app.quit()
    return
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // 渲染进程崩溃触发 destroy 导致的"窗口全关"：跳过退出，等待自动重建
  if (recovering) {
    recovering = false
    return
  }
  shutdownServiceIfOurs()
  app.quit()
})
