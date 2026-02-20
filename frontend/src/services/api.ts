import axios from 'axios';

// 创建 axios 实例
const apiClient = axios.create({
  baseURL: 'http://127.0.0.1:8000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加认证信息
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token') || 'token_1';
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 统一错误处理
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ==================== 认证 API ====================
export const authAPI = {
  login: (username: string, password: string) => {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    return apiClient.post('/api/auth/login', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  getMe: () => apiClient.get('/api/auth/me'),
  
  register: (data: { username: string; email: string; password: string }) =>
    apiClient.post('/api/auth/register', data),
};

// ==================== 仪表盘 API ====================
export const dashboardAPI = {
  getStats: async () => {
    const res = await apiClient.get('/api/dashboard/stats');
    return res.data;
  },
};

// ==================== 目标 API ====================
export const goalAPI = {
  list: (period?: string, year?: number) =>
    apiClient.get('/api/goals/', { params: { period, year } }),
  
  create: (data: { title: string; period: string; start_date: string; target_date?: string }) =>
    apiClient.post('/api/goals/', data),
  
  update: (id: number, data: any) =>
    apiClient.put(`/api/goals/${id}`, data),
  
  delete: (id: number) => apiClient.delete(`/api/goals/${id}`),
  
  toggleKeyResult: (goalId: number, krId: number) =>
    apiClient.post(`/api/goals/${goalId}/key-results/${krId}/toggle`),
};

// 别名，供 Goals.tsx 使用
export const goalsAPI = {
  getAll: async () => {
    const res = await apiClient.get('/api/goals/');
    return res.data;
  },
  
  create: (data: any) => apiClient.post('/api/goals/', data),
  
  update: (id: number, data: any) =>
    apiClient.put(`/api/goals/${id}`, data),
  
  delete: (id: number) => apiClient.delete(`/api/goals/${id}`),
};

// ==================== 项目 API ====================
export const projectAPI = {
  list: () => apiClient.get('/api/projects/'),
  
  get: (id: number) => apiClient.get(`/api/projects/${id}`),
  
  create: (data: { name: string; description?: string; target_date?: string }) =>
    apiClient.post('/api/projects/', data),
  
  update: (id: number, data: any) =>
    apiClient.put(`/api/projects/${id}`, data),
  
  delete: (id: number) => apiClient.delete(`/api/projects/${id}`),
  
  // 项目目标/里程碑
  getGoals: (projectId: number) => apiClient.get(`/api/projects/${projectId}/goals`),
  
  createGoal: (projectId: number, data: { title: string; description?: string; sort_order?: number }) =>
    apiClient.post(`/api/projects/${projectId}/goals`, data),
  
  updateGoal: (projectId: number, goalId: number, data: any) =>
    apiClient.put(`/api/projects/${projectId}/goals/${goalId}`, data),
  
  deleteGoal: (projectId: number, goalId: number) =>
    apiClient.delete(`/api/projects/${projectId}/goals/${goalId}`),
  
  toggleGoal: (projectId: number, goalId: number) =>
    apiClient.post(`/api/projects/${projectId}/goals/${goalId}/toggle`),
};

// ==================== 任务 API ====================
export const taskAPI = {
  // 获取任务列表，支持多种视图：all/today/week/overdue/inbox/todo/completed
  list: (view: string = 'all') =>
    apiClient.get('/api/tasks/', { params: { view } }),
  
  // 获取本周日历数据
  getWeekCalendar: (year?: number, week?: number) =>
    apiClient.get('/api/tasks/week-calendar', { params: { year, week } }),
  
  // 获取任务统计（用于已完成视图）
  getStats: () => apiClient.get('/api/tasks/stats'),
  
  // 创建任务
  create: (data: {
    title: string;
    description?: string;
    task_type?: string;
    priority?: number;
    due_date?: string;
    scheduled_date?: string;
    scheduled_type?: string;
    estimated_pomodoros?: number;
    project_id?: number;
    is_inbox?: number;
  }) => apiClient.post('/api/tasks/', data),
  
  // 更新任务
  update: (id: number, data: any) =>
    apiClient.put(`/api/tasks/${id}`, data),
  
  // 完成任务（支持传入实际番茄钟）
  complete: (id: number, actualPomodoros?: number) =>
    apiClient.post(`/api/tasks/${id}/complete`, { actual_pomodoros: actualPomodoros }),
  
  // 删除任务
  delete: (id: number) => apiClient.delete(`/api/tasks/${id}`),
};

// ==================== 习惯 API ====================
export const habitAPI = {
  list: () => apiClient.get('/api/habits/'),
  
  getWeek: (year?: number, week?: number) =>
    apiClient.get('/api/habits/week', { params: { year, week } }),
  
  toggle: (habitId: number, date: string, count?: number) =>
    apiClient.post('/api/habits/toggle', { habit_id: habitId, date, count }),
  
  create: (data: any) => apiClient.post('/api/habits/', data),
  
  update: (id: number, data: any) =>
    apiClient.put(`/api/habits/${id}`, data),
  
  delete: (id: number) => apiClient.delete(`/api/habits/${id}`),
  
  reorder: (habitIds: number[]) =>
    apiClient.post('/api/habits/reorder', { habit_ids: habitIds }),
};

// 别名，供 Habits.tsx 使用
export const habitsAPI = {
  // 获取习惯列表
  list: async () => {
    const res = await apiClient.get('/api/habits/');
    return res.data;
  },
  
  // 获取某周的习惯数据（Habits.tsx 使用）
  getWeekData: async (year?: number, week?: number) => {
    const res = await apiClient.get('/api/habits/week', { params: { year, week } });
    return res.data;
  },
  
  // 勾选习惯（Habits.tsx 使用）
  check: (habitId: number, date: string, count: number = 1) =>
    apiClient.post('/api/habits/toggle', { habit_id: habitId, date, count }),
  
  // 取消勾选（Habits.tsx 使用）
  uncheck: (habitId: number, date: string) =>
    apiClient.post('/api/habits/toggle', { habit_id: habitId, date, count: 0 }),
  
  // 创建习惯
  create: (data: any) => apiClient.post('/api/habits/', data),
  
  // 更新习惯
  update: (id: number, data: any) =>
    apiClient.put(`/api/habits/${id}`, data),
  
  // 删除习惯
  delete: (id: number) => apiClient.delete(`/api/habits/${id}`),
};

// ==================== 复盘 API ====================
export const reviewAPI = {
  list: () => apiClient.get('/api/reviews/'),
  
  create: (data: { period: string; period_date: string; content: string; mood?: number }) =>
    apiClient.post('/api/reviews/', data),
  
  update: (id: number, data: any) =>
    apiClient.put(`/api/reviews/${id}`, data),
  
  delete: (id: number) => apiClient.delete(`/api/reviews/${id}`),
};

// 别名，供 Reviews.tsx 使用
export const reviewsAPI = {
  getAll: async () => {
    const res = await apiClient.get('/api/reviews/');
    return res.data;
  },
  
  getTodayDaily: async () => {
    const res = await apiClient.get('/api/reviews/today');
    return res.data;
  },
  
  create: (data: any) => apiClient.post('/api/reviews/', data),
  
  update: (id: number, data: any) =>
    apiClient.put(`/api/reviews/${id}`, data),
  
  delete: (id: number) => apiClient.delete(`/api/reviews/${id}`),
};

// 导出默认实例
export default apiClient;
