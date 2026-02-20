# 🚀 LifeFlow 启动指南

## 第一次使用？

### 1. 安装依赖（只需一次）

双击运行：
```
install.bat
```

这会安装：
- Python 虚拟环境
- 后端依赖包
- 前端 npm 包

### 2. 启动服务

双击运行：
```
start.bat
```

这会：
- 启动后端服务 (http://127.0.0.1:8000)
- 启动前端服务 (http://localhost:3000)
- 自动打开浏览器

### 3. 登录

点击「一键登录默认账户」即可使用！

**默认账户**: admin / admin123

---

## 常见问题

### 启动失败？

1. **检查端口占用**
   ```bash
   netstat -an | findstr 8000
   ```

2. **手动启动后端**
   ```bash
   cd backend
   venv\Scripts\activate
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

3. **手动启动前端**
   ```bash
   cd frontend
   npm run dev
   ```

### 登录失败？

1. 检查后端是否运行：http://127.0.0.1:8000/health
2. 查看后端命令行窗口是否有错误信息
3. 尝试删除数据库重新启动：`del backend\lifeflow.db`

---

## 功能介绍

- 🎯 **目标管理** - 设定人生 OKR
- 📋 **任务管理** - GTD 流程
- ✅ **习惯追踪** - 每日打卡
- 📝 **复盘** - 记录成长
- 📊 **仪表盘** - 数据可视化

祝你使用愉快！
