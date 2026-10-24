// Cloudflare Pages Function：把 /sb/* 请求反代到 Supabase。
// 目的：让前端（尤其是国内/iOS 设备）只与本站域名 diet-tracker-9ex.pages.dev 通信，
// 由 Cloudflare 边缘节点代为访问被墙的 *.supabase.co，彻底绕开客户端 DNS/网络封锁。
//
// 说明：
// - 仅转发 REST/Auth/Storage 的 fetch 请求；本项目未使用 Supabase Realtime(WebSocket)，故无需处理升级。
// - 浏览器到 pages.dev 是同源请求，不需 CORS；函数侧做服务端 fetch，无跨域限制。
// - 原样透传 apikey / Authorization 等鉴权头，Supabase 鉴权不受影响。

const SUPABASE_HOST = 'https://gxvthexqbjrfiiqxhhdr.supabase.co';

export async function onRequest(context: { request: Request }): Promise<Response> {
  const { request } = context;
  const url = new URL(request.url);

  // 去掉 /sb 前缀，得到 Supabase 的真实路径（如 /rest/v1/meals）
  const supabasePath = url.pathname.replace(/^\/sb/, '') || '/';
  const targetUrl = `${SUPABASE_HOST}${supabasePath}${url.search}`;

  const headers = new Headers(request.headers);
  // 这些头由 fetch 按目标 URL 自动设置，手动保留会冲突/误导上游
  headers.delete('host');
  headers.delete('origin');
  headers.delete('content-length'); // 流式转发时由运行时重新计算

  const init: RequestInit = {
    method: request.method,
    headers,
  };
  // GET/HEAD 不能带 body
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  const response = await fetch(targetUrl, init);
  return response;
}
