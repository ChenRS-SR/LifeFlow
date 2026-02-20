# LifeFlow 部署指南

## 服务器要求

- **操作系统**: Linux (Ubuntu 20.04+ 或 CentOS 8+)
- **内存**: 至少 1GB RAM
- **硬盘**: 至少 20GB 存储
- **网络**: 需要公网 IP

## 推荐云服务器

| 服务商 | 配置 | 价格(约) | 链接 |
|--------|------|----------|------|
| 阿里云 | 1核2G | 99元/年 | https://www.aliyun.com |
| 腾讯云 | 1核2G | 99元/年 | https://cloud.tencent.com |
| 华为云 | 1核2G | 99元/年 | https://www.huaweicloud.com |

## 部署步骤

### 1. 购买服务器并连接

```bash
# 使用 SSH 连接服务器
ssh root@你的服务器IP
```

### 2. 安装 Docker 和 Docker Compose

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh

# 启动 Docker
systemctl enable docker
systemctl start docker
```

### 3. 上传项目代码

```bash
# 在本地打包项目
cd lifeflow
tar -czvf lifeflow.tar.gz backend frontend docker

# 上传到服务器
scp lifeflow.tar.gz root@你的服务器IP:/root/

# 在服务器上解压
ssh root@你的服务器IP "tar -xzvf /root/lifeflow.tar.gz"
```

### 4. 启动服务

```bash
cd docker
docker-compose up -d
```

### 5. 检查服务状态

```bash
# 查看容器状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 测试 API 是否正常运行
curl http://localhost/health
```

### 6. 配置域名（可选）

如果你有自己的域名，可以配置 Nginx 反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 常用命令

```bash
# 查看容器日志
docker-compose logs -f backend   # 后端日志
docker-compose logs -f frontend  # 前端日志
docker-compose logs -f db        # 数据库日志

# 重启服务
docker-compose restart

# 更新代码后重新构建
docker-compose down
docker-compose up -d --build

# 进入数据库
docker-compose exec db psql -U lifeflow_user -d lifeflow

# 备份数据库
docker-compose exec db pg_dump -U lifeflow_user lifeflow > backup.sql
```

## 安全建议

1. **修改默认密码**
   - 编辑 `docker/.env` 文件
   - 修改 `SECRET_KEY` 和数据库密码

2. **配置防火墙**
   ```bash
   # 只开放 80 和 443 端口
   ufw allow 80
   ufw allow 443
   ufw enable
   ```

3. **使用 HTTPS**
   - 建议使用 Nginx + Let's Encrypt 配置 HTTPS
   - 或使用 Cloudflare 的免费 SSL

## 故障排除

### 容器启动失败

```bash
# 查看详细日志
docker-compose logs

# 检查端口是否被占用
netstat -tlnp | grep 80
```

### 数据库连接失败

```bash
# 检查数据库容器状态
docker-compose ps db

# 查看数据库日志
docker-compose logs db
```

### 前端无法访问

```bash
# 检查前端是否构建成功
ls -la frontend/dist

# 重新构建前端
cd frontend && npm run build
```
