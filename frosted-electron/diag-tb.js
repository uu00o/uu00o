// 验证标题框：结构、控件挂载、页面下移、拖动
const WebSocket = require('D:/project1/test/TestMyBrian/frosted-electron/vendor/dsh/node_modules/ws')
const http = require('http')
const port = Number(process.argv[2] || 9239)
function getPage () {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/json', timeout: 4000 }, (r) => {
      let d = ''
      r.on('data', (c) => { d += c })
      r.on('end', () => resolve(JSON.parse(d).find(x => x.type === 'page')))
    }).on('error', reject)
  })
}
function send (wsUrl, method, params) {
  return new Promise((resolve) => {
    const w = new WebSocket(wsUrl)
    w.on('open', () => w.send(JSON.stringify({ id: 1, method, params: params || {} })))
    w.on('message', (m) => { const p = JSON.parse(m.toString()); if (p.id === 1) { w.close(); resolve(p.result) } })
    w.on('error', () => resolve({ error: 'ws' }))
    setTimeout(() => { try { w.close() } catch (e) {} resolve({ error: 'timeout' }) }, 10000)
  })
}
function evaluate (wsUrl, expression) { return send(wsUrl, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }) }

;(async () => {
  const page = await getPage()
  if (!page) { console.log('no page'); process.exit(1) }
  const ws = page.webSocketDebuggerUrl
  const r = await evaluate(ws, `JSON.stringify((() => {
    const out = {}
    const tb = document.getElementById('frost-titlebar')
    out.hasTitlebar = !!tb
    out.titleText = tb ? tb.querySelector('.frost-title').textContent : ''
    out.hasSlider = !!document.getElementById('frost-alpha')
    out.hasMin = !!document.getElementById('frost-min')
    out.hasClose = !!document.getElementById('frost-close')
    out.archiveInTitlebar = !!(document.getElementById('archive-btn') && tb && tb.contains(document.getElementById('archive-btn')))
    out.mobileInTitlebar = !!(document.getElementById('frost-mobile') && tb && tb.contains(document.getElementById('frost-mobile')))
    out.oldCtlGone = !document.getElementById('frost-ctl')
    out.oldWinctlGone = !document.getElementById('frost-winctl')
    out.bodyPaddingTop = getComputedStyle(document.body).paddingTop
    // 标签栏位置（应在标题框下方）
    const tabbar = document.getElementById('dsh-tabbar')
    if (tb && tabbar) {
      const tbR = tb.getBoundingClientRect()
      const tabR = tabbar.getBoundingClientRect()
      out.tabbarBelowTitlebar = tabR.top >= tbR.bottom
      out.titlebarBottom = Math.round(tbR.bottom)
    }
    // 标题框控件顺序
    if (tb) {
      out.order = Array.from(tb.children).map(c => c.id || c.className || c.tagName)
    }
    return out
  })())`)
  console.log('TITLEBAR:', r.result.value)
  process.exit(0)
})()
