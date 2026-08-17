// 渲染进程崩溃恢复测试：Page.crash 模拟崩溃，验证主进程自动重建窗口
const WebSocket = require('D:/project1/test/TestMyBrian/frosted-electron/vendor/dsh/node_modules/ws')
const http = require('http')
const port = Number(process.argv[2] || 9224)

function getTargets () {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/json', timeout: 5000 }, (r) => {
      let d = ''
      r.on('data', (c) => { d += c })
      r.on('end', () => resolve(JSON.parse(d)))
    }).on('error', reject)
  })
}

function send (wsUrl, method, params) {
  return new Promise((resolve) => {
    const w = new WebSocket(wsUrl)
    w.on('open', () => w.send(JSON.stringify({ id: 1, method, params: params || {} })))
    w.on('message', (m) => {
      const p = JSON.parse(m.toString())
      if (p.id === 1) { w.close(); resolve(p) }
    })
    w.on('error', () => resolve({ error: 'ws' }))
    setTimeout(() => { try { w.close() } catch (e) {} resolve({ error: 'timeout' }) }, 10000)
  })
}

;(async () => {
  const before = await getTargets()
  const page = before.find(t => t.type === 'page')
  if (!page) { console.log('no page target'); process.exit(1) }
  console.log('before crash:', page.title, '@', page.url)
  console.log('sending Page.crash ...')
  await send(page.webSocketDebuggerUrl, 'Page.crash')
  console.log('crash sent. waiting 6s for auto-recovery ...')
  await new Promise(r => setTimeout(r, 6000))
  try {
    const after = await getTargets()
    const pages = after.filter(t => t.type === 'page')
    console.log('after crash targets:', pages.map(t => `${t.title} @ ${t.url}`))
    if (pages.length > 0) {
      console.log('RECOVERED: new page target exists')
    } else {
      console.log('NOT RECOVERED: no page target')
    }
  } catch (e) {
    console.log('CDP after crash:', e.message)
  }
  process.exit(0)
})()
