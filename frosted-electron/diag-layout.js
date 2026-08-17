// 诊断标签栏/列/frame 的实际位置与定位方式
const WebSocket = require('D:/project1/test/TestMyBrian/frosted-electron/vendor/dsh/node_modules/ws')
const http = require('http')
const port = Number(process.argv[2] || 9239)
http.get({ host: '127.0.0.1', port, path: '/json', timeout: 4000 }, (r) => {
  let d = ''
  r.on('data', (c) => { d += c })
  r.on('end', () => {
    const t = JSON.parse(d).find(x => x.type === 'page')
    if (!t) { console.log('no page'); process.exit(1) }
    const w = new WebSocket(t.webSocketDebuggerUrl)
    const expr = `JSON.stringify((() => {
      const g = function (sel) {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), pos: cs.position, display: cs.display }
      }
      return {
        titlebar: g('#frost-titlebar'),
        tabbar: g('#dsh-tabbar'),
        conversationCol: g('[data-pane="conversation"]'),
        frame: g('[class*="_frame"]'),
        body: { paddingTop: getComputedStyle(document.body).paddingTop, scrollY: window.scrollY, docH: document.documentElement.scrollHeight, vh: window.innerHeight }
      }
    })())`
    w.on('open', () => w.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })))
    w.on('message', (m) => {
      const p = JSON.parse(m.toString())
      if (p.id === 1) { console.log('LAYOUT:', p.result.result.value); w.close(); process.exit(0) }
    })
    w.on('error', (e) => { console.log('ws err', e.message); process.exit(1) })
  })
}).on('error', (e) => { console.log('http err', e.message); process.exit(1) })
