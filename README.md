# 🎯 LifeFlow

个人生产力管理系统，整合 GTD 任务管理、OKR 目标追踪、习惯养成和项目管理的全能工具。

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ 功能特性

- 📥 **收件箱**：快速收集想法，稍后整理
- ✅ **任务管理**：GTD 工作流，支持优先级、截止日期、番茄钟
- 📅 **日历视图**：周视图展示，逾期提醒
- 🎯 **目标管理**：OKR 体系（人生愿景/年度/季度/月度）
- 📁 **项目管理**：里程碑追踪，进度可视
- 🔥 **习惯养成**：打卡追踪，热力图展示
- 📊 **仪表盘**：数据概览，完成统计

## 🛠 技术栈

- **后端**：Python 3.11 + FastAPI + SQLAlchemy + SQLite
- **前端**：React 18 + TypeScript + Tailwind CSS + Vite
- **部署**：Docker + Docker Compose + Nginx

## 🚀 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/ChenRS-SR/LifeFlow.git
cd LifeFlow/docker

# 2. 创建数据目录
mkdir -p data certbot/conf certbot/www

# 3. 启动服务
docker-compose up -d --build

# 4. 访问应用
# 本地：http://localhost
# 服务器：http://你的服务器IP
```

详细部署文档：[DEPLOY.md](./DEPLOY.md)

### 方式二：本地开发

**后端：**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**前端：**
```bash
cd frontend
npm install
npm run dev
```

访问：http://localhost:3000

## 📱 默认账号

- 用户名：`admin`
- 密码：`admin123`

**⚠️ 生产环境请立即修改默认密码！**

## 📁 目录结构

```
LifeFlow/
├── backend/          # FastAPI 后端
│   ├── app/          # 应用代码
│   ├── Dockerfile    # 后端构建配置
│   └── requirements.txt
├── frontend/         # React 前端
│   ├── src/          # 应用代码
│   ├── Dockerfile    # 前端构建配置
│   └── package.json
├── docker/           # Docker 部署配置
│   ├── docker-compose.yml
│   └── nginx.conf
├── README.md         # 项目文档
└── DEPLOY.md         # 详细部署文档
```

## 🌐 访问方式

| 环境 | 地址 |
|------|------|
| 本地开发 | http://localhost:3000 |
| Docker 本地 | http://localhost |
| 服务器 IP | http://你的服务器IP |
| 域名 | https://yourdomain.com |

## 🔒 生产环境配置

1. **修改密钥**
   ```bash
   # 编辑 docker/.env
   SECRET_KEY=your-random-secret-key
   ```

2. **配置 HTTPS**
   
   参考 [DEPLOY.md](./DEPLOY.md) 第四章配置 SSL 证书

3. **数据备份**
   ```bash
   # 备份数据库
   cp docker/data/lifeflow.db backup/lifeflow-$(date +%Y%m%d).db
   ```

4. **修改默认密码**
   
   登录后进入个人设置修改

## 📝 更新日志

### v1.0.0 (2024-02-20)
- ✨ 首个正式版发布
- 📊 全新仪表盘设计
- 🎯 目标管理支持四级周期
- 📅 周视图支持切换周
- 🔍 项目搜索功能
- 🐳 完善 Docker 部署配置

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License © 2024 ChenRS-SR
