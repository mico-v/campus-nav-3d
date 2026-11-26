# 自托管部署：把 campus-nav-3d 跑在自己的服务器上

> 适用对象：不再用 GitHub Pages 当主入口、需要**能从页面上改地图**的部署。
> Pages 仍可保留，但那是纯静态只读站 —— 没有 `/api/*`，建模页只能看不能存。

## 0. 先搞清楚三种形态

| 形态 | 前端 | 写接口 | 适用 |
| --- | --- | --- | --- |
| **同源一体**（推荐） | 由 Node 服务一起托管 | 有（需 `API_TOKEN`） | 自己的服务器、单机部署 |
| **前后端分离** | 任意静态托管（Pages / CDN / nginx） | 在另一台机器上，跨域 | 前端 CDN + 后端小机器 |
| **纯静态** | Pages | 无（`/api/*` 404） | 只演示，不改图 |

下面主要讲第一种，最后给第二种的差异。

## 1. 前置条件

- **Node ≥ 22.18**（服务用 `node --experimental-strip-types` 直接跑 TS，不额外编译；22.18 起该能力默认开启、不再打警告）。
- 一个能写的目录给数据用（下文 `DATA_DIR`）。
- 出网访问用的话，**必须**有 TLS 终止（Caddy / nginx / 云厂商 LB 都行）—— 否则 `API_TOKEN` 会明文过网。

## 2. 五分钟跑起来

```bash
git clone <repo> campus-nav-3d && cd campus-nav-3d
npm ci
npm run build                      # 产出 dist/（含 index.html、editor.html）

export DATA_DIR=/var/lib/campus-nav/data
export API_TOKEN=$(openssl rand -hex 24)   # 记下来，建模页要用
export PORT=8080
mkdir -p "$DATA_DIR"

npm run start
```

启动日志会告诉你三件事，缺一个都不对：

```
[campus-server] listening on http://0.0.0.0:8080
[campus-server] data dir: /var/lib/campus-nav/data
[campus-server] seeded packs: demo-empty, usts-tianping     ← 首次启动从 packs/ 导入
[campus-server] write API: enabled (API_TOKEN set)          ← 没这行说明 token 没生效
```

自检：

```bash
curl -s localhost:8080/api/health              # {"ok":true,...,"writable":true}
curl -s localhost:8080/api/packs               # [{"id":"usts-tianping",...}]
curl -s localhost:8080/api/campus | head -c 120
curl -sI localhost:8080/editor | head -3       # 200 + text/html
```

## 3. 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址。只给反代用就填 `127.0.0.1` |
| `DATA_DIR` | `./data` | pack 落盘目录。**不要**放在 `dist/` 里，构建会覆盖 |
| `SEED_DIR` | `./packs` | 首次启动时导入的种子包来源；已存在的 pack 不覆盖 |
| `API_TOKEN` | 无 | 写接口令牌。**不配 = 写接口一律 503**，这是故意的 |
| `PUBLIC_READ` | `1` | 设 `0` 时 `GET /api/campus` 也要令牌（不想公开地图时用） |
| `CORS_ORIGIN` | 空 | 前后端分离时前端来源白名单，逗号分隔；不配则不放行跨域 |

## 4. systemd

`/etc/systemd/system/campus-nav.service`：

```ini
[Unit]
Description=campus-nav-3d self-hosted server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/campus-nav-3d
Environment=PORT=8080
Environment=HOST=127.0.0.1
Environment=DATA_DIR=/var/lib/campus-nav/data
Environment=API_TOKEN=填你自己的
ExecStart=/usr/bin/node --experimental-strip-types apps/server/src/main.ts
Restart=on-failure
RestartSec=3
# 只给数据目录写权限
ReadWritePaths=/var/lib/campus-nav/data
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /var/lib/campus-nav/data && sudo chown -R campus:campus /var/lib/campus-nav
sudo systemctl daemon-reload && sudo systemctl enable --now campus-nav
sudo systemctl status campus-nav --no-pager
journalctl -u campus-nav -f          # 看启动日志里那四行
```

**注意**：`ExecStart` 里的路径是相对 `WorkingDirectory` 的；换目录记得同步改。用绝对路径更稳：

```ini
ExecStart=/usr/bin/node --experimental-strip-types /opt/campus-nav-3d/apps/server/src/main.ts
```
（此时 `SEED_DIR` 要显式设成 `/opt/campus-nav-3d/packs`。）

## 5. TLS 与反代

### Caddy（最省事，自动签证书）

```caddyfile
map.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080
}
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name map.example.com;
    ssl_certificate     /etc/letsencrypt/live/map.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/map.example.com/privkey.pem;

    client_max_body_size 32m;          # 整份 pack 上限（服务端也是 32MB）

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 6. 数据与备份

```
$DATA_DIR/
  usts-tianping/
    pack.json      # 名称、bounds、crs、updatedAt
    campus.json    # 几何（楼板、房间 polygon、道路、POI）
```

- 写入是 **`.tmp` → `rename` 原子替换**，断电不会留下半个 JSON；但**同一 pack 并发写是单进程串行队列**，所以别开多副本（多进程写同一个 `DATA_DIR` 会互相覆盖）。
- 备份只要打包 `DATA_DIR`：

```bash
tar czf campus-$(date +%F).tgz -C /var/lib/campus-nav data
```

- 恢复：停服务 → 解包覆盖 `DATA_DIR` → 起服务。启动时 `seed()` **只补不缺**，不会拿 `packs/` 覆盖你改过的数据。
- 想回到出厂数据：删掉 `$DATA_DIR/<pack-id>/` 再重启，会从 `packs/` 重新导入。

## 7. 建模页怎么用

1. 浏览器打开 `https://map.example.com/editor`。
2. 右侧「室内平面」面板：左侧树选楼 → 选层 → 选房间。
3. 占位房间是**虚线琥珀色**（还没描轮廓），楼层后面显示 `已描/总数`。
4. 「新描房间」：在平面上逐点单击，至少 3 点后点「完成描点」。
5. 「拖点」：选中房间后拖动绿色手柄。
6. 底部校验条：红=错误（保存会被服务端拒），黄=提醒（如「还没描轮廓」，可以保存）。
7. 点保存 → 写 `DATA_DIR`，页面刷新后数据还在。

## 8. 安全清单（上线前逐条过）

- [ ] `API_TOKEN` 是随机长串，不是 `123456`；没配就确认写接口确实是 503。
- [ ] 全站 HTTPS。**`API_TOKEN` 走的是 `Authorization` 头，明文 HTTP 等于公开。**
- [ ] 只给反代暴露 `127.0.0.1:8080`，别把 8080 直接开到公网。
- [ ] `DATA_DIR` 不在 web 根目录下（`dist/` 里任何人都能下）。
- [ ] 不想公开地图数据就设 `PUBLIC_READ=0`，此时读接口也要令牌 —— 但注意**静态页本身仍然公开**（`/`、`/editor` 是文件，不含数据）。
- [ ] 要更强的门禁：在反代上加 Basic Auth / IP 白名单，别依赖应用层 token。

### 关于 `VITE_API_TOKEN`（前后端分离时）

- 它会被**打进前端 JS**，浏览器里 F12 就能看到。它的作用只是防止「误操作」，**不是安全边界**。
- 真正的边界在反代（Basic Auth / mTLS / IP 白名单）或内网。
- 同源部署**不需要**它，dev 也不需要（dev 用内存 store，写接口默认开放）。

## 9. 前后端分离的差异

前端（任意静态托管）构建时：

```bash
VITE_API_BASE=https://api.example.com VITE_API_TOKEN=<token> npm run build
```

后端：

```bash
CORS_ORIGIN=https://map.example.com API_TOKEN=<token> npm run start
```

要点：
- `CORS_ORIGIN` 不配 → 浏览器跨域被拦，表现为「保存失败」但 `/api/health` 用 curl 又是通的。
- 前端拿不到 JSON 时会回落静态包并显示「静态模式 · 只读」，这是设计行为，不是崩了。

## 10. 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 保存提示「写接口未启用：服务端未配置 API_TOKEN」 | 服务端没配 token | 配 `API_TOKEN` 重启 |
| 保存提示「API_TOKEN 不匹配」 | 前端 token 与服务端不一致 | 两边对齐 |
| 保存提示「室内数据不合法：房间 X 顶点不足 3 个」 | 多边形不合法，服务端拒了 | 回到平面把点补够/修正 |
| `/` 返回「先跑 npm run build」 | `dist/` 不存在 | `npm run build` |
| `/editor` 打开空白 | 构建产物缺 `editor.html` | 检查 `vite build` 是否成功、`dist/editor.html` 在不在 |
| 重启后数据回到初始 | `DATA_DIR` 换了或不可写 | 看启动日志的 `data dir`，检查目录权限 |
| 跨域报错 | 没配 `CORS_ORIGIN` | 加上前端来源 |
| 页面能开但地图空 | `/api/campus` 401/404 | curl 一下，看是 token 还是 pack id 不对 |

## 11. 已知限制

- **单进程写队列**，不支持多副本同时写同一个 `DATA_DIR`。
- 没有用户系统，只有一把共享 token。
- 房间多边形靠手描，没有「上传平面图自动识别」。
- 服务端拒绝 `error` 级室内几何（顶点不足、落在楼板外等），`warning` 级（还没描轮廓）放行 —— 否则现有 24 个空 polygon 的房间一个都存不了。
