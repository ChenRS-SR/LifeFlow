#!/bin/bash
# Docker 镜像加速器配置脚本

echo "配置 Docker 镜像加速器..."

# 创建 Docker 配置目录
mkdir -p /etc/docker

# 写入加速器配置
cat > /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1panel.live",
    "https://hub.rat.dev",
    "https://docker.mirrors.ustc.edu.cn",
    "https://dockerpull.com"
  ]
}
EOF

# 重启 Docker
systemctl daemon-reload
systemctl restart docker

echo "✅ Docker 镜像加速器配置完成"
echo ""
echo "当前配置的镜像源："
docker info 2>/dev/null | grep -A 10 "Registry Mirrors"
