/**
 * 无头浏览器截图工具（开发用，基于 Chrome DevTools Protocol）。
 *
 * 用法：
 *   node tools/capture.mjs <输出.png> <URL> [选项]
 * 选项：
 *   --width=1600 --height=1000   视口尺寸
 *   --scroll=<css 选择器>         截图前滚动到该元素
 *   --click=<css 选择器>          截图前点击该元素
 *   --wait=900                    等页面数据加载/动画结束的毫秒数
 *   --port=9222                   CDP 端口
 *
 * 需要先用 --remote-debugging-port=9222 启动 Edge/Chrome（见 README 或 npm run shots）。
 * 脚本会同时收集页面 JS 异常，打印出来，便于验收。
 */
import fs from 'node:fs/promises';

const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith('--'));
const options = Object.fromEntries(
  args
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split('=');
      return [key, rest.join('=') || true];
    }),
);

const [outFile, targetUrl] = positional;
if (!outFile || !targetUrl) {
  console.error('用法: node tools/capture.mjs <输出.png> <URL> [--width=1600] [--height=1000] [--scroll=#feed] [--click=.post-card]');
  process.exit(2);
}

const port = Number(options.port || 9222);
const width = Number(options.width || 1600);
const height = Number(options.height || 1000);
const waitMs = Number(options.wait || 900);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getPageTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const version = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(800) });
      if (!version.ok) throw new Error(`HTTP ${version.status}`);
      const targets = await (
        await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(800) })
      ).json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page;
    } catch {
      // 浏览器还没起来，继续等
    }
    await sleep(250);
  }
  throw new Error(`连不上 CDP 端口 ${port}，请先启动带 --remote-debugging-port=${port} 的 Edge/Chrome`);
}

const target = await getPageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const eventWaiters = new Map();
const exceptions = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    exceptions.push(message.params?.exceptionDetails?.text || '未知异常');
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
    exceptions.push(
      (message.params.args || [])
        .map((arg) => arg.value ?? arg.description ?? '')
        .join(' ')
        .slice(0, 300),
    );
  }
  const waiters = eventWaiters.get(message.method);
  if (waiters?.length) {
    eventWaiters.delete(message.method);
    for (const waiter of waiters) waiter(message.params);
  }
});

function send(method, params = {}) {
  const id = nextId;
  nextId += 1;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function waitForEvent(method, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 ${method} 超时`)), timeoutMs);
    const wrapped = (params) => {
      clearTimeout(timer);
      resolve(params);
    };
    const list = eventWaiters.get(method) || [];
    list.push(wrapped);
    eventWaiters.set(method, list);
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`页面脚本异常: ${result.exceptionDetails.text}`);
  }
  return result.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width < 600,
});

const loaded = waitForEvent('Page.loadEventFired');
await send('Page.navigate', { url: targetUrl });
await loaded;
await sleep(waitMs);

if (options.scroll) {
  await evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(options.scroll)}); if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' }); return Boolean(el); })()`,
  );
  await sleep(350);
}

if (options.click) {
  await evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(options.click)}); if (el) el.click(); return Boolean(el); })()`,
  );
  await sleep(900);
}

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile(outFile, Buffer.from(shot.data, 'base64'));

console.log(`saved ${outFile} (${width}x${height})`);
if (options.scroll) console.log(`scrolled to ${options.scroll}`);
if (options.click) console.log(`clicked ${options.click}`);

if (exceptions.length > 0) {
  console.error(`发现 ${exceptions.length} 条页面异常/报错：`);
  for (const item of exceptions.slice(0, 10)) console.error(`  - ${item}`);
  process.exitCode = 1;
}

socket.close();
