# 服务器部署与运维

## 线上地址

**<https://congyu.xyz/>**（HTTPS，Let's Encrypt 证书自动续期）

- 主域名：`https://congyu.xyz/`
- `http://congyu.xyz/`、`http://www.congyu.xyz/`、`https://www.congyu.xyz/` 都会 **301** 到主域名
- 服务器 IP `http://106.55.41.41/` 仍可直连访问（IP 没有证书，仅用于调试 / 健康检查）

> ⚠️ **备案状态（2026-10-21）**：域名 `congyu.xyz` 已绑定、证书已签发，但**尚未完成 ICP 备案**。从大陆网络访问 `https://congyu.xyz/` 目前会在 TLS 握手阶段被重置（服务器本机测试正常，证书有效期至 2027-01-19）。备案通过前请用 `http://106.55.41.41/` 访问；备案流程与验收清单见 [icp-filing.md](icp-filing.md)。

文章保存在**服务器后端**的 SQLite 数据库里，不在前端，也不依赖本地电脑。

## 部署架构

```text
浏览器
  │  https://congyu.xyz (443)
  ▼
nginx 1.24（Ubuntu 24.04 · 反向代理 + TLS 终止）
  │  proxy_pass 127.0.0.1:4173
  ▼
Node.js v22.20（systemd 服务 jk-blog，用户 jkblog）
  ├─ 应用目录: /opt/jk-blog
  └─ 数据目录: /var/lib/jk-blog/data
       ├─ master.db              # 主库：账号 + 站点配置
       └─ accounts/
          ├─ account-1.db        # 账号 1 的文章库
          └─ account-2.db        # 账号 2 的文章库
```

| 项目 | 值 |
| --- | --- |
| 域名 | `congyu.xyz`（腾讯云「域名注册」购买，DNS 托管在 DNSPod） |
| DNS 记录 | `@`、`www` 两条 **A 记录** → `106.55.41.41` |
| 服务器 | 腾讯云**轻量应用服务器 Lighthouse**，实例 `lhins-mwzrln41`（广州 ap-guangzhou） |
| 服务器 IP | `106.55.41.41` |
| 系统 | Ubuntu 24.04.4 LTS |
| Node.js | v22.20.0（`/usr/local/bin/node`） |
| 应用目录 | `/opt/jk-blog` |
| 数据目录 | `/var/lib/jk-blog/data`（systemd 环境变量 `BLOG_DATA_DIR`） |
| 运行用户 | `jkblog`（系统用户，无登录 shell） |
| 应用端口 | `127.0.0.1:4173`（只监听本机，不对外暴露） |
| 对外端口 | `80`、`443`（nginx） |
| 服务名 | `jk-blog.service`（开机自启） |
| nginx 站点 | `/etc/nginx/sites-available/jk-blog` |
| HTTPS 证书 | `/etc/letsencrypt/live/congyu.xyz/`（Let's Encrypt，certbot 自动续期） |
| 防火墙 | 腾讯云 Lighthouse 防火墙放行 TCP `22` / `80` / `443` 与 ICMP |
| 原默认站点备份 | `/root/nginx-default.backup` |
| nginx 旧配置备份 | `/root/nginx-jk-blog.conf.bak-*` |

仓库里的 `deploy/` 目录就是服务器上对应的配置：

- `deploy/jk-blog.service`
- `deploy/jk-blog-backup.service` / `deploy/jk-blog-backup.timer`
- `deploy/nginx-jk-blog.conf`
- `deploy/deploy.ps1`（本地一键更新脚本）

## 域名、DNS 与 HTTPS

- 域名在**腾讯云控制台 → 域名注册**购买（注册商 DNSPod，`tiffany/raindrop.dnspod.net` 两台 NS）。
- 解析在 **DNSPod → 域名解析**：`@` 和 `www` 各一条 A 记录指向 `106.55.41.41`，TTL 600。
- 证书用 **certbot + Let's Encrypt** 签发（HTTP-01 验证、webroot 模式）：

  ```bash
  certbot certonly --webroot -w /var/www/html \
    -d congyu.xyz -d www.congyu.xyz \
    --cert-name congyu.xyz \
    --non-interactive --agree-tos --register-unsafely-without-email
  ```

- 证书覆盖 `congyu.xyz` 和 `www.congyu.xyz` 两个名字，有效期 90 天；`certbot.timer` 每天自动检查续期，**不需要手动续**。
- 续期验证依赖 80 端口：nginx 的域名 HTTP server 块里专门保留了 `/.well-known/acme-challenge/`（root `/var/www/html`），**不要删掉这段 location**。
- 如果以后换服务器 / 迁域名，顺序是：Lighthouse 防火墙先放行 443 → DNSPod 改 A 记录 → 按 `deploy/nginx-jk-blog.conf` 部署 nginx → 重新执行上面的 certbot 命令。
- **域名备案尚未完成**：备案通过前外网 443 可能被拦截；待办事项、所需材料和通过后的验收步骤见 [icp-filing.md](icp-filing.md)。

## 日常运维命令

在本地 PowerShell 里执行（需要本机 SSH 密钥 `~/.ssh/conyu_lh`）：

```powershell
$key = "$env:USERPROFILE\.ssh\conyu_lh"
$ssh = { param($cmd) ssh -i $key -o IdentitiesOnly=yes root@106.55.41.41 $cmd }

# 服务状态 / 日志
ssh -i $key root@106.55.41.41 "systemctl status jk-blog --no-pager -n 30"
ssh -i $key root@106.55.41.41 "journalctl -u jk-blog -f"

# 重启 / 停止 / 启动
ssh -i $key root@106.55.41.41 "systemctl restart jk-blog"
ssh -i $key root@106.55.41.41 "systemctl stop jk-blog"

# nginx 改完配置后（会自动备份旧配置再测试）
ssh -i $key root@106.55.41.41 "nginx -t && systemctl reload nginx"

# 线上 HTTPS 自检（服务器本机）
ssh -i $key root@106.55.41.41 "curl -sI https://congyu.xyz/ | head -5; curl -s https://congyu.xyz/api/health"

# 证书状态 / 续期演练
ssh -i $key root@106.55.41.41 "certbot certificates"
ssh -i $key root@106.55.41.41 "certbot renew --dry-run"
ssh -i $key root@106.55.41.41 "systemctl list-timers certbot.timer --no-pager"

# 手动备份一次
ssh -i $key root@106.55.41.41 "systemctl start jk-blog-backup.service && journalctl -u jk-blog-backup -n 5 --no-pager"

# 查看备份
ssh -i $key root@106.55.41.41 "ls -lh /var/backups/jk-blog"

# 磁盘 / 内存
ssh -i $key root@106.55.41.41 "df -h / && free -h"
```

## 更新代码（推荐）

在本地项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1
```

脚本会：
1. 通过 scp 把 `server/`、`web/`、`package.json`、`README.md` 上传到 `/opt/jk-blog`；
2. 修正文件权限；
3. `systemctl restart jk-blog` 并检查健康接口。

更新后浏览器 Ctrl+F5 即可看到新版本（静态资源有缓存）。

## 文章数据与备份

- 文章只存在服务器的 SQLite 文件里：`/var/lib/jk-blog/data/`。
- 每个账号一个独立库文件（账号分库），删除账号会删除对应文件。
- 自动备份：每天 **03:30** 由 `jk-blog-backup.timer` 执行，使用 SQLite `VACUUM INTO` 做一致性快照，保留最近 **7** 份，目录 `/var/backups/jk-blog/日期时间/`。
- 备份包含主库和所有账号文章库，服务运行中执行也安全。

手动恢复单个库（示例，谨慎操作）：

```bash
systemctl stop jk-blog
cp /var/backups/jk-blog/<时间戳>/master.db /var/lib/jk-blog/data/master.db
cp /var/backups/jk-blog/<时间戳>/accounts__account-1.db /var/lib/jk-blog/data/accounts/account-1.db
chown -R jkblog:jkblog /var/lib/jk-blog/data
# 同时删除旧的 -wal / -shm，避免和备份文件不一致
rm -f /var/lib/jk-blog/data/*-wal /var/lib/jk-blog/data/*-shm /var/lib/jk-blog/data/accounts/*-wal /var/lib/jk-blog/data/accounts/*-shm
systemctl start jk-blog
```

> 备份文件名里的 `accounts__account-1.db` 是仓库脚本为了扁平化目录加的前缀；恢复时改回 `accounts/account-1.db`。

## 安全与后续

- 线上已经是 **HTTPS**（TLS 1.2 / 1.3，HSTS 一年），HTTP 自动跳转；`www` 跳转到主域名。
- Lighthouse 防火墙只放行 `22` / `80` / `443` 和 ICMP；应用端口 4173 只监听本机，不对公网开放。
- 应用自己会设置 `X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`，nginx 只额外补 HSTS，避免响应头重复。
- Node.js 内置 `node:sqlite` 在 v22 仍会打印一次 ExperimentalWarning，属于正常提示，不影响数据。
- 当前没有登录 / 写接口，线上接口都是公开只读；等以后加写作后台时，记得先补鉴权，再把写接口挂到 nginx 后面。

## 故障排查

| 现象 | 排查 |
| --- | --- |
| 打开 https://congyu.xyz 502 | `systemctl status jk-blog` 看应用是否在跑；`journalctl -u jk-blog -n 50` |
| 域名打不开 / DNS 不解析 | `dig +short congyu.xyz A` 应返回 `106.55.41.41`；检查 DNSPod 的 `@`/`www` A 记录、域名是否 serverHold（未实名审核） |
| HTTPS 连不上但 HTTP 正常 | 检查腾讯云 Lighthouse 防火墙是否放行 TCP 443（控制台 → 轻量应用服务器 → 防火墙） |
| 证书过期 / 续期失败 | `certbot certificates`、`certbot renew --dry-run`；确认 80 端口的 `/.well-known/acme-challenge/` 没被删、DNSPod A 记录没变 |
| 页面 404 / 旧页面 | 确认 nginx 站点已启用：`nginx -T \| grep -A2 'server_name'`；`systemctl reload nginx` |
| 端口 4173 未监听 | 看服务日志、`ss -tlnp \| grep 4173`；检查 `BLOG_DATA_DIR` 权限 |
| 页面正常但文章是旧的 | 数据在 `/var/lib/jk-blog/data`；检查是否连到了别的数据目录 |
| 磁盘占用 | `du -sh /var/backups/jk-blog /var/lib/jk-blog`，备份会自动保留 7 份 |
