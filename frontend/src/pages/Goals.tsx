import { useEffect, useState } from 'react';
import { Plus, Target, TrendingUp, CheckCircle2, Edit2, Lightbulb, ChevronDown, ChevronUp, Folder } from 'lucide-react';
import { goalsAPI, projectAPI } from '../services/api';
import type { Goal } from '../types';

// 使用说明组件
function GoalGuide() {
  const [isOpen, setIsOpen] = useState(true);

  const guides = [
    {
      period: 'life',
      label: '人生愿景',
      desc: '长期的人生方向，通常是5-10年或一生的追求',
      example: '例：成为一位有影响力的技术专家，拥有自己的创业公司',
      tips: ['不需要太具体，重点是方向感', '可以随着人生阶段调整', '建议1-3个核心愿景'],
    },
    {
      period: 'year',
      label: '年度目标',
      desc: '一年想要达成的重要成果，支撑人生愿景',
      example: '例：2026年掌握AI开发技能，主导完成2个AI项目',
      tips: ['遵循SMART原则（具体、可衡量）', '建议3-5个年度目标', '每个目标关联1-2个项目'],
    },
    {
      period: 'quarter',
      label: '季度目标',
      desc: '3个月的阶段性成果，将年度目标拆解',
      example: '例：Q1完成Python基础学习，开发一个爬虫项目',
      tips: ['聚焦当下最重要的', '可以关联具体的项目里程碑', '建议每季度复盘调整'],
    },
    {
      period: 'month',
      label: '月度目标',
      desc: '当月要完成的行动，最具体的执行层面',
      example: '例：2月完成Python语法学习，刷完100道算法题',
      tips: ['和日常任务紧密结合', '建议不超过3个', '月底检查完成情况'],
    },
  ];

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 mb-6 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-blue-100/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Lightbulb className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">💡 目标管理使用指南</h3>
        </div>
        {isOpen ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
      </button>
      
      {isOpen && (
        <div className="px-6 pb-6">
          <p className="text-sm text-gray-600 mb-4">
            目标管理采用<strong>四级体系</strong>，从长期愿景到短期行动，层层拆解。每个目标可以关联具体项目，进度支持手动更新。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {guides.map((g) => (
              <div key={g.period} className="bg-white rounded-lg p-4 border border-blue-100">
                <h4 className="font-medium text-gray-900 mb-1">{g.label}</h4>
                <p className="text-xs text-gray-500 mb-2">{g.desc}</p>
                <p className="text-sm text-blue-700 bg-blue-50 rounded px-2 py-1.5 mb-2">{g.example}</p>
                <ul className="text-xs text-gray-500 space-y-0.5">
                  {g.tips.map((tip, i) => (
                    <li key={i}>• {tip}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface Project {
  id: number;
  name: string;
}

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  
  const [newGoal, setNewGoal] = useState({
    title: '',
    description: '',
    period: 'month' as const,
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    area: '工作',
    progress: 0,
    project_id: null as number | null,
  });

  useEffect(() => {
    loadGoals();
    loadProjects();
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

  const loadProjects = async () => {
    try {
      const res = await projectAPI.list();
      setProjects(res.data || []);
    } catch (error) {
      console.error('加载项目失败:', error);
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
      resetNewGoal();
      loadGoals();
    } catch (error) {
      console.error('创建目标失败:', error);
    }
  };

  const handleUpdateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGoal) return;
    
    try {
      await goalsAPI.update(editingGoal.id, {
        title: editingGoal.title,
        description: editingGoal.description,
        progress: editingGoal.progress,
        area: editingGoal.area,
        project_id: editingGoal.project_id,
        status: editingGoal.status,
      });
      setEditingGoal(null);
      loadGoals();
    } catch (error) {
      console.error('更新目标失败:', error);
    }
  };

  const handleDeleteGoal = async (goalId: number) => {
    if (!confirm('确定要删除这个目标吗？')) return;
    try {
      await goalsAPI.delete(goalId);
      loadGoals();
    } catch (error) {
      console.error('删除目标失败:', error);
    }
  };

  const resetNewGoal = () => {
    setNewGoal({
      title: '',
      description: '',
      period: 'month',
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      area: '工作',
      progress: 0,
      project_id: null,
    });
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

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return 'bg-emerald-500';
    if (progress >= 50) return 'bg-blue-500';
    if (progress >= 20) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
      {/* 使用说明 */}
      <GoalGuide />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">目标管理</h2>
          <p className="text-gray-500 mt-1">从愿景到行动，层层拆解你的目标</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
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
                <Target size={20} className="text-blue-600" />
                {getPeriodLabel(period)}
                <span className="text-sm font-normal text-gray-400">({periodGoals.length})</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {periodGoals.map((goal) => (
                  <div key={goal.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${getAreaColor(goal.area || '')}`}>
                            {goal.area}
                          </span>
                          {goal.status === 'completed' && (
                            <CheckCircle2 size={16} className="text-emerald-600" />
                          )}
                        </div>
                        <h4 className="font-semibold text-gray-900 text-lg">{goal.title}</h4>
                        {goal.description && (
                          <p className="text-sm text-gray-500 mt-1">{goal.description}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setEditingGoal(goal)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="编辑"
                        >
                          <Edit2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* 关联项目 */}
                    {goal.project_id && (
                      <div className="flex items-center gap-1.5 text-sm text-blue-600 mb-3">
                        <Folder size={14} />
                        <span>关联项目：{projects.find(p => p.id === goal.project_id)?.name || '未知项目'}</span>
                      </div>
                    )}

                    {/* 进度条 */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-500">完成进度</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${goal.progress >= 100 ? 'text-emerald-600' : 'text-gray-900'}`}>
                            {Math.round(goal.progress)}%
                          </span>
                          {goal.progress >= 100 && <CheckCircle2 size={16} className="text-emerald-600" />}
                        </div>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getProgressColor(goal.progress)}`}
                          style={{ width: `${Math.min(goal.progress, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {goals.length === 0 && (
        <div className="text-center py-16 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <TrendingUp size={64} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">还没有目标</p>
          <p className="text-sm mt-1">点击右上角按钮创建你的第一个目标</p>
        </div>
      )}

      {/* 添加目标弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">新建目标</h3>
              <form onSubmit={handleAddGoal} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">目标标题 *</label>
                  <input
                    type="text"
                    value={newGoal.title}
                    onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    placeholder="例如：提升编程能力"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">描述（可选）</label>
                  <textarea
                    value={newGoal.description}
                    onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="补充说明..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">目标周期</label>
                    <select
                      value={newGoal.period}
                      onChange={(e) => setNewGoal({ ...newGoal, period: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="工作">工作</option>
                      <option value="学习">学习</option>
                      <option value="健康">健康</option>
                      <option value="财务">财务</option>
                      <option value="关系">关系</option>
                    </select>
                  </div>
                </div>
                
                {/* 关联项目 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">关联项目（可选）</label>
                  <select
                    value={newGoal.project_id || ''}
                    onChange={(e) => setNewGoal({ ...newGoal, project_id: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">不关联项目</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">关联项目后可以在项目详情中看到这个目标</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">年份</label>
                    <input
                      type="number"
                      value={newGoal.year}
                      onChange={(e) => setNewGoal({ ...newGoal, year: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {newGoal.period === 'month' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">月份</label>
                      <select
                        value={newGoal.month}
                        onChange={(e) => setNewGoal({ ...newGoal, month: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {[...Array(12)].map((_, i) => (
                          <option key={i + 1} value={i + 1}>{i + 1}月</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* 初始进度 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">当前进度: {newGoal.progress}%</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={newGoal.progress}
                    onChange={(e) => setNewGoal({ ...newGoal, progress: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    创建目标
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 编辑目标弹窗 */}
      {editingGoal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">编辑目标</h3>
              <form onSubmit={handleUpdateGoal} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">目标标题</label>
                  <input
                    type="text"
                    value={editingGoal.title}
                    onChange={(e) => setEditingGoal({ ...editingGoal, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                  <textarea
                    value={editingGoal.description || ''}
                    onChange={(e) => setEditingGoal({ ...editingGoal, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">领域</label>
                  <select
                    value={editingGoal.area || '工作'}
                    onChange={(e) => setEditingGoal({ ...editingGoal, area: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="工作">工作</option>
                    <option value="学习">学习</option>
                    <option value="健康">健康</option>
                    <option value="财务">财务</option>
                    <option value="关系">关系</option>
                  </select>
                </div>

                {/* 关联项目 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">关联项目</label>
                  <select
                    value={editingGoal.project_id || ''}
                    onChange={(e) => setEditingGoal({ ...editingGoal, project_id: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">不关联项目</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </div>

                {/* 进度滑块 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    完成进度: <span className="text-blue-600 font-bold">{Math.round(editingGoal.progress)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={editingGoal.progress}
                    onChange={(e) => setEditingGoal({ ...editingGoal, progress: parseInt(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* 状态 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                  <select
                    value={editingGoal.status}
                    onChange={(e) => setEditingGoal({ ...editingGoal, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">进行中</option>
                    <option value="completed">已完成</option>
                    <option value="archived">已归档</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setEditingGoal(null)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteGoal(editingGoal.id)}
                    className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    删除
                  </button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    保存修改
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
