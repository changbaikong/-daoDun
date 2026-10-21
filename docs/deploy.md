# 服务器部署与运维

## 线上地址

**http://106.55.41.41/** （目前 HTTP，无域名 / 无 HTTPS）

文章保存在**服务器后端**的 SQLite 数据库里，不在前端，也不依赖本地电脑。

## 部署架构

```text
浏览器
  │  http://106.55.41.41 (80)
  ▼
nginx 1.24（Ubuntu 24.04 · 反向代理）
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
| 服务器 IP | `106.55.41.41` |
| 系统 | Ubuntu 24.04.4 LTS |
| Node.js | v22.20.0（`/usr/local/bin/node`） |
| 应用目录 | `/opt/jk-blog` |
| 数据目录 | `/var/lib/jk-blog/data`（systemd 环境变量 `BLOG_DATA_DIR`） |
| 运行用户 | `jkblog`（系统用户，无登录 shell） |
| 应用端口 | `127.0.0.1:4173`（只监听本机，不对外暴露） |
| 对外端口 | `80`（nginx 代理） |
| 服务名 | `jk-blog.service`（开机自启） |
| nginx 站点 | `/etc/nginx/sites-available/jk-blog` |
| 原默认站点备份 | `/root/nginx-default.backup` |

仓库里的 `deploy/` 目录就是服务器上对应的配置：

- `deploy/jk-blog.service`
- `deploy/jk-blog-backup.service` / `deploy/jk-blog-backup.timer`
- `deploy/nginx-jk-blog.conf`
- `deploy/deploy.ps1`（本地一键更新脚本）

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

- 目前只有 **HTTP**（80 端口），没有 HTTPS：服务器 IP 没有绑定域名，申请证书也不方便。
  以后有域名后：把域名解析到 `106.55.41.41` → 安装 certbot → 配置 443/证书，同时在云安全组放行 443。
- 云服务器安全组目前开放：`22`、`80`。应用端口 4173 只在服务器本机监听，不需要对公网开放。
- Node.js 内置 `node:sqlite` 在 v22 仍会打印一次 ExperimentalWarning，属于正常提示，不影响数据。
- 当前没有登录/写接口，线上接口都是公开只读；等以后加写作后台时，记得先补鉴权，再把写接口挂到 nginx 后面。

## 故障排查

| 现象 | 排查 |
| --- | --- |
| 打开 106.55.41.41 502 | `systemctl status jk-blog` 看应用是否在跑；`journalctl -u jk-blog -n 50` |
| 页面 404 / 旧页面 | 确认 nginx 站点已启用：`nginx -T \| grep -A2 'server_name _'`；`systemctl reload nginx` |
| 端口 4173 未监听 | 看服务日志、`ss -tlnp \| grep 4173`；检查 `BLOG_DATA_DIR` 权限 |
| 页面正常但文章是旧的 | 数据在 `/var/lib/jk-blog/data`；检查是否连到了别的数据目录 |
| 磁盘占用 | `du -sh /var/backups/jk-blog /var/lib/jk-blog`，备份会自动保留 7 份 |
