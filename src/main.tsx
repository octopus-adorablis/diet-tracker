import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

// 全局兜底：捕获模块加载/异步未处理异常，避免静默白屏
window.addEventListener('error', (e) => {
  console.error('[global error]', e.message, e.filename, e.lineno)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', (e as PromiseRejectionEvent).reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
