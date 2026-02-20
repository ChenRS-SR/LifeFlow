# LifeFlow - 人生管理系统

一个用于管理人生目标、任务和每日打卡的全栈应用。

> 🎯 **核心理念**: 以终为始，从人生愿景出发，层层拆解到每日行动，让你的每一天都充满意义。

## ✨ 功能特性

### 🎯 目标管理 (OKR)
- 人生愿景 - 定义你想要成为什么样的人
- 年度/季度/月度 OKR - 层层拆解目标
- 关键结果追踪 - 量化你的进步
- 领域分类 - 工作、学习、健康、财务、关系

### 📋 任务管理 (GTD)
- **任务**: 关联目标的重要事项
- **待办**: 琐碎小事，快速处理
- **优先级**: 紧急/高/中/低四档
- **今日视图**: 聚焦当天该做的事

### ✅ 习惯追踪
- 自定义习惯 - 支持图标、颜色、频率
- 每日打卡 - 一键记录
- 连续天数统计 - 激励坚持
- 近7天热力图 - 可视化打卡记录

### 📝 复盘系统
- **日复盘**: 高光时刻、挑战、学习、行动、感恩
- **心情评分**: 1-10 分记录
- **周期复盘**: 周/月/季度/年度（预留接口）

### 📊 数据仪表盘
- 今日概览 - 任务、打卡、目标数
- 本周统计 - 任务完成情况
- 打卡热力图 - 7天可视化

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────┐
│  前端 (React + TypeScript + Tailwind CSS)           │
│  - 端口: 3000                                       │
│  - 响应式布局，支持手机/平板/电脑                   │
└──────────────────────┬──────────────────────────────┘
                       │ API (RESTful)
┌──────────────────────▼──────────────────────────────┐
│  后端 (Python FastAPI)                              │
│  - 端口: 8000                                       │
│  - 自动生成 API 文档 (/docs)                        │
└──────────────────────┬──────────────────────────────┘
                       │ SQLAlchemy ORM
┌──────────────────────▼──────────────────────────────┐
│  数据库 (PostgreSQL)                                │
│  - 端口: 5432                                       │
└─────────────────────────────────────────────────────┘
```

## 📁 项目结构

```
lifeflow/
├── backend/                # Python FastAPI 后端
│   ├── app/
│   │   ├── api/           # API 路由
│   │   ├── core/          # 配置
│   │   ├── db/            # 数据库
│   │   ├── models/        # 数据模型
│   │   └── schemas/       # 数据验证
│   ├── requirements.txt   # Python 依赖
│   └── Dockerfile         # 后端容器配置
│
├── frontend/              # React 前端
│   ├── src/
│   │   ├── components/    # 组件
│   │   ├── pages/         # 页面
│   │   ├── services/      # API 服务
│   │   └── types/         # TypeScript 类型
│   ├── package.json       # Node 依赖
│   └── Dockerfile         # 前端容器配置
│
├── docker/                # 部署配置
│   ├── docker-compose.yml # Docker Compose 配置
│   └── nginx.conf         # Nginx 配置
│
├── start-dev.sh          # Linux/Mac 开发启动脚本
├── start-dev.bat         # Windows 开发启动脚本
└── deploy.sh             # 生产部署脚本
```

## 🚀 快速开始

### 开发环境

#### 1. 克隆项目

```bash
git clone https://github.com/yourusername/lifeflow.git
cd lifeflow
```

#### 2. 启动开发服务器

**Windows:**
```bash
start-dev.bat
```

**Linux/Mac:**
```bash
chmod +x start-dev.sh
./start-dev.sh
```

#### 3. 访问应用

- 前端: http://localhost:3000
- 后端 API: http://localhost:8000
- API 文档: http://localhost:8000/docs

#### 4. 手动启动（如果脚本失败）

```bash
# 后端
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 前端（新终端）
cd frontend
npm install
npm run dev
```

### 生产部署

#### 方案 1: Docker Compose（推荐）

```bash
# 1. 安装 Docker 和 Docker Compose
# 2. 进入 docker 目录
cd docker

# 3. 启动服务
docker-compose up -d

# 4. 检查状态
docker-compose ps
```

#### 方案 2: 云服务器部署

详见 [DEPLOY.md](./DEPLOY.md)

## 📱 功能截图

（截图占位，部署后可补充）

## 🔧 技术栈详解

### 前端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.2 | UI 框架 |
| TypeScript | 5.2 | 类型安全 |
| Tailwind CSS | 3.3 | 样式 |
| React Router | 6.20 | 路由 |
| Axios | 1.6 | HTTP 请求 |
| Recharts | 2.10 | 图表 |
| date-fns | 2.30 | 日期处理 |
| Lucide React | 0.29 | 图标 |

### 后端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.11 | 编程语言 |
| FastAPI | 0.104 | Web 框架 |
| SQLAlchemy | 2.0 | ORM |
| PostgreSQL | 15 | 数据库 |
| JWT | - | 认证 |
| Pydantic | 2.5 | 数据验证 |

## 📚 API 文档

启动后端后访问: http://localhost:8000/docs

主要接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /auth/register | 注册 |
| POST | /auth/login | 登录 |
| GET | /auth/me | 获取当前用户 |
| GET | /dashboard/stats | 仪表盘统计 |
| GET/POST | /goals | 目标列表/创建 |
| GET/PUT/DELETE | /goals/{id} | 目标详情/更新/删除 |
| GET/POST | /tasks | 任务列表/创建 |
| POST | /tasks/{id}/complete | 完成任务 |
| GET/POST | /habits | 习惯列表/创建 |
| POST | /habits/{id}/check | 习惯打卡 |
| GET/POST | /reviews | 复盘列表/创建 |

## 🗺️ 路线图

- [x] 基础架构搭建
- [x] 用户认证
- [x] OKR 目标管理
- [x] 任务管理
- [x] 习惯追踪
- [x] 日复盘
- [x] 仪表盘
- [ ] 周/月/年复盘
- [ ] 数据统计图表
- [ ] 提醒通知
- [ ] 数据导出
- [ ] 移动端优化
- [ ] 深色模式

## 🤝 贡献

欢迎 Issue 和 PR！

## 📄 许可证

MIT License

---

Made with ❤️ by [Your Name]
