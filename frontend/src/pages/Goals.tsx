import { useEffect, useState } from 'react';
import { Plus, Target, TrendingUp, CheckCircle2 } from 'lucide-react';
import { goalsAPI } from '../services/api';
import type { Goal } from '../types';

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGoal, setNewGoal] = useState({
    title: '',
    description: '',
    period: 'month' as const,
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    area: '工作',
  });

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    try {
      const data = await goalsAPI.getAll();
      setGoals(data);
    } catch (error) {
      console.error('加载目标失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await goalsAPI.create({
        ...newGoal,
        key_results: [],
      });
      setShowAddModal(false);
      setNewGoal({
        title: '',
        description: '',
        period: 'month',
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        area: '工作',
      });
      loadGoals();
    } catch (error) {
      console.error('创建目标失败:', error);
    }
  };

  const getPeriodLabel = (period: string) => {
    const labels: Record<string, string> = {
      life: '人生愿景',
      year: '年度目标',
      quarter: '季度目标',
      month: '月度目标',
    };
    return labels[period] || period;
  };

  const getAreaColor = (area: string) => {
    const colors: Record<string, string> = {
      '工作': 'bg-blue-100 text-blue-700',
      '学习': 'bg-green-100 text-green-700',
      '健康': 'bg-red-100 text-red-700',
      '财务': 'bg-yellow-100 text-yellow-700',
      '关系': 'bg-purple-100 text-purple-700',
    };
    return colors[area] || 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // 按周期分组
  const groupedGoals = goals.reduce((acc, goal) => {
    if (!acc[goal.period]) acc[goal.period] = [];
    acc[goal.period].push(goal);
    return acc;
  }, {} as Record<string, Goal[]>);

  const periods = ['life', 'year', 'quarter', 'month'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">目标管理</h2>
          <p className="text-gray-500 mt-1">OKR 目标体系，从愿景到行动</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          新建目标
        </button>
      </div>

      {/* 目标列表 */}
      <div className="space-y-8">
        {periods.map((period) => {
          const periodGoals = groupedGoals[period] || [];
          if (periodGoals.length === 0) return null;

          return (
            <div key={period}>
              <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Target size={20} />
                {getPeriodLabel(period)}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {periodGoals.map((goal) => (
                  <div key={goal.id} className="card">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs px-2 py-1 rounded ${getAreaColor(goal.area || '')}`}>
                            {goal.area}
                          </span>
                          {goal.status === 'completed' && (
                            <CheckCircle2 size={16} className="text-green-600" />
                          )}
                        </div>
                        <h4 className="font-semibold text-gray-900">{goal.title}</h4>
                        {goal.description && (
                          <p className="text-sm text-gray-500 mt-1">{goal.description}</p>
                        )}
                      </div>
                    </div>

                    {/* 进度条 */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-500">进度</span>
                        <span className="font-medium text-gray-900">{goal.progress.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-600 rounded-full transition-all"
                          style={{ width: `${goal.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* 关键结果 */}
                    {goal.key_results.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {goal.key_results.map((kr) => (
                          <div
                            key={kr.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            {kr.is_completed ? (
                              <CheckCircle2 size={14} className="text-green-600" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300" />
                            )}
                            <span className={kr.is_completed ? 'text-gray-400 line-through' : 'text-gray-600'}>
                              {kr.title} ({kr.current_value}/{kr.target_value} {kr.unit})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {goals.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <TrendingUp size={64} className="mx-auto mb-4" />
          <p className="text-lg">还没有目标</p>
          <p className="text-sm mt-1">点击右上角按钮创建你的第一个目标</p>
        </div>
      )}

      {/* 添加目标弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">新建目标</h3>
            <form onSubmit={handleAddGoal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                <input
                  type="text"
                  value={newGoal.title}
                  onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                  className="input"
                  required
                  placeholder="例如：提升编程能力"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea
                  value={newGoal.description}
                  onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                  className="input"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">周期</label>
                  <select
                    value={newGoal.period}
                    onChange={(e) => setNewGoal({ ...newGoal, period: e.target.value as any })}
                    className="input"
                  >
                    <option value="life">人生愿景</option>
                    <option value="year">年度目标</option>
                    <option value="quarter">季度目标</option>
                    <option value="month">月度目标</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">领域</label>
                  <select
                    value={newGoal.area}
                    onChange={(e) => setNewGoal({ ...newGoal, area: e.target.value })}
                    className="input"
                  >
                    <option value="工作">工作</option>
                    <option value="学习">学习</option>
                    <option value="健康">健康</option>
                    <option value="财务">财务</option>
                    <option value="关系">关系</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">年份</label>
                  <input
                    type="number"
                    value={newGoal.year}
                    onChange={(e) => setNewGoal({ ...newGoal, year: parseInt(e.target.value) })}
                    className="input"
                  />
                </div>
                {newGoal.period === 'month' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">月份</label>
                    <select
                      value={newGoal.month}
                      onChange={(e) => setNewGoal({ ...newGoal, month: parseInt(e.target.value) })}
                      className="input"
                    >
                      {[...Array(12)].map((_, i) => (
                        <option key={i + 1} value={i + 1}>{i + 1}月</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 btn-secondary"
                >
                  取消
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
