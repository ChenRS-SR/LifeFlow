#!/bin/bash
# LifeFlow 部署脚本

set -e

echo "🚀 开始部署 LifeFlow..."

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，正在安装..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# 检查 Docker Compose 是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装，正在安装..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

echo "✅ Docker 和 Docker Compose 已安装"

# 构建前端
echo "📦 构建前端..."
cd frontend
npm install
npm run build
cd ..

echo "✅ 前端构建完成"

# 启动服务
echo "🐳 启动 Docker 服务..."
cd docker
docker-compose down 2>/dev/null || true
docker-compose up -d --build

echo "✅ 服务已启动"

# 等待数据库就绪
echo "⏳ 等待数据库就绪..."
sleep 5

# 健康检查
echo "🏥 健康检查..."
if curl -s http://localhost/health | grep -q "ok"; then
    echo "✅ 部署成功！"
    echo ""
    echo "🌐 访问地址:"
    echo "  - 前端: http://$(curl -s ip.sb)"
    echo "  - API: http://$(curl -s ip.sb)/api"
    echo "  - API 文档: http://$(curl -s ip.sb)/docs"
else
    echo "❌ 部署可能有问题，请检查日志:"
    echo "  docker-compose logs"
fi
