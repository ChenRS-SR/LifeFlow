# LifeFlow 2.0 问题审查与修复建议

> 生成时间：2026-06-18  
> 范围：前端（React + TypeScript + Vite）与后端（FastAPI + SQLAlchemy + SQLite）  
> 说明：本文档聚焦“影响每日实际使用”的逻辑矛盾、数据不一致与安全隐患。样式/UI 类问题不在重点。

---

## 一、总体判断

项目目前最大的风险不是某个单独 bug，而是**同一套业务概念在多处被重复实现，且定义不一致**。

- “今天该做什么”“本周任务”“逾期”“习惯是否完成”“项目进度”等核心概念，在后端 `main.py`、后端 `dashboard.py`、前端 `Tasks.tsx`/`Habits.tsx`/`Dashboard.tsx` 中各有自己的算法。
- 这会导致你真正每天使用时，**各页面数字对不上、任务在不同视图里重复或消失、习惯打卡点不动**。
- 同时，后端代码组织混乱：`main.py` 与 `app/api/tasks.py`、`habits.py`、`goals.py` 重复实现 API，但后者从未被注册，形成“死代码”。

建议先统一业务定义，再补权限，最后整理路由。

---

## 二、优先级说明

| 优先级 | 含义 |
|--------|------|
| **P0** | 影响每日使用，必须尽快修复 |
| **P1** | 安全或数据正确性风险，建议随 P0 一起修 |
| **P2** | 架构/维护成本，可在业务逻辑统一后处理 |

---

## 三、P0：影响每日使用的核心逻辑矛盾

### 3.1 「今天」视图是否包含已完成任务？前后端不一致

- **位置**
  - 后端 Today 视图：`backend/app/main.py:358-365`
  - Dashboard 今日待办统计：`backend/app/api/dashboard.py:34-41`
  - 前端 Today 页分组：`frontend/src/pages/Tasks.tsx:1161`
- **问题描述**
  - 后端 `today` 视图**没有过滤** `status != COMPLETED`，会返回已完成任务。
  - Dashboard 的 `today_pending` 明确排除了已完成任务。
  - 前端 `renderTodayView` 自己又按 `status === 'completed'` 把已完成任务折叠起来。
- **实际影响**
  - Dashboard 显示“今日待办 3 个”，点进 Today 视图可能看到 5 个。
  - 如果后端返回了已完成任务，前端会把它放进“紧急/重要/普通”分组，干扰查看待办。
- **修复建议**
  - 统一 Today 视图语义：建议 Today 视图**只返回今日待完成**的任务（排除已完成）。
  -  Dashboard 与后端使用同一套过滤条件。

---

### 3.2 「本周」视图前后端过滤逻辑不一致

- **位置**
  - 前端加载逻辑：`frontend/src/pages/Tasks.tsx:234`
  - 前端周视图渲染：`frontend/src/pages/Tasks.tsx:1280-1580`
  - 后端 Week 视图：`backend/app/main.py:366-374`
- **问题描述**
  1. 前端在 `currentView === 'week'` 时调用的是 `taskAPI.list('all')`，拿到所有任务后在本地过滤，而不是调用后端的 `view='week'`。
  2. `useEffect` 只依赖 `[currentView, selectedProject?.id]`，**没有依赖 `weekOffset`**，所以切换周时不会重新请求数据。
  3. 前端逾期列按 `due_date < 本周开始` 判断，后端 overdue 视图按 `due_date < 今天` 判断。
- **实际影响**
  - 周视图数据与后端不一致。
  - 翻周不刷新，看到的可能还是上周数据。
  - 同一个逾期任务可能在“本周”和“已逾期”两个视图中重复出现。
- **修复建议**
  - 前端 `week` 视图直接调用 `taskAPI.list('week')`。
  - 将 `weekOffset` 加入 `useEffect` 依赖数组。
  - 统一“逾期”定义：建议全局统一为 `due_date < today && status != COMPLETED && task_type != TRASH`。

---

### 3.3 习惯打卡无法支持“每日多次”（times_per_day > 1）

- **位置**
  - 后端 toggle 逻辑：`backend/app/main.py:768-810`
  - 前端 check/uncheck：`frontend/src/services/api.ts:207-212`
  - 前端 Habits 调用：`frontend/src/pages/Habits.tsx:67-79`
- **问题描述**
  - 前端 `habitsAPI.check` 永远传 `count=1`，`uncheck` 传 `count=0`。
  - 后端 toggle 逻辑是：如果 `data.count is not None`，直接设为该值；否则根据当前记录 toggle。
  - 对于一个 `times_per_day=2` 的习惯：
    - 第一次点击 → 后端 `count=1`，但 `actual < target`，未完成。
    - 第二次点击 → 因为当前 `count>0`，后端又把它重置为 `0`，进入“打卡-取消”循环。
- **实际影响**
  - 任何“每天 2 次/3 次”的习惯永远无法真正完成。
- **修复建议**
  - 方案 A：后端 toggle 支持增量（`count += 1`），前端不再传固定 1。
  - 方案 B：前端根据当前 `actual` 与 `target` 的差值，传 `count = actual + 1`，到达 target 后再点则取消。

---

### 3.4 项目进度：任务完成率 vs 目标完成率互相覆盖

- **位置**
  - 完成任务时更新进度：`backend/app/main.py:634-644`
  - 目标进度更新函数：`backend/app/main.py:910-925`
  - update_project 注释：`backend/app/main.py:192-194`
- **问题描述**
  - `_update_project_progress` 基于**项目目标（ProjectGoal）**的完成情况计算进度。
  - 但 `complete_task` 在任务完成时，基于**项目下任务**的完成情况覆盖 `project.progress`。
  - `update_project` 的注释甚至明确说“进度基于目标完成情况（不是任务）”。
- **实际影响**
  - 假设项目有 5 个目标（完成 2 个，进度 40%），同时有 10 个任务（完成 8 个）。
  - 当用户完成一个任务时，项目进度被覆盖为 90%。
  - 再完成一个目标时，进度又被覆盖为另一个数。
  - 项目列表、项目详情页、目标区域可能显示三个不同的进度。
- **修复建议**
  - 统一项目进度定义：要么完全基于目标完成率，要么完全基于任务完成率。
  - 如果基于目标：删除 `complete_task` 中的任务进度更新。
  - 如果基于任务：删除 `_update_project_progress` 调用。

---

### 3.5 创建任务时 `is_inbox` 与 `task_type` 不同步，任务可能“消失”

- **位置**
  - 前端创建任务：`frontend/src/pages/Tasks.tsx:404`
  - 后端创建任务：`backend/app/main.py:547`
- **问题描述**
  - 前端设置 `is_inbox: currentView === 'inbox' ? 1 : 0`，即按当前视图决定。
  - 但用户可以在 Today 视图选择 `task_type='inbox'`。
  - 此时 `task_type='inbox'` 但 `is_inbox=0`：
    - Today/Week 等视图过滤 `is_inbox=0`，但该任务没有 scheduled_date/due_date，可能不会显示。
    - Inbox 视图按 `task_type` 过滤，它会出现，但 `is_inbox=0` 又意味着它“已整理”。
- **实际影响**
  - 任务创建后在某些视图中找不到。
- **修复建议**
  - 强制 `is_inbox` 与 `task_type` 同步：`is_inbox = 1 if task_type == 'inbox' else 0`。
  - 或者只保留一个字段标识 inbox 状态。

---

### 3.6 Dashboard 本周统计口径错误

- **位置**：`backend/app/api/dashboard.py:72-76`
- **问题描述**
  - `week_tasks_total` 统计 `scheduled_date` 或 `due_date` 在 `[week_start, today]` 范围内的任务。
  - 注意上限是 `today`，不是 `week_end`。
  - 而后端 `week` 视图使用 `week_end = week_start + 6`。
- **实际影响**
  - 如果今天是周三，Dashboard 只统计到周三，但任务页“本周”统计到周日。
  - Dashboard 本周进度分母偏小，百分比与任务页不一致。
- **修复建议**
  - `week_tasks_total` 上限改为 `week_end`。

---

### 3.7 习惯“今日完成”统计只看 count>0，不看 target

- **位置**：`backend/app/api/dashboard.py:92-96`
- **问题描述**
  - `completed_habits` 统计“今天有打卡记录且 count > 0”的习惯数量。
  - 但如果 `times_per_day=3`，只打卡 1 次，`count > 0` 为 true，也被算成完成。
- **实际影响**
  - Dashboard 显示“今日习惯 5/7 完成”，实际可能只达标 3 个。
- **修复建议**
  - 使用 `actual >= target` 判断是否完成。

---

### 3.8 复盘统计按 `created_at` 而非任务实际执行时间

- **位置**
  - 复盘任务统计：`backend/app/api/reviews.py:102-106`
  - 复盘项目任务统计：`backend/app/api/reviews.py:206-209`
- **问题描述**
  - 复盘汇总中的任务数按任务创建时间过滤，而不是按 `scheduled_date`、`due_date` 或 `completed_at`。
  - 例如：2 月创建但 3 月执行的任务，会算进 2 月复盘。
- **实际影响**
  - 复盘数据与实际执行周期不匹配，复盘失去意义。
- **修复建议**
  - 任务统计按 `scheduled_date` 或 `completed_at` 过滤。
  - 项目任务统计同理。

---

## 四、P1：安全与数据正确性

### 4.1 多个 API 缺少 `user_id` 过滤

- **位置**（部分）
  - 习惯列表：`backend/app/main.py:661`
  - 习惯周视图：`backend/app/main.py:691`
  - 完成任务：`backend/app/main.py:609-646`
  - 获取/更新/删除项目：`backend/app/main.py:99`、`167`、`207`
  - 更新/删除习惯：`backend/app/main.py:852`、`884`
  - 删除目标：`backend/app/main.py:322`
  - 项目目标相关 API：`backend/app/main.py:928-1108`
- **问题描述**
  - 这些端点只按 `id` 查询资源，没有验证 `user_id == current_user.id`。
- **实际影响**
  - 单用户场景下当前不会直接误伤，但 API 本身不安全。
  - 一旦有多用户、或接口被直接调用，就会出现查看/修改/删除他人数据的问题。
- **修复建议**
  - 所有资源查询统一加上 `user_id == current_user.id` 过滤。

---

### 4.2 前端默认 fallback token `token_1`

- **位置**：`frontend/src/services/api.ts:17`
- **问题描述**
  - `const token = localStorage.getItem('token') || 'token_1';`
  - 未登录或 token 被清除后，会发送一个硬编码的假 token。
- **实际影响**
  - 不安全；也可能导致后端行为异常。
- **修复建议**
  - 没有 token 时直接不发送 `Authorization` 头。

---

### 4.3 项目大纲 Markdown 渲染存在 XSS 风险

- **位置**：`frontend/src/pages/Tasks.tsx:597-692`
- **问题描述**
  - 使用 `dangerouslySetInnerHTML` + 简单正则解析 Markdown，没有对用户输入做 HTML 转义。
- **实际影响**
  - 如果项目大纲里写 `<script>` 标签，会被直接执行。
- **修复建议**
  - 使用成熟库（如 `marked`）并启用 sanitize；或至少转义 HTML 特殊字符。

---

### 4.4 `complete_task` 在任务不存在时返回 200 + JSON error

- **位置**：`backend/app/main.py:618`
- **问题描述**
  - `if not t: return {"error": "任务不存在"}`，HTTP 状态码是 200。
- **实际影响**
  - 前端可能把错误响应当作成功处理。
- **修复建议**
  - 改为 `raise HTTPException(status_code=404, detail="任务不存在")`。

---

## 五、P2：架构与维护层面的矛盾

### 5.1 后端路由“双轨制”：main.py 与 router 文件重复且未注册

- **位置**
  - 已注册路由：`backend/app/main.py:46-49`
  - 未注册的死代码：`backend/app/api/tasks.py`、`habits.py`、`goals.py`
- **问题描述**
  - `main.py` 直接用 `@app.get/post` 实现了 tasks/habits/goals/projects 的 API。
  - 而 `app/api/tasks.py`、`habits.py`、`goals.py` 中写了更规范、带 schema 的版本，但**从未被 `app.include_router()` 注册**。
- **实际影响**
  - 那三个文件是死代码。
  - 更完善的实现（参数筛选、关键结果自动更新、正确 schema 校验）完全失效。
  - 代码维护困难，改一处容易漏另一处。
- **修复建议**
  - 方案 A：删除 `main.py` 中的相关端点，注册 `tasks.py/habits.py/goals.py` 的 router，并把 `main.py` 特有逻辑（如 `view` 参数、周历、stats）迁移进去。
  - 方案 B：删除三个 router 文件，统一在 `main.py` 中维护。
  - 推荐方案 A，更利于后续模块化。

---

### 5.2 关键结果 toggle API 前端引用但后端未实现

- **位置**
  - 前端 API 定义：`frontend/src/services/api.ts:79-80`
  - 后端 goals router：`backend/app/api/goals.py`
- **问题描述**
  - 前端有 `goalAPI.toggleKeyResult(goalId, krId)`，调用 `/api/goals/{goalId}/key-results/{krId}/toggle`。
  - 后端没有对应端点。
- **实际影响**
  - Goals 页面里完成关键结果会 404。
- **修复建议**
  - 后端添加 KeyResult toggle 端点，或前端移除该 API 引用。

---

### 5.3 Schema 与 Model 字段名不一致

- **位置**
  - Project：`backend/app/schemas/project.py:11` 用 `title`，`backend/app/models/project.py:30` 用 `name`。
  - Habit：`backend/app/schemas/habit.py:16-18` 用 `frequency`/`target_times`，模型用 `frequency_type`/`times_per_day`/`weekly_target`。
  - Goal：`backend/app/schemas/goal.py` 缺少 `project_id`。
- **实际影响**
  - 如果启用 router 文件，Pydantic 反序列化会传入错误字段名，导致 500。
- **修复建议**
  - 同步 schema 与 model 字段名。

---

### 5.4 Goals 创建目标传了 `key_results`，后端 main.py 直接忽略

- **位置**
  - 前端：`frontend/src/pages/Goals.tsx:130-133`
  - 后端：`backend/app/main.py:260-288`
- **问题描述**
  - 前端创建目标时传 `key_results: []`。
  - 后端 `create_goal` 接收 `dict`，不处理 `key_results`。
- **实际影响**
  - 关键结果功能不可用。
- **修复建议**
  - 后端处理 `key_results`，或统一使用 `goals.py` router。

---

### 5.5 Dashboard 跳转 Tasks 的 query 参数未被解析

- **位置**
  - Dashboard 跳转：`frontend/src/pages/Dashboard.tsx:106`
  - Tasks 页：`frontend/src/pages/Tasks.tsx`
- **问题描述**
  - Dashboard 点卡片跳 `/tasks?view=today`，但 Tasks 页没有读取 URL query。
- **实际影响**
  - 跳转后不会自动切换到对应视图。
- **修复建议**
  - 在 `Tasks.tsx` 中添加 `useEffect` 读取 `location.search` 并设置初始 `currentView`。

---

### 5.6 日期/时间处理不一致

- **位置**：多处
- **问题描述**
  - 任务完成时间用 `datetime.utcnow()`，目标/项目完成时间用 `datetime.now()`。
  - `completed_at` 字段定义为 `DateTime(timezone=True)`，但赋值的是 naive datetime。
  - `date.today()` 是本地日期，`datetime.utcnow()` 是 UTC 时间。
- **实际影响**
  - 跨时区部署时，“今天”的判定可能差一天。
  - Dashboard 的 `completed_at >= today` 比较在 SQLite 中可能工作，但逻辑不严谨。
- **修复建议**
  - 统一使用 `datetime.now(timezone.utc)` 或 `func.now()`。

---

### 5.7 测试数据硬编码为 2026 年 2 月

- **位置**：`backend/app/main.py:1199-1202`
- **问题描述**
  - `init_default_data()` 生成任务使用 `date(2026, 2, 1)` 到 `date(2026, 2, 28)`。
  - 当前日期是 2026 年 6 月，这些任务全部显示为已逾期。
- **实际影响**
  - 演示数据全部过期，影响体验。
- **修复建议**
  - 使用相对日期生成测试数据，如 `today - timedelta(days=random.randint(0, 30))`。

---

### 5.8 项目状态枚举前后端不一致

- **位置**
  - 前端：`frontend/src/pages/Tasks.tsx:73-81`
  - 后端：`backend/app/models/project.py:13-19`
- **问题描述**
  - 前端定义了 `on_hold`、`cancelled`，但后端 `ProjectStatus` 只有 `paused`、`archived` 等。
- **实际影响**
  - 前端选择的状态后端无法存储，会报错。
- **修复建议**
  - 前后端统一状态枚举。

---

## 六、修复路线图建议

既然复盘功能暂不改造，建议按以下顺序推进：

### 阶段 1：统一核心业务定义（优先）

1. 统一后端 `today` / `week` / `overdue` 视图的过滤条件：
   - 是否包含已完成？
   - 是否排除 `trash`？
   - 是否排除 `cancelled`？
   - 逾期定义统一为 `due_date < today && status != COMPLETED && task_type != TRASH`。
2. 让 Dashboard 的 `today_pending`、`week_tasks_total`、`completed_habits` 与任务/习惯页使用同一套定义。
3. 修复习惯打卡逻辑，支持 `times_per_day > 1`。
4. 统一项目进度定义（基于目标 或 基于任务，二选一）。
5. 修复 `is_inbox` 与 `task_type` 不同步问题。

### 阶段 2：补全安全与数据隔离

6. 所有资源查询统一加 `user_id == current_user.id`。
7. 移除前端 `token_1` fallback。
8. 修复 `complete_task` 的 200 error 响应。
9. 修复 MarkdownPreview 的 XSS 风险。

### 阶段 3：整理后端路由与字段一致性

10. 统一路由：要么注册 `tasks.py/habits.py/goals.py`，要么删除它们。
11. 同步 schema 与 model 字段名。
12. 实现 KeyResult toggle 端点，或移除前端引用。
13. 处理 Goals 创建时的 `key_results`。
14. 修复时间/时区处理。
15. 修复测试数据硬编码日期。

---

## 七、附录：快速检查清单

- [ ] 任务 Today 视图与 Dashboard 今日待办数字一致
- [ ] 任务 Week 视图与 Dashboard 本周进度一致
- [ ] 习惯 `times_per_day=2` 可以正常打卡完成
- [ ] 项目进度在完成任务和完成目标后不会跳变
- [ ] 在任意视图创建 `task_type=inbox` 的任务，都能在 Inbox 找到
- [ ] 复盘中的任务数按执行/完成日期统计，而非创建日期
- [ ] 所有 API 查询都带 `user_id` 过滤
- [ ] 未登录时不发送 `token_1`
- [ ] 项目大纲 Markdown 不会执行 `<script>`

---

*本报告基于 2026-06-18 的代码审查结果生成。修复后建议逐项对照此清单验证。*
