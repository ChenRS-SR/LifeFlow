#!/bin/bash
# LifeFlow 服务器部署脚本
# 在服务器上执行此脚本

set -e

echo "========== LifeFlow 部署开始 =========="

# 1. 安装基础依赖
echo "[1/7] 安装基础依赖..."
apt-get update
apt-get install -y python3-pip python3-venv nginx sqlite3 curl

# 2. 安装 Node.js 20
echo "[2/7] 安装 Node.js 20..."
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "20" ]; then
    npm install -g n
    n 20
    hash -r
fi
echo "Node.js 版本: $(node -v)"

# 3. 创建项目目录
echo "[3/7] 创建项目目录..."
mkdir -p /opt/LifeFlow
chown -R $USER:$USER /opt/LifeFlow

# 4. 解压后端代码
echo "[4/7] 解压后端代码..."
cd /opt/LifeFlow
if [ -f /root/backend.tar.gz ]; then
    tar -xzf /root/backend.tar.gz -C /opt/LifeFlow/
fi

# 5. 解压前端 dist
echo "[5/7] 解压前端文件..."
mkdir -p /opt/LifeFlow/frontend
if [ -f /root/frontend-dist.tar.gz ]; then
    tar -xzf /root/frontend-dist.tar.gz -C /opt/LifeFlow/frontend/
fi

# 6. 设置后端
echo "[6/7] 设置后端环境..."
cd /opt/LifeFlow/backend

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 创建 .env 文件（如果不存在）
if [ ! -f .env ]; then
    cat > .env << 'EOF'
DATABASE_URL=sqlite:///./lifeflow.db
SECRET_KEY=your-secret-key-change-this-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=10080
EOF
fi

# 初始化数据库
echo "初始化数据库..."
python3 -c "
from app.database import engine, Base
from app.models import user, task, project, note, reminder, habit, goal
Base.metadata.create_all(bind=engine)
print('数据库初始化完成')
"

# 7. 配置 Nginx
echo "[7/7] 配置 Nginx..."
cat > /etc/nginx/sites-available/lifeflow << 'EOF'
server {
    listen 80;
    server_name _;  # 接受所有域名/IP

    # 前端静态文件
    location / {
        root /opt/LifeFlow/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket 支持（如果需要）
    location /ws/ {
        proxy_pass http://127.0.0.1:8000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# 启用配置
ln -sf /etc/nginx/sites-available/lifeflow /etc/nginx/sites-enabled/lifeflow
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# 测试并重载 Nginx
nginx -t
systemctl restart nginx
systemctl enable nginx

echo ""
echo "========== 部署完成！=========="
echo ""
echo "启动后端服务命令:"
echo "  cd /opt/LifeFlow/backend && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo ""
echo "或使用 nohup 后台运行:"
echo "  cd /opt/LifeFlow/backend && source venv/bin/activate && nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &"
echo ""
echo "访问地址: http://$(curl -s ifconfig.me || echo '你的服务器IP')"
