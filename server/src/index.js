import http from 'node:http';
import { createApp } from './app.js';

const app = createApp();
const server = http.createServer(app.handler);

server.listen(app.config.port, app.config.host, () => {
  const address = `http://${app.config.host}:${app.config.port}/`;
  console.log('');
  console.log('  ✦ 看板娘博客已启动');
  console.log(`  ✦ 首页:     ${address}`);
  console.log(`  ✦ 数据目录: ${app.config.dataDir}`);
  console.log('  ✦ 停止:     Ctrl + C');
  console.log('');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${app.config.port} 已被占用，可以换一个端口：PORT=4180 npm start`);
  } else {
    console.error('启动失败:', error);
  }
  app.close();
  process.exitCode = 1;
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n收到 ${signal}，正在保存数据并关闭…`);
  server.close(() => {
    app.close();
    process.exit(0);
  });
  setTimeout(() => {
    app.close();
    process.exit(0);
  }, 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
