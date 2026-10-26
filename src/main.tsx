import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

// 全局诊断/错误显示：把任何运行时错误与关键步骤显示在页面底部，
// 便于在手机（无控制台）上定位问题。Overlay 直接挂在 document.body，React 重渲染不会卸载它。
function ensureOverlay(): HTMLElement {
  let el = document.getElementById('global-diag-overlay')
  if (!el) {
    el = document.createElement('div')
    el.id = 'global-diag-overlay'
    el.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:99999;max-height:45vh;overflow:auto;background:rgba(40,12,12,0.95);color:#fecaca;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;padding:10px 12px;white-space:pre-wrap;word-break:break-word;border-top:2px solid #ef4444;'
    document.body.appendChild(el)
  }
  return el
}
function logDiag(msg: string) {
  console.log('[diag]', msg)
  // 仅当是真实错误（含 ❌）时才在页面上弹出深红 overlay，避免正常调试步骤打扰用户。
  // 正常步骤（如 onAuthStateChange: SIGNED_OUT）只进控制台，页面保持干净。
  if (msg.includes('❌')) {
    const el = ensureOverlay()
    const t = new Date().toLocaleTimeString()
    el.textContent = (el.textContent ? el.textContent + '\n' : '') + `[${t}] ${msg}`
  }
}
;(window as any).__diag = logDiag
;(window as any).__showErr = (msg: string) => logDiag('❌ ' + msg)

// 全局兜底：把任何未捕获的 JS 错误/未处理 Promise rejection 直接显示在页面上
window.addEventListener('error', (e) => {
  logDiag(`❌ error: ${e.message} @ ${e.filename || ''}:${e.lineno || ''}`)
})
window.addEventListener('unhandledrejection', (e) => {
  const r = (e as PromiseRejectionEvent).reason
  logDiag('❌ unhandledrejection: ' + (r && r.message ? r.message : String(r)))
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
