import { useEffect, useState } from 'react';
import { Target, CheckSquare, Calendar, TrendingUp } from 'lucide-react';
import { dashboardAPI } from '../services/api';
import type { DashboardStats } from '../types';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">仪表盘</h2>

      {/* 今日概览 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">今日任务</p>
              <p className="text-2xl font-bold text-gray-900">{stats.today.tasks_count}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <CheckSquare className="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">今日打卡</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.today.completed_habits}/{stats.today.total_habits}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <Calendar className="text-green-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">进行中目标</p>
              <p className="text-2xl font-bold text-gray-900">{stats.overview.active_goals}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <Target className="text-purple-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">本周完成</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.overview.week_tasks_completed}/{stats.overview.week_tasks_total}
              </p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <TrendingUp className="text-orange-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* 打卡热力图 */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">近7天打卡热力</h3>
        <div className="flex items-end gap-2 h-32">
          {stats.heatmap.map((day, index) => {
            const height = Math.min((day.count / 5) * 100, 100); // 最高5次为100%
            const intensity = Math.min(day.count / 3, 1); // 颜色深浅
            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full rounded-t transition-all duration-500"
                  style={{
                    height: `${Math.max(height, 10)}%`,
                    backgroundColor: `rgba(59, 130, 246, ${0.2 + intensity * 0.8})`,
                  }}
                />
                <span className="text-xs text-gray-500 mt-2">
                  {new Date(day.date).getMonth() + 1}/{new Date(day.date).getDate()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
