# 🚀 LifeFlow 启动指南

## 方式一：一键启动（推荐）

### Windows 用户

双击运行：
```
start-all.bat
```

或命令行运行：
```bash
start-all.bat
```

### Mac/Linux 用户

```bash
chmod +x start-all.sh
./start-all.sh
```

---

## 方式二：手动启动（排查问题用）

### 1. 启动后端

打开一个命令行窗口：

```bash
cd lifeflow/backend

# 激活虚拟环境（Windows）
venv\Scripts\activate

# 激活虚拟环境（Mac/Linux）
source venv/bin/activate

# 启动后端服务
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

看到 `Uvicorn running on http://0.0.0.0:8000` 表示启动成功！

### 2. 启动前端

**再打开一个新的命令行窗口**（不要关闭后端的窗口）：

```bash
cd lifeflow/frontend

# 启动前端
npm run dev
```

看到 `Local: http://localhost:3000/` 表示启动成功！

---

## 📍 访问地址

等服务都启动后，在浏览器打开：

| 服务 | 地址 | 说明 |
|------|------|------|
| **前端界面** | http://localhost:3000 | 主要使用这个 |
| **后端 API** | http://localhost:8000 | API 接口 |
| **API 文档** | http://localhost:8000/docs | 自动生成的接口文档 |

---

## 🛑 停止服务

- **一键启动**：关闭弹出的两个命令行窗口
- **手动启动**：
  - 后端窗口：按 `Ctrl + C`
  - 前端窗口：按 `Ctrl + C`

---

## 🔧 常见问题

### 1. 端口被占用

如果提示端口被占用，修改启动命令：

```bash
# 后端改端口（比如改为 8001）
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001

# 前端改端口（会自动提示，按 Y 确认）
npm run dev -- --port 3001
```

### 2. 前端报错 "Cannot find module"

删除 node_modules 重新安装：

```bash
cd frontend
rm -rf node_modules
npm install
npm run dev
```

### 3. 后端报错 "No module named xxx"

确保在虚拟环境中：

```bash
cd backend
venv\Scripts\activate  # Windows
# 或
source venv/bin/activate  # Mac/Linux

pip install -r requirements.txt
```

---

## 📝 首次使用步骤

1. 启动服务（用一键启动脚本）
2. 浏览器打开 http://localhost:3000
3. 点击「注册」创建账号
4. 开始使用 LifeFlow！

---

## 🎉 恭喜！

现在你可以：
- 🎯 创建人生目标和 OKR
- 📋 管理每日任务
- ✅ 追踪习惯打卡
- 📝 写日复盘
- 📊 查看数据统计

祝你使用愉快！有任何问题随时问。
