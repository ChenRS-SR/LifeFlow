import { useEffect, useState } from 'react';
import { 
  CheckSquare, Inbox, AlertCircle, 
  TrendingUp, Target, Folder, Zap, ChevronRight 
} from 'lucide-react';
import { dashboardAPI, taskAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

interface DashboardStats {
  today: {
    pending: number;
    completed: number;
    overdue: number;
    inbox: number;
  };
  week: {
    total: number;
    completed: number;
    progress: number;
  };
  goals: {
    active: number;
  };
  habits: {
    total: number;
    completed: number;
  };
  projects: Array<{
    id: number;
    name: string;
    progress: number;
    status: string;
  }>;
  top_tasks: Array<{
    id: number;
    title: string;
    priority: string;
    due_date: string | null;
  }>;
}

const PRIORITY_COLORS: Record<string, string> = {
  'urgent': 'bg-red-100 text-red-600',
  'high': 'bg-orange-100 text-orange-600',
  'medium': 'bg-blue-100 text-blue-600',
  'low': 'bg-gray-100 text-gray-600',
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await dashboardAPI.getStats();
      setStats(data);
    } catch (error) {
      console.error('加载统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickComplete = async (taskId: number) => {
    try {
      await taskAPI.complete(taskId, 1);
      loadStats();
    } catch (err) {
      console.error('完成任务失败:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!stats) return null;

  const weekProgress = stats.week.progress;

  return (
    <div className="space-y-6">
      {/* 欢迎语 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">👋 欢迎回来！</h2>
        <p className="text-blue-100">
          {stats.today.pending === 0 
            ? "太棒了！今天的任务都完成了，休息一下吧~" 
            : `今天还有 ${stats.today.pending} 个任务等你完成，加油！`}
        </p>
      </div>

      {/* 今日概览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* 待办任务 */}
        <div 
          onClick={() => navigate('/tasks?view=today')}
          className="bg-white rounded-xl p-5 border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
              <CheckSquare className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-xs text-gray-400">今日</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.today.pending}</p>
          <p className="text-sm text-gray-500">待办任务</p>
        </div>

        {/* 逾期提醒 */}
        <div 
          onClick={() => navigate('/tasks?view=overdue')}
          className={`rounded-xl p-5 border transition-all cursor-pointer group ${
            stats.today.overdue > 0 
              ? 'bg-red-50 border-red-200 hover:border-red-300' 
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-lg transition-colors ${
              stats.today.overdue > 0 ? 'bg-red-100' : 'bg-gray-100'
            }`}>
              <AlertCircle className={`w-5 h-5 ${stats.today.overdue > 0 ? 'text-red-600' : 'text-gray-500'}`} />
            </div>
            <span className="text-xs text-gray-400">注意</span>
          </div>
          <p className={`text-2xl font-bold ${stats.today.overdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {stats.today.overdue}
          </p>
          <p className="text-sm text-gray-500">逾期任务</p>
        </div>

        {/* 已完成 */}
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-emerald-50 rounded-lg">
              <Zap className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-xs text-gray-400">今日</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.today.completed}</p>
          <p className="text-sm text-gray-500">已完成</p>
        </div>

        {/* 收集箱 */}
        <div 
          onClick={() => navigate('/tasks?view=inbox')}
          className="bg-white rounded-xl p-5 border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors">
              <Inbox className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-xs text-gray-400">待整理</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.today.inbox}</p>
          <p className="text-sm text-gray-500">收集箱</p>
        </div>
      </div>

      {/* 中间区域：今日任务 + 本周进度 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 今日重点任务 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              今日优先任务
            </h3>
            <button 
              onClick={() => navigate('/tasks?view=today')}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              查看全部 <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {stats.top_tasks.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>今天没有安排任务，去创建一些吧！</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.top_tasks.map((task) => (
                <div 
                  key={task.id} 
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all group"
                >
                  <button
                    onClick={() => handleQuickComplete(task.id)}
                    className="flex-shrink-0 w-5 h-5 rounded border-2 border-gray-300 hover:border-emerald-500 hover:bg-emerald-50 transition-all flex items-center justify-center"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-600 opacity-0 group-hover:opacity-100" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                    {task.due_date && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        截止: {new Date(task.due_date).toLocaleDateString('zh-CN')}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-600'}`}>
                    {task.priority === 'urgent' ? '紧急' : 
                     task.priority === 'high' ? '高' : 
                     task.priority === 'medium' ? '中' : '低'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 本周进度 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-600" />
            本周进度
          </h3>

          <div className="text-center mb-6">
            <div className="relative w-32 h-32 mx-auto mb-4">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-gray-100"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="text-blue-600"
                  strokeDasharray={`${weekProgress}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-900">{weekProgress}%</span>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              已完成 <span className="font-bold text-gray-900">{stats.week.completed}</span> / {stats.week.total} 个任务
            </p>
          </div>

          {/* 习惯打卡 */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">今日习惯</span>
              <span className="text-sm text-gray-500">{stats.habits.completed}/{stats.habits.total}</span>
            </div>
            <div className="flex gap-2">
              {Array.from({ length: stats.habits.total }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-2 rounded-full ${
                    i < stats.habits.completed ? 'bg-emerald-500' : 'bg-gray-100'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* 活跃目标 */}
          <div className="border-t border-gray-100 pt-4 mt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">进行中的目标</span>
              <span className="text-lg font-bold text-blue-600">{stats.goals.active}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 项目进度 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Folder className="w-5 h-5 text-orange-600" />
            项目进展
          </h3>
          <button 
            onClick={() => navigate('/tasks?view=detail')}
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            查看全部 <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {stats.projects.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Folder className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>还没有项目，去创建一个吧！</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.projects.map((project) => (
              <div 
                key={project.id}
                onClick={() => navigate(`/tasks?project=${project.id}`)}
                className="p-4 rounded-lg border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900 truncate pr-2">{project.name}</h4>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    project.status === 'active' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {project.status === 'active' ? '进行中' : '规划中'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700">{project.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
