# LifeFlow v1.0 部署指南

完整的服务器部署和上线流程文档，包含版本发布、Docker 配置、云服务器部署、域名配置等。

---

## 📋 目录

1. [版本发布流程](#一版本发布流程)
2. [服务器准备](#二服务器准备)
3. [Docker 部署](#三docker-部署)
4. [域名与 HTTPS](#四域名与https可选)
5. [手机端访问](#五手机端访问)
6. [运维管理](#六运维管理)
7. [故障排查](#七故障排查)

---

## 一、版本发布流程

### 1.1 本地项目整理

#### 检查当前项目结构
```bash
# 在项目根目录执行，查看文件结构
tree -L 2 -I 'node_modules|venv|__pycache__|.git'
```

#### 核心文件清单（保留）
```
LifeFlow/
├── README.md                    # 项目主文档
├── DEPLOY.md                    # 本部署文档
├── .gitignore                   # Git忽略配置
├── docker/                      # Docker配置
│   ├── docker-compose.yml       # 服务编排
│   └── nginx.conf               # Nginx反向代理
├── backend/                     # 后端代码
│   ├── Dockerfile               # 后端构建配置
│   ├── requirements.txt         # Python依赖
│   └── app/                     # 应用代码
└── frontend/                    # 前端代码
    ├── Dockerfile               # 前端构建配置
    ├── package.json             # Node依赖
    └── src/                     # 应用代码
```

#### 删除不必要的文件
```bash
# 1. 删除重复/过时的README文件
rm -f README-START.md START.md DEPLOY-OLD.md

# 2. 删除测试用的临时HTML文件
rm -f frontend/public/test*.html

# 3. 删除空的或废弃的配置文件
# （根据实际情况处理）
```

### 1.2 完善配置文件

#### 1.2.1 检查并完善 docker-compose.yml

文件位置：`docker/docker-compose.yml`

```yaml
version: '3.8'

services:
  # 前端服务
  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
    container_name: lifeflow-frontend
    restart: always
    ports:
      - "3000:80"
    depends_on:
      - backend
    networks:
      - lifeflow-network

  # 后端服务
  backend:
    build:
      context: ../backend
      dockerfile: Dockerfile
    container_name: lifeflow-backend
    restart: always
    ports:
      - "8000:8000"
    volumes:
      # 数据持久化：将数据库文件挂载到宿主机
      - ./data:/app/data
    environment:
      - DATABASE_URL=sqlite:///app/data/lifeflow.db
      - SECRET_KEY=your-secret-key-here-change-in-production
      - ACCESS_TOKEN_EXPIRE_MINUTES=10080
    networks:
      - lifeflow-network

  # Nginx 反向代理
  nginx:
    image: nginx:alpine
    container_name: lifeflow-nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"  # HTTPS端口
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - frontend
      - backend
    networks:
      - lifeflow-network

  # Certbot SSL证书自动续期（可选）
  certbot:
    image: certbot/certbot
    container_name: lifeflow-certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
    networks:
      - lifeflow-network

networks:
  lifeflow-network:
    driver: bridge
```

#### 1.2.2 创建后端 Dockerfile

文件位置：`backend/Dockerfile`

```dockerfile
# 使用 Python 3.11 轻量级镜像
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY app/ ./app/

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### 1.2.3 创建前端 Dockerfile

文件位置：`frontend/Dockerfile`

```dockerfile
# 构建阶段
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建生产版本
RUN npm run build

# 生产阶段 - 使用 Nginx 托管
FROM nginx:alpine

# 复制构建产物到 Nginx 目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制自定义 Nginx 配置（可选）
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
```

#### 1.2.4 检查并完善 nginx.conf

文件位置：`docker/nginx.conf`

```nginx
server {
    listen 80;
    server_name localhost;  # 后期改为你的域名

    # 前端静态文件
    location / {
        proxy_pass http://frontend:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        
        # 增加超时时间
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        proxy_pass http://frontend:80;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 1.3 编写 README.md

在项目根目录创建完整的 README.md：

```markdown
# 🎯 LifeFlow

个人生产力管理系统，整合 GTD 任务管理、OKR 目标追踪、习惯养成和项目管理的全能工具。

## ✨ 功能特性

- 📥 **收件箱**：快速收集想法，稍后整理
- ✅ **任务管理**：GTD 工作流，支持优先级和截止日期
- 📅 **日历视图**：周视图展示，逾期提醒
- 🎯 **目标管理**：OKR 体系，从人生愿景到月度目标
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

# 2. 启动服务
docker-compose up -d

# 3. 访问应用
# 本地：http://localhost
# 服务器：http://你的服务器IP
```

### 方式二：本地开发

```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# 前端
cd frontend
npm install
npm run dev
```

## 📱 默认账号

- 用户名：`admin`
- 密码：`admin123`

## 📝 目录结构

```
LifeFlow/
├── backend/          # FastAPI 后端
├── frontend/         # React 前端
├── docker/           # Docker 部署配置
└── README.md         # 项目文档
```

## 🔒 生产环境注意

1. 修改 `SECRET_KEY` 环境变量
2. 配置 HTTPS 证书
3. 定期备份数据库文件
4. 修改默认管理员密码

## 📄 许可证

MIT License
```

### 1.4 Git 提交和打标签

```bash
# 1. 检查 Git 状态
git status

# 2. 添加所有修改
git add .

# 3. 提交版本发布
git commit -m "release: v1.0.0 - LifeFlow 正式版

- 完善 Docker 部署配置
- 添加完整部署文档
- 优化项目结构
- 支持一键部署上线"

# 4. 推送到远程
git push origin master

# 5. 创建版本标签
git tag -a v1.0.0 -m "LifeFlow v1.0.0 正式版"

# 6. 推送标签到远程
git push origin v1.0.0
```

---

## 二、服务器准备

### 2.1 服务器选购建议

#### 最低配置要求
| 配置项 | 最低要求 | 推荐配置 |
|--------|---------|---------|
| CPU | 1核 | 2核 |
| 内存 | 2GB | 4GB |
| 带宽 | 1Mbps | 3-5Mbps |
| 磁盘 | 20GB SSD | 40GB SSD |
| 系统 | Ubuntu 20.04+ | Ubuntu 22.04 LTS |

#### 推荐云服务商
1. **阿里云**：轻量应用服务器，新用户 99元/年（2核4G）
2. **腾讯云**：轻量服务器，新用户 99元/年
3. **华为云**：云耀云服务器

#### 购买后必做
1. 重置服务器密码（保存好！）
2. 记录公网 IP 地址
3. 开放安全组端口：80、443、22

### 2.2 连接服务器

#### Windows 用户
使用 PowerShell 或 Git Bash：
```bash
ssh root@你的服务器IP
# 输入密码登录
```

或使用 **Termius**、**Xshell** 等工具。

#### Mac/Linux 用户
```bash
ssh root@你的服务器IP
```

---

## 三、Docker 部署

### 3.1 安装 Docker 环境

登录服务器后执行：

```bash
# 1. 更新系统
apt update && apt upgrade -y

# 2. 安装 Docker（官方脚本）
curl -fsSL https://get.docker.com | sh

# 3. 启动 Docker 服务
systemctl start docker
systemctl enable docker

# 4. 安装 Docker Compose
apt install docker-compose -y

# 5. 验证安装
docker --version
docker-compose --version
```

### 3.2 上传项目代码

#### 方式一：Git 克隆（推荐）
```bash
# 在服务器上执行
cd /opt
git clone https://github.com/ChenRS-SR/LifeFlow.git
cd LifeFlow
```

#### 方式二：本地上传
使用 WinSCP、FileZilla 或 scp 命令上传代码压缩包：
```bash
# 本地打包（在 PowerShell 中）
Compress-Archive -Path "lifeflow/*" -DestinationPath "lifeflow.zip"

# 上传到服务器
scp lifeflow.zip root@服务器IP:/opt/

# 服务器上解压
ssh root@服务器IP "cd /opt && unzip lifeflow.zip"
```

### 3.3 配置环境变量

```bash
cd /opt/LifeFlow/docker

# 创建环境变量文件
cat > .env << EOF
# 后端配置
SECRET_KEY=$(openssl rand -hex 32)
DATABASE_URL=sqlite:///app/data/lifeflow.db

# 前端配置（如果有）
VITE_API_URL=/api
EOF
```

### 3.4 启动服务

```bash
cd /opt/LifeFlow/docker

# 1. 创建数据目录
mkdir -p data certbot/conf certbot/www

# 2. 构建并启动
# 先手动拉取基础镜像
docker pull python:3.11-slim
docker pull node:18-alpine
docker pull nginx:alpine

# 然后再构建
docker-compose up -d --build

# 3. 查看状态
docker-compose ps

# 4. 查看日志
docker-compose logs -f
```

### 3.5 验证部署

```bash
# 检查容器运行状态
docker ps

# 检查端口监听
netstat -tlnp | grep -E '80|8000'

# 本地测试访问
curl http://localhost
```

浏览器访问：`http://你的服务器IP`

默认账号：`admin` / `admin123`

### 3.6新的部署方式

```bash
cd /opt/LifeFlow

# 创建部署脚本
cat > deploy-simple.sh << 'EOF'
#!/bin/bash

echo "🚀 开始部署 LifeFlow..."

# 1. 安装依赖
apt update
apt install -y python3-pip python3-venv nginx nodejs npm

# 2. 部署后端
echo "📦 部署后端..."
cd /opt/LifeFlow/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt -q

# 启动后端（后台运行）
pkill -f "uvicorn" 2>/dev/null
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > /var/log/backend.log 2>&1 &
sleep 2
echo "✅ 后端已启动"

# 3. 构建前端
echo "🔨 构建前端..."
cd /opt/LifeFlow/frontend
npm install -q
npm run build 2>/dev/null
echo "✅ 前端构建完成"

# 4. 配置 Nginx
echo "⚙️ 配置 Nginx..."
cat > /etc/nginx/sites-available/lifeflow << 'NGINX'
server {
    listen 80;
    server_name _;
    
    location / {
        root /opt/LifeFlow/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINX

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/lifeflow /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx

echo ""
echo "🎉 部署完成！"
echo "访问地址: http://你的服务器IP"
echo "默认账号: admin / admin123"
EOF

chmod +x deploy-simple.sh
bash deploy-simple.sh
```

目前是已经部署了，暂时先不管，等版本更新的时候再说。

#### 3.7常见运维命令

```bash
# 查看后端状态
ps aux | grep uvicorn

# 重启后端
cd /opt/LifeFlow/backend
pkill -f uvicorn
source venv/bin/activate
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &

# 查看日志
tail -f /opt/LifeFlow/backend/backend.log
tail -f /var/log/nginx/error.log

# 重启 Nginx
systemctl restart nginx

# 备份数据库
cp /opt/LifeFlow/backend/lifeflow.db /root/lifeflow-backup-$(date +%Y%m%d).db
```





---

## 四、域名与 HTTPS（可选）

### 4.1 购买域名

推荐平台：
- 阿里云（万网）：.com 约 70元/年
- 腾讯云（DNSPod）：.cn 约 30元/年
- GoDaddy：国际域名

### 4.2 域名解析配置

在域名控制台添加记录：

| 主机记录 | 记录类型 | 记录值 | TTL |
|---------|---------|--------|-----|
| @ | A | 你的服务器IP | 10分钟 |
| www | A | 你的服务器IP | 10分钟 |

### 4.3 配置 HTTPS（Let's Encrypt 免费证书）

```bash
cd /opt/LifeFlow/docker

# 1. 停止 Nginx
docker-compose stop nginx

# 2. 申请证书（替换为你的域名）
docker run -it --rm \
  -v $(pwd)/certbot/conf:/etc/letsencrypt \
  -v $(pwd)/certbot/www:/var/www/certbot \
  -p 80:80 \
  certbot/certbot certonly --standalone \
  -d yourdomain.com -d www.yourdomain.com

# 3. 修改 nginx.conf 启用 HTTPS
cat > nginx.conf << 'EOF'
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

# 4. 重启服务
docker-compose up -d
```

### 4.4 证书自动续期

docker-compose.yml 中已配置自动续期，无需额外操作。

---

## 五、手机端访问

### 5.1 直接访问

手机浏览器输入：
- `http://你的服务器IP`（HTTP）
- `https://你的域名`（HTTPS）

### 5.2 添加到主屏幕（PWA）

#### iOS Safari
1. 用 Safari 打开网站
2. 点击底部"分享"按钮
3. 选择"添加到主屏幕"
4. 自定义名称，点击"添加"

#### Android Chrome
1. 用 Chrome 打开网站
2. 点击菜单（三个点）
3. 选择"添加到主屏幕"
4. 确认添加

### 5.3 内网穿透方案（不想买服务器时）

如果只是偶尔使用，可以用内网穿透：

```bash
# 使用 ngrok
ngrok http 3000

# 或使用花生壳、Frp 等工具
```

**缺点**：不稳定、速度慢、有安全风险

---

## 六、运维管理

### 6.1 常用命令

```bash
cd /opt/LifeFlow/docker

# 查看运行状态
docker-compose ps

# 查看日志
docker-compose logs -f
docker-compose logs -f backend  # 只看后端
docker-compose logs -f frontend # 只看前端

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 完全重建（更新代码后）
docker-compose down
docker-compose up -d --build

# 进入容器内部
docker exec -it lifeflow-backend sh
docker exec -it lifeflow-frontend sh
```

### 6.2 数据备份

```bash
# 备份数据库（SQLite）
cp /opt/LifeFlow/docker/data/lifeflow.db \
   /opt/backup/lifeflow-$(date +%Y%m%d).db

# 设置定时备份（每天凌晨3点）
crontab -e
# 添加：0 3 * * * cp /opt/LifeFlow/docker/data/lifeflow.db /opt/backup/lifeflow-$(date +\%Y\%m\%d).db
```

### 6.3 更新版本

```bash
cd /opt/LifeFlow

# 1. 拉取最新代码
git pull origin master

# 2. 重新构建并启动
cd docker
docker-compose down
docker-compose up -d --build

# 3. 检查状态
docker-compose ps
```

---

## 七、故障排查

### 7.1 无法访问

```bash
# 1. 检查防火墙
ufw status
# 开放端口：ufw allow 80/tcp && ufw allow 443/tcp

# 2. 检查安全组（云服务商控制台）
# 确保 80、443 端口对外开放

# 3. 检查容器状态
docker ps
docker-compose logs

# 4. 检查端口监听
netstat -tlnp | grep 80
```

### 7.2 容器启动失败

```bash
# 查看详细日志
docker-compose logs --tail=100

# 常见原因：
# 1. 端口被占用：netstat -tlnp | grep 80
# 2. 内存不足：free -h
# 3. 磁盘满：df -h
```

### 7.3 数据库问题

```bash
# 检查数据库文件权限
ls -la /opt/LifeFlow/docker/data/

# 修复权限
chown -R 1000:1000 /opt/LifeFlow/docker/data/
```

---

## 📞 需要帮助？

- 查看日志：`docker-compose logs -f`
- GitHub Issues：提交问题
- 邮件联系：[your-email@example.com]

---

**部署完成！** 🎉 现在你可以在任何设备上访问你的 LifeFlow 系统了。
