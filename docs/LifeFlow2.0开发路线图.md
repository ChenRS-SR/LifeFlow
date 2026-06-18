# LifeFlow 2.0 开发路线图

> 适用对象：你一个人使用的个人生产力系统  
> 核心目标：**先上云、再让复盘好用、最后整体打磨**  
> 版本：2026-06-17

---

## 0. 写在前面：目标与原则

LifeFlow 2.0 不是“加很多功能”，而是让现有功能真正服务于“每天坚持用”。围绕三个主题展开：

1. **云端上线**：手机、电脑、平板随时打开就用，不再受限于本地环境。
2. **复盘重塑**：解决“想记录但坚持不下来”的问题，让复盘像打卡一样简单。
3. **整体打磨**：把 1.0 里为了快速验证而留下的技术债修掉，让后续迭代更稳。

建议采用**小步快跑**：先跑通部署，再做复盘，最后做其他优化。不要一次性改太多。

---

## 1. 当前项目状态快照

- **本地分支**：`master`
- **远程分支**：`origin/dev-2.0`（目前只比 `master` 多一个 commit，主要是 deploy/backup 相关脚本）
- **使用人数**：1 人，暂不需要考虑多租户。

### 1.1 后端现状

| 点 | 现状 | 影响 |
|---|---|---|
| 路由组织 | 所有接口都在 `backend/app/main.py`（约 49k 字符），`app/api/` 下虽已拆分好 `auth.py`、`reviews.py` 等 router，但**没有被 include | 新功能（如复盘）写了接口也调不通，代码越来越难维护 |
| 认证 | `main.py` 用 SHA256 + 返回 `token_1`；`app/api/auth.py` 用 bcrypt + JWT | 两套认证并存，前端存的 token 和后端 JWT 校验不匹配，部分页面能进、部分会 401 |
| 数据权限 | `main.py` 里大量查询硬编码 `user_id == 1` | 单用户暂时可用，但和 `api/` 模块的 `get_current_active_user` 不统一 |
| 数据库 | SQLite，路径通过 `DATABASE_URL` 环境变量控制 | 云端部署时要确保 volume 挂载正确 |
| 启动数据 | 每次启动会创建默认 admin、8 个习惯、30+ 条随机测试任务 | 云上不能每次启动都塞测试数据 |

### 1.2 前端现状

| 点 | 现状 | 影响 |
|---|---|---|
| API 地址 | `api.ts` 里写死 `baseURL: 'http://127.0.0.1:8000'` | 部署到服务器后前端调不到本地后端 |
| 认证 | 登录接口返回的 token 是 `token_1`，后续请求带 Bearer `token_1` | 和后端 JWT 校验不兼容 |
| 路由刷新 | `docker/nginx.conf` 没有 SPA fallback | 直接访问 `/reviews` 可能 404 |
| 复盘页面 | 5 个长文本框 + 心情滑块，填写负担重 | 很难每天坚持 |

### 1.3 部署现状

- `docker/docker-compose.yml` + `docker/nginx.conf` 已存在，但存在上述 nginx SPA fallback、前端 baseURL 硬编码等问题。
- `deploy.sh` 会在服务器上先 `npm run build` 再 `docker-compose up`，逻辑基本可用，但需要先把代码里的地址问题修好。

---

## 2. 阶段一：先把 2.0 推上云（Docker 部署）

这是 2.0 的**第一优先级**。只有上线了，你才会方便地每天用，也才会有真实反馈。

### 2.1 分支准备

```bash
# 1. 切到 dev-2.0 本地分支并跟踪远程
git checkout -b dev-2.0 origin/dev-2.0

# 2. 把当前 master 的最新改动合并进来（如果有）
git merge master

# 3. 推送到远程
git push -u origin dev-2.0
```

后续所有 2.0 开发都在 `dev-2.0` 分支进行，稳定后再合并回 `master`。

### 2.2 关键修复清单

#### ✅ 修复 1：统一认证系统（必须）

推荐**以 `app/api/auth.py` 的 JWT 方案为准**，把 `main.py` 里的旧认证删掉。

1. 在 `backend/app/main.py` 顶部引入并挂载 router：

```python
from app.api import auth, dashboard, goals, habits, projects, reviews, tasks

app.include_router(auth.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(habits.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(reviews.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
```

2. 删除 `main.py` 中以下重复端点：
   - `/api/auth/login`
   - `/api/auth/me`
   - `/api/dashboard/stats`
   - `/api/projects/*`
   - `/api/goals/*`
   - `/api/tasks/*`
   - `/api/habits/*`
   - `/api/projects/{...}/goals/*`

3. 调整 `app/api/dashboard.py`，让它用 `get_current_active_user` 而不是固定 `user_id == 1`。

4. 启动初始化脚本里，把默认 admin 的密码存成 bcrypt hash（调用 `app/api/auth.py` 里的 `get_password_hash`）。

5. 前端登录后，把后端返回的 JWT `access_token` 存到 `localStorage`，后续请求会自动带上。

#### ✅ 修复 2：前端 API 地址相对化（必须）

`frontend/src/services/api.ts`：

```typescript
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});
```

`frontend/.env.development`：

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

`frontend/.env.production`：

```bash
VITE_API_BASE_URL=/api
```

这样本地开发走 `localhost:8000/api`，云端打包后走同域名 `/api`，Nginx 再反代到后端。

#### ✅ 修复 3：Nginx 支持 SPA 刷新（必须）

`docker/nginx.conf` 的 `/` 位置块改为：

```nginx
location / {
    proxy_pass http://frontend:80;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

同时需要在前端 Dockerfile 或前端 Nginx 配置里加 `try_files`：

```nginx
location / {
    root /usr/share/nginx/html;
    index index.html;
    try_files $uri $uri/ /index.html;
}
```

最简单的做法：前端 `Dockerfile` 里 COPY 一份 `nginx.conf` 进去，里面包含 `try_files`。

#### ✅ 修复 4：CORS 配置

`backend/app/main.py` 的 CORS：

```python
import os

origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
if os.getenv("ENV") == "production":
    origins.append(os.getenv("FRONTEND_URL", ""))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

生产环境通过 `.env` 注入域名。

#### ✅ 修复 5：Docker Compose 细节

- 确保 `backend` 服务的环境变量 `DATABASE_URL=sqlite:///app/data/lifeflow.db` 和 volume `./data:/app/data` 匹配。
- 给 `backend` 加 healthcheck：

```yaml
healthcheck:
  test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
  interval: 30s
  timeout: 10s
  retries: 3
```

- 首次 HTTPS 证书需要手动申请，certbot 容器只负责续期。参考 DEPLOY.md 里的 standalone 申请流程。

#### ✅ 修复 6：不要每次启动都塞测试数据

在 `backend/app/main.py` 的初始化函数外加判断：

```python
if settings.DEBUG:
    create_test_data()
```

或者通过环境变量 `SEED_TEST_DATA=false` 控制。

### 2.3 部署验证流程

1. 本地用 Docker 跑通：`docker-compose up -d --build`
2. 访问 `http://localhost`，测试登录、任务、目标、习惯、复盘
3. 确保直接刷新 `/reviews` 不 404
4. 推到 `dev-2.0` 分支
5. 在服务器上拉取、填 `.env`、执行 `deploy.sh`
6. 用域名或 IP 访问，手机浏览器也打开测试

---

## 3. 阶段二：让复盘更容易坚持

复盘是 2.0 的**灵魂功能**，但现在的界面负担太重。目标：让用户每天愿意花 1-2 分钟记录。

### 3.1 你坚持不下来的原因分析

1. **门槛太高**：日复盘 5 个开放文本框，不知道写什么。
2. **没有反馈**：写完就完了，看不到积累。
3. **没有提醒**：只有主动点进“复盘”才想起来。
4. **没有预填充**：当天的任务、习惯、目标数据都要自己回忆。
5. **移动端体验差**： textarea 在手机上填写很痛苦。

### 3.2 优化方向

#### 3.2.1 降低填写门槛

- **默认“极简模式”**，日复盘只保留 3 个短问题：
  1. 今天最开心 / 最有成就感的一件事？
  2. 今天遇到的最大的困难或不足？
  3. 明天最重要的一件事？
- **心情用 5 个 emoji 选择**，代替 1-10 滑块。
- 提供“展开完整模板”按钮，需要深度复盘时再打开 ORID/KPT。
- 增加**快捷标签**：`#工作顺利` `#休息不足` `#状态在线` `#有点疲惫`，点一下就能记录情绪。

#### 3.2.2 智能预填充 + 引导

- 进入日复盘页面时，自动拉取：
  - 今天已完成的任务列表
  - 今天习惯打卡情况
  - 今日目标进度
- 把这些信息展示在表单上方，并给出提示：
  - “你今天完成了 3 个任务，最有成就感的是哪个？”
  - “今天习惯打卡率 60%，有什么阻碍吗？”
- 周/月复盘直接复用 `GET /api/reviews/period/summary` 的数据，自动生成一段草稿，用户只需要改。

#### 3.2.3 进度可视化 + 正反馈

- **连续记录天数 streak**：在复盘首页显示“你已坚持记录 X 天”。
- **日历热力图**：类似 GitHub contributions，有记录的日子高亮。
- **统计卡片**：本周复盘完成率、本月平均心情、最常出现的标签。
- **每周/月生成“成长摘要”**：自动汇总：
  - 完成任务数
  - 习惯打卡趋势
  - 心情变化
  - 3 个高光时刻

#### 3.2.4 提醒与入口

- **仪表盘增加“今日未复盘”提醒卡片**，红色高亮，点击直达。
- **侧边栏“复盘”图标加小红点**，当天没写就显示。
- 可选低优先级：浏览器通知提醒（PWA push 或简单 setTimeout）。

#### 3.2.5 移动端优先

- 复盘页面改为单列布局，底部固定保存按钮。
- textarea 改为可自动增高，默认只显示 2 行。
- 输入框上方提供“一句话示例”，降低启动阻力。

#### 3.2.6 后端配合

- 确保 `app/api/reviews.py` 被挂载，否则前端调不通。
- 新增 streak 接口：`GET /api/reviews/streak?period=daily`
- 新增标签字段：`tags`（JSON 数组），简化存储。
- 新增 `is_quick` 标记，区分极简复盘和完整复盘。

### 3.3 复盘改造的最小可用版本（MVP）

1. 挂载 review router
2. 日复盘页面改成“3 个问题 + emoji 心情 + 标签”
3. 顶部显示今日已完成任务、习惯打卡
4. 仪表盘增加“今日未复盘”提示
5. 侧边栏复盘图标红点提醒
6. 统计页显示 streak 和热力图

做到这 6 点，复盘功能就已经比 1.0 好用很多。

---

## 4. 阶段三：其他值得打磨的地方

这些不急着做，但值得列出来，避免遗漏。

### 4.1 代码结构

- **拆分 `main.py`**：把剩余接口全部迁移到 `app/api/` 的 router 里，`main.py` 只负责 app 创建、中间件、挂载 router。
- **统一 API 封装**：前端 `goalAPI` 和 `goalsAPI` 这类别名太多，合并成一个。
- **引入 React Context 或 Zustand**：管理用户状态、全局 loading，减少 props drilling。
- **错误边界 + Loading 骨架屏**：现在失败时很多页面直接白屏或无限转圈。

### 4.2 数据与运维

- **Alembic 迁移**：数据库模型后续会改，现在就要把迁移脚本用起来。
- **自动备份**：
  - 云端服务器加 cron 每天凌晨备份 SQLite
  - 前端提供“导出所有数据为 JSON”按钮
- **数据清理**：归档已完成的目标/项目，避免列表越来越长。

### 4.3 安全与生产化

- 修改默认密码，生产环境不允许 `admin/admin123`。
- `SECRET_KEY`、`DATABASE_URL` 全部走 `.env`，不要写死在代码里。
- 生产环境 `DEBUG=false`。
- 后端关闭 SQL echo。
- 删除或隐藏 `/docs` 接口（或加基本认证）。

### 4.4 体验增强

- **PWA**：加 `manifest.json` 和 service worker，手机可以“添加到主屏幕”。
- **深色模式**：Tailwind 支持，加一个切换开关即可。
- **任务快捷键**：在任务页面支持 `N` 新建、`Enter` 完成编辑等。
- **仪表盘个人化**：让用户自定义显示哪些卡片。

### 4.5 单用户专项优化

- **个人设置页**：修改密码、修改人生愿景、设置每日复盘提醒时间。
- **人生愿景入口**：现在 `users.life_vision` 字段基本没用，可以在仪表盘或目标页展示。

---

## 5. 推荐执行顺序与里程碑

| 阶段 | 目标 | 预计工作量 | 验收标准 |
|---|---|---|---|
| **M0** | 分支整理 | 30 分钟 | 本地 `dev-2.0` 分支能跑，推到远程 |
| **M1** | 云端上线 | 2-4 小时 | Docker 本地跑通，服务器可访问，登录/任务/习惯/目标/复盘都能用 |
| **M2** | 复盘 MVP | 4-8 小时 | 日复盘极简模式、预填充、仪表盘提醒、streak 统计可用 |
| **M3** | 数据备份 + 安全加固 | 2-3 小时 | 自动备份、默认密码修改、DEBUG 关闭 |
| **M4** | 整体打磨 + 2.0 发布 | 视情况 | 代码拆分、PWA、深色模式等，合并到 master 打 tag v2.0.0 |

建议先做到 **M1**，让系统真正跑在云上，你再回头用几天，收集真实痛点，再决定 M2 里哪些优先级最高。

---

## 6. 今天就可以开始的 3 件事

1. **切分支**：`git checkout -b dev-2.0 origin/dev-2.0 && git merge master`
2. **修认证 + 挂载 router**：把 `app/api/*.py` 都 include 进 `main.py`，删掉重复的旧端点。
3. **改前端 baseURL**：让 `api.ts` 支持环境变量相对地址，并给 nginx 加 SPA fallback。

做完这 3 件，本地 Docker 就应该能完整跑通，接下来就可以部署到服务器。

---

## 7. 风险与注意事项

- **拆分 `main.py` 时容易把接口改坏**：建议改一部分就启动测试一次，不要一次性全删。
- **认证切换要前后端一起改**：如果只改后端，前端会 401；只改前端，后端会 401。
- **SQLite 在云端足够你一个人用**：但要注意备份，避免容器误删导致数据丢失。
- **不要急着做复杂功能**：上线并用起来，比加功能更重要。

---

**结语**：2.0 的核心不是“更复杂”，而是“更方便”。先让它随时随地可用，再让复盘变成你愿意每天点两下就完成的小事。
