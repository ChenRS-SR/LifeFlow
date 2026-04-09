import { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  BookOpen, Calendar, Save, ChevronLeft, ChevronRight, 
  TrendingUp, Target, CheckCircle2, Folder, Plus, X, Clock,
  Smile, FileText, CalendarDays, Zap, Import, Search,
  Download, FileText as FileTextIcon, Image as ImageIcon
} from 'lucide-react';
import { reviewsAPI, taskAPI, habitAPI } from '../services/api';
import type { Review, TimelineItem, Task, Habit, HabitLog } from '../types';
import { format, startOfWeek, addDays, getWeek, getYear, parseISO, subDays, isSameDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// ============ 类型定义 ============
type TabPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

interface PeriodSummary {
  tasks: {
    total: number;
    completed: number;
    completion_rate: number;
    completed_list: Array<{ id: number; title: string; completed_at?: string }>;
  };
  habits: {
    total_checkins: number;
    total_target: number;
    overall_rate: number;
    habits: Array<{
      id: number;
      name: string;
      icon?: string;
      color: string;
      count: number;
      target: number;
      rate: number;
    }>;
  };
  goals: {
    total: number;
    goals: Array<{
      id: number;
      title: string;
      period: string;
      area?: string;
      progress: number;
      status: string;
      key_results: Array<{
        id: number;
        title: string;
        current: number;
        target: number;
        unit?: string;
        completed: boolean;
      }>;
    }>;
  };
  projects: {
    total: number;
    projects: Array<{
      id: number;
      name: string;
      progress: number;
      status: string;
      milestones: Array<{ id: number; title: string; completed: boolean; sort_order: number }>;
      tasks_count: number;
    }>;
  };
}

interface DailyFormData {
  timeline: TimelineItem[];
  notes: string;
  tomorrow: string;
  mood: number;
}

interface ReviewFormData {
  highlights: string;
  challenges: string;
  learnings: string;
  next_steps: string;
  gratitude: string;
  mood: number;
  keep?: string;
  problem?: string;
  try_?: string;
  objective_summary?: string;
  reflective_summary?: string;
  interpretive_summary?: string;
  decisional_summary?: string;
}

// ============ Toast 组件 ============
function Toast({ message, type, onClose }: { message: string | any; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  // 确保 message 是字符串
  const displayMessage = typeof message === 'string' ? message : 
    message?.msg || message?.message || JSON.stringify(message);

  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${
      type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    }`}>
      {type === 'success' ? <CheckCircle2 size={18} /> : <X size={18} />}
      <span className="max-w-xs truncate">{displayMessage}</span>
    </div>
  );
}

// ============ 导入弹窗组件 ============
function ImportModal({ 
  isOpen, 
  onClose, 
  onImport,
  date 
}: { 
  isOpen: boolean;
  onClose: () => void;
  onImport: (items: TimelineItem[]) => void;
  date: Date;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<Record<number, number>>({});
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [selectedHabits, setSelectedHabits] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [taskFilter, setTaskFilter] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    
    const loadData = async () => {
      setLoading(true);
      try {
        // 加载所有已完成的任务（不限于今天，方便选择）
        const tasksRes = await taskAPI.list('completed');
        const allTasks = tasksRes.data || [];
        // 只取最近完成的20个
        setTasks(allTasks.slice(0, 20));

        // 加载习惯列表
        const habitsRes = await habitAPI.list();
        const allHabits = habitsRes.data || [];
        setHabits(allHabits);

        // 加载当天的习惯打卡记录
        const today = format(date, 'yyyy-MM-dd');
        try {
          const weekRes = await habitAPI.getWeek();
          const weekData = weekRes.data || {};
          // weekData 格式: { habit_id: { date: count } }
          const todayLogs: Record<number, number> = {};
          Object.entries(weekData).forEach(([habitId, dates]: [string, any]) => {
            if (dates[today] > 0) {
              todayLogs[parseInt(habitId)] = dates[today];
            }
          });
          setHabitLogs(todayLogs);
        } catch (e) {
          console.error('加载习惯打卡失败:', e);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, date]);

  const handleImport = () => {
    const items: TimelineItem[] = [];
    
    // 添加选中的任务
    selectedTasks.forEach(taskId => {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        items.push({
          time: task.completed_at ? format(parseISO(task.completed_at), 'HH:mm') : '09:00',
          content: `完成任务: ${task.title}`,
          type: 'task',
          ref_id: task.id
        });
      }
    });

    // 添加选中的习惯
    selectedHabits.forEach(habitId => {
      const habit = habits.find(h => h.id === habitId);
      if (habit) {
        items.push({
          time: '08:00',
          content: `习惯打卡: ${habit.name}`,
          type: 'habit',
          ref_id: habit.id
        });
      }
    });

    onImport(items);
    onClose();
  };

  const toggleTask = (taskId: number) => {
    const newSet = new Set(selectedTasks);
    if (newSet.has(taskId)) {
      newSet.delete(taskId);
    } else {
      newSet.add(taskId);
    }
    setSelectedTasks(newSet);
  };

  const toggleHabit = (habitId: number) => {
    const newSet = new Set(selectedHabits);
    if (newSet.has(habitId)) {
      newSet.delete(habitId);
    } else {
      newSet.add(habitId);
    }
    setSelectedHabits(newSet);
  };

  const filteredTasks = tasks.filter(t => 
    t.title.toLowerCase().includes(taskFilter.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">导入到时间线</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-gray-400">
              <div className="animate-spin h-8 w-8 border-2 border-primary-600 border-t-transparent rounded-full mx-auto mb-2" />
              <p>加载中...</p>
            </div>
          ) : (
            <>
              {/* 已完成的任务 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-blue-600" />
                  已完成的任务 ({selectedTasks.size} 选中)
                </h4>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索任务..."
                    value={taskFilter}
                    onChange={(e) => setTaskFilter(e.target.value)}
                    className="input w-full pl-9 text-sm"
                  />
                </div>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {filteredTasks.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">暂无已完成任务</p>
                  ) : (
                    filteredTasks.map(task => (
                      <label 
                        key={task.id} 
                        className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTasks.has(task.id)}
                          onChange={() => toggleTask(task.id)}
                          className="rounded border-gray-300"
                        />
                        <span className="flex-1 text-sm truncate">{task.title}</span>
                        {task.completed_at && (
                          <span className="text-xs text-gray-400">
                            {format(parseISO(task.completed_at), 'MM-dd HH:mm')}
                          </span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* 已打卡的习惯 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <TrendingUp size={16} className="text-green-600" />
                  已打卡的习惯 ({selectedHabits.size} 选中)
                </h4>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {habits.filter(h => habitLogs[h.id] > 0).length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">今天还没有打卡习惯</p>
                  ) : (
                    habits.filter(h => habitLogs[h.id] > 0).map(habit => (
                      <label 
                        key={habit.id} 
                        className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedHabits.has(habit.id)}
                          onChange={() => toggleHabit(habit.id)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-lg">{habit.icon || '🔘'}</span>
                        <span className="flex-1 text-sm">{habit.name}</span>
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          已打卡
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="btn-secondary px-4 py-2">
            取消
          </button>
          <button 
            onClick={handleImport}
            disabled={selectedTasks.size === 0 && selectedHabits.size === 0}
            className="btn-primary px-4 py-2 disabled:opacity-50"
          >
            导入 ({selectedTasks.size + selectedHabits.size})
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ 时间线编辑组件 ============
function TimelineEditor({ 
  timeline, 
  onChange,
  date 
}: { 
  timeline: TimelineItem[]; 
  onChange: (timeline: TimelineItem[]) => void;
  date: Date;
}) {
  const [newTime, setNewTime] = useState('09:00');
  const [newContent, setNewContent] = useState('');
  const [showImport, setShowImport] = useState(false);

  const addItem = () => {
    if (!newContent.trim()) return;
    const newItem: TimelineItem = {
      time: newTime,
      content: newContent.trim(),
      type: 'life'
    };
    const updated = [...timeline, newItem].sort((a, b) => a.time.localeCompare(b.time));
    onChange(updated);
    setNewContent('');
  };

  const removeItem = (index: number) => {
    const updated = timeline.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleImport = (items: TimelineItem[]) => {
    // 合并已有项和新导入项，按时间排序
    const existingContents = new Set(timeline.map(t => `${t.type}-${t.content}`));
    const newItems = items.filter(item => !existingContents.has(`${item.type}-${item.content}`));
    const updated = [...timeline, ...newItems].sort((a, b) => a.time.localeCompare(b.time));
    onChange(updated);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'task': return '📋';
      case 'habit': return '💪';
      default: return '•';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'task': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'habit': return 'bg-green-50 text-green-700 border-green-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-3">
      {/* 时间线列表 */}
      <div className="space-y-2">
        {timeline.length === 0 ? (
          <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">还没有记录，添加今天的事项吧</p>
          </div>
        ) : (
          timeline.map((item, index) => (
            <div 
              key={index} 
              className={`flex items-center gap-3 p-3 rounded-lg border ${getTypeColor(item.type)}`}
            >
              <span className="font-mono text-sm font-medium w-12">{item.time}</span>
              <span className="flex-1">{getTypeIcon(item.type)} {item.content}</span>
              <button 
                onClick={() => removeItem(index)}
                className="p-1 hover:bg-white/50 rounded transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* 添加新项 */}
      <div className="flex gap-2">
        <input
          type="time"
          value={newTime}
          onChange={(e) => setNewTime(e.target.value)}
          className="input w-24 text-sm"
        />
        <button
          onClick={() => setShowImport(true)}
          className="btn-secondary px-3 py-2 flex items-center gap-1 text-sm"
          title="从任务和习惯导入"
        >
          <Import size={16} />
          导入
        </button>
        <input
          type="text"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          placeholder="做了什么..."
          className="input flex-1 text-sm"
        />
        <button
          onClick={addItem}
          disabled={!newContent.trim()}
          className="btn-primary px-3 py-2 disabled:opacity-50"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* 导入弹窗 */}
      <ImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        date={date}
      />
    </div>
  );
}

// ============ 复盘模板 ============
const REVIEW_TEMPLATES: Record<TabPeriod, { title: string; description: string; fields: Array<{ key: keyof ReviewFormData; label: string; placeholder: string }> }> = {
  daily: {
    title: '日复盘',
    description: '记录今天的成长与感悟',
    fields: []
  },
  weekly: {
    title: '周复盘',
    description: '回顾本周，规划下周 (KPT模板)',
    fields: [
      { key: 'keep', label: '✅ Keep - 保持', placeholder: '本周做得好的，要保持的习惯/方法是什么？' },
      { key: 'problem', label: '❌ Problem - 问题', placeholder: '本周遇到了什么问题？哪些做得不好？' },
      { key: 'try_', label: '🚀 Try - 尝试', placeholder: '下周想尝试什么新方法/改变？' },
      { key: 'highlights', label: '🌟 本周亮点', placeholder: '本周最有成就感的事？' },
      { key: 'next_steps', label: '📝 下周计划', placeholder: '下周最重要的3件事？' },
    ]
  },
  monthly: {
    title: '月复盘',
    description: '月度总结，目标回顾 (ORID模板)',
    fields: [
      { key: 'objective_summary', label: '📊 客观回顾 (O)', placeholder: '本月 objectively 完成了什么？数据如何？' },
      { key: 'reflective_summary', label: '💭 主观感受 (R)', placeholder: '本月整体情绪如何？有什么特别的感受？' },
      { key: 'interpretive_summary', label: '💡 深度思考 (I)', placeholder: '从本月经历中学到了什么？有什么洞察？' },
      { key: 'highlights', label: '🌟 月度成就', placeholder: '本月最值得骄傲的3件事？' },
      { key: 'next_steps', label: '🎯 下月规划 (D)', placeholder: '下月最重要的目标是什么？' },
    ]
  },
  quarterly: {
    title: '季度复盘',
    description: '季度回顾，战略调整 (ORID模板)',
    fields: [
      { key: 'objective_summary', label: '📊 季度成果 (O)', placeholder: '本季度OKR完成情况如何？关键数据是什么？' },
      { key: 'reflective_summary', label: '💭 情绪回顾 (R)', placeholder: '本季度的整体状态如何？满意吗？' },
      { key: 'interpretive_summary', label: '🔍 原因分析 (I)', placeholder: '为什么达成/未达成目标？根本原因是什么？' },
      { key: 'highlights', label: '🏆 重大突破', placeholder: '本季度最大的突破和成长是什么？' },
      { key: 'next_steps', label: '🚀 下季度战略 (D)', placeholder: '下季度的核心目标和策略是什么？' },
    ]
  },
  yearly: {
    title: '年度复盘',
    description: '年度总结，人生校准 (ORID模板)',
    fields: [
      { key: 'objective_summary', label: '📈 年度成就 (O)', placeholder: '今年完成了什么？离年初目标有多远？' },
      { key: 'reflective_summary', label: '🎭 年度感受 (R)', placeholder: '用几个词形容今年？为什么？' },
      { key: 'interpretive_summary', label: '🎯 人生对齐 (I)', placeholder: '今年的经历与人生愿景对齐吗？有什么顿悟？' },
      { key: 'highlights', label: '✨ 年度时刻', placeholder: '今年最难忘的3个时刻？' },
      { key: 'next_steps', label: '🔮 新年愿景 (D)', placeholder: '明年的主题词是什么？想达成什么？' },
    ]
  }
};

// ============ 工具函数 ============
const getWeekNumber = (date: Date): number => {
  return getWeek(date, { weekStartsOn: 1 });
};

const getQuarter = (date: Date): number => {
  return Math.floor(date.getMonth() / 3) + 1;
};

// ============ 心情曲线组件 ============
function MoodChart({ reviews }: { reviews: Review[] }) {
  const data = useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = subDays(new Date(), 29 - i);
      return {
        date: format(date, 'MM-dd'),
        fullDate: date,
        mood: null as number | null
      };
    });

    reviews.forEach(review => {
      if (review.period === 'daily' && review.date && review.mood) {
        const reviewDate = parseISO(review.date);
        const dayData = last30Days.find(d => isSameDay(d.fullDate, reviewDate));
        if (dayData) {
          dayData.mood = review.mood;
        }
      }
    });

    return last30Days;
  }, [reviews]);

  const hasData = data.some(d => d.mood !== null);

  if (!hasData) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-400">
        <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">近30天暂无心情数据</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-700 mb-3">📈 近30天心情曲线</h4>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 10 }} 
              interval={4}
              axisLine={false}
            />
            <YAxis 
              domain={[1, 10]} 
              tick={{ fontSize: 10 }}
              axisLine={false}
              width={20}
            />
            <Tooltip 
              formatter={(value: number) => [`心情评分: ${value}`, '']}
              labelFormatter={(label) => `${label}`}
            />
            <Line 
              type="monotone" 
              dataKey="mood" 
              stroke="#f59e0b" 
              strokeWidth={2}
              dot={{ fill: '#f59e0b', strokeWidth: 0, r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============ 复盘热力图组件（GitHub风格） ============
function ReviewHeatmap({ reviews }: { reviews: Review[] }) {
  const data = useMemo(() => {
    const weeks = 12; // 显示12周
    const days = weeks * 7;
    const startDate = subDays(new Date(), days - 1);
    
    const cells = Array.from({ length: days }, (_, i) => {
      const date = addDays(startDate, i);
      return {
        date,
        dateStr: format(date, 'yyyy-MM-dd'),
        hasReview: false,
        level: 0
      };
    });

    // 标记有复盘的日子
    reviews.forEach(review => {
      if (review.date) {
        const cell = cells.find(c => c.dateStr === review.date);
        if (cell) {
          cell.hasReview = true;
          // 根据心情评分设置颜色深度
          if (review.mood) {
            if (review.mood >= 8) cell.level = 4;
            else if (review.mood >= 6) cell.level = 3;
            else if (review.mood >= 4) cell.level = 2;
            else cell.level = 1;
          } else {
            cell.level = 1;
          }
        }
      }
    });

    // 按周分组
    const weeksData = [];
    for (let i = 0; i < weeks; i++) {
      weeksData.push(cells.slice(i * 7, (i + 1) * 7));
    }

    return weeksData;
  }, [reviews]);

  const getColor = (level: number) => {
    const colors = ['bg-gray-100', 'bg-green-200', 'bg-green-300', 'bg-green-400', 'bg-green-500'];
    return colors[level] || colors[0];
  };

  const weekDays = ['一', '三', '五', '日'];

  return (
    <div className="bg-white rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-700 mb-3">🔥 复盘打卡热力图</h4>
      <div className="flex gap-1 overflow-x-auto pb-2">
        {/* 星期标签 */}
        <div className="flex flex-col gap-1 mr-2">
          {weekDays.map((day, i) => (
            <div key={i} className="h-3 text-xs text-gray-400 flex items-center">{day}</div>
          ))}
        </div>
        
        {/* 热力格子 */}
        {data.map((week, weekIndex) => (
          <div key={weekIndex} className="flex flex-col gap-1">
            {week.map((cell, dayIndex) => (
              <div
                key={dayIndex}
                className={`w-3 h-3 rounded-sm ${getColor(cell.level)}`}
                title={`${cell.dateStr}${cell.hasReview ? ' - 已复盘' : ''}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
        <span>少</span>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className={`w-3 h-3 rounded-sm ${getColor(i)}`} />
          ))}
        </div>
        <span>多</span>
      </div>
    </div>
  );
}

// ============ 子组件：数据展示卡片 ============
function TaskSummaryCard({ data }: { data: PeriodSummary['tasks'] }) {
  if (!data || data.total === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-400">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">暂无任务数据</p>
      </div>
    );
  }
  
  return (
    <div className="bg-blue-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-blue-600" />
          <span className="font-medium text-gray-900">任务完成</span>
        </div>
        <span className="text-2xl font-bold text-blue-600">{data.completion_rate}%</span>
      </div>
      <div className="text-sm text-gray-600 mb-3">
        完成 <span className="font-semibold">{data.completed}</span> / {data.total} 个任务
      </div>
      {data.completed_list.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">今天完成:</p>
          {data.completed_list.slice(0, 3).map(task => (
            <div key={task.id} className="text-sm text-gray-700 truncate bg-white/50 rounded px-2 py-1">
              ✓ {task.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HabitSummaryCard({ data }: { data: PeriodSummary['habits'] }) {
  if (!data || data.habits.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-400">
        <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">暂无习惯数据</p>
      </div>
    );
  }
  
  return (
    <div className="bg-green-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          <span className="font-medium text-gray-900">习惯打卡</span>
        </div>
        <span className="text-2xl font-bold text-green-600">{data.overall_rate}%</span>
      </div>
      <div className="text-sm text-gray-600 mb-3">
        打卡 <span className="font-semibold">{data.total_checkins}</span> / {data.total_target} 次
      </div>
      <div className="space-y-1">
        {data.habits.slice(0, 3).map(habit => (
          <div key={habit.id} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 truncate">
              <span>{habit.icon || '🔘'}</span>
              <span className="text-gray-700 truncate">{habit.name}</span>
            </span>
            <span className={`font-medium ${habit.rate >= 80 ? 'text-green-600' : habit.rate >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
              {habit.rate}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalsSummaryCard({ data }: { data: PeriodSummary['goals'] }) {
  if (!data || data.total === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-400">
        <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">暂无目标数据</p>
      </div>
    );
  }
  
  return (
    <div className="bg-purple-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-purple-600" />
          <span className="font-medium text-gray-900">目标进展</span>
        </div>
        <span className="text-lg font-bold text-purple-600">{data.total} 个</span>
      </div>
      <div className="space-y-2">
        {data.goals.slice(0, 3).map(goal => (
          <div key={goal.id}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-700 truncate">{goal.title}</span>
              <span className="font-medium text-purple-600">{goal.progress}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-500 rounded-full transition-all"
                style={{ width: `${goal.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectsSummaryCard({ data }: { data: PeriodSummary['projects'] }) {
  if (!data || data.total === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-400">
        <Folder className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">暂无项目数据</p>
      </div>
    );
  }
  
  return (
    <div className="bg-orange-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Folder className="w-5 h-5 text-orange-600" />
          <span className="font-medium text-gray-900">项目进展</span>
        </div>
        <span className="text-lg font-bold text-orange-600">{data.total} 个</span>
      </div>
      <div className="space-y-2">
        {data.projects.slice(0, 3).map(project => (
          <div key={project.id}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-700 truncate">{project.name}</span>
              <span className="text-xs text-gray-500">{project.tasks_count} 任务</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-orange-500 rounded-full transition-all"
                style={{ width: `${project.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ 主组件 ============
export default function Reviews() {
  // 状态
  const [activeTab, setActiveTab] = useState<TabPeriod>('daily');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // 当前周期日期状态
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [currentWeek, setCurrentWeek] = useState<number>(getWeekNumber(new Date()));
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth() + 1);
  const [currentQuarter, setCurrentQuarter] = useState<number>(getQuarter(new Date()));
  const [currentYear, setCurrentYear] = useState<number>(getYear(new Date()));
  
  // 复盘数据
  const [existingReview, setExistingReview] = useState<Review | null>(null);
  const [periodSummary, setPeriodSummary] = useState<PeriodSummary | null>(null);
  const [allReviews, setAllReviews] = useState<Review[]>([]);
  
  // 日复盘表单
  const [dailyForm, setDailyForm] = useState<DailyFormData>({
    timeline: [],
    notes: '',
    tomorrow: '',
    mood: 5
  });
  
  // 今日数据统计
  const [todayStats, setTodayStats] = useState({
    completedTasks: 0,
    habitCheckins: 0
  });
  
  // 其他复盘表单（兼容旧版）
  const [formData, setFormData] = useState<ReviewFormData>({
    highlights: '', challenges: '', learnings: '', next_steps: '', gratitude: '', mood: 5,
    keep: '', problem: '', try_: '',
    objective_summary: '', reflective_summary: '', interpretive_summary: '', decisional_summary: '',
  });

  // 显示Toast
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  // 获取当前周期的标识参数
  const getPeriodParams = useCallback(() => {
    const base = { year: currentYear };
    switch (activeTab) {
      case 'daily': return { ...base, date: format(currentDate, 'yyyy-MM-dd') };
      case 'weekly': return { ...base, week: currentWeek };
      case 'monthly': return { ...base, month: currentMonth };
      case 'quarterly': return { ...base, quarter: currentQuarter };
      case 'yearly': return base;
      default: return base;
    }
  }, [activeTab, currentDate, currentWeek, currentMonth, currentQuarter, currentYear]);

  // 加载复盘列表
  const loadReviews = useCallback(async () => {
    try {
      const data = await reviewsAPI.getAll({ period: activeTab });
      setAllReviews(data);
    } catch (error) {
      console.error('加载复盘列表失败:', error);
    }
  }, [activeTab]);

  // 加载当前周期的复盘和数据汇总
  const loadCurrentReview = useCallback(async () => {
    setLoading(true);
    try {
      const params = getPeriodParams();
      const [reviewData, summaryData] = await Promise.all([
        reviewsAPI.getByPeriod(activeTab, params).catch(() => null),
        activeTab === 'daily' ? Promise.resolve(null) : reviewsAPI.getPeriodSummary(activeTab, params).catch(() => null)
      ]);
      
      setExistingReview(reviewData);
      setPeriodSummary(summaryData);
      
      if (reviewData) {
        // 日复盘使用新表单
        if (activeTab === 'daily') {
          setDailyForm({
            timeline: reviewData.timeline || [],
            notes: reviewData.notes || '',
            tomorrow: reviewData.tomorrow || '',
            mood: reviewData.mood || 5
          });
        } else {
          // 其他复盘使用旧表单
          setFormData({
            highlights: reviewData.highlights || '', challenges: reviewData.challenges || '',
            learnings: reviewData.learnings || '', next_steps: reviewData.next_steps || '',
            gratitude: reviewData.gratitude || '', mood: reviewData.mood || 5,
            keep: reviewData.keep || '', problem: reviewData.problem || '', try_: reviewData.try_ || '',
            objective_summary: reviewData.objective_summary || '', reflective_summary: reviewData.reflective_summary || '',
            interpretive_summary: reviewData.interpretive_summary || '', decisional_summary: reviewData.decisional_summary || '',
          });
        }
      } else {
        // 重置表单
        if (activeTab === 'daily') {
          setDailyForm({ timeline: [], notes: '', tomorrow: '', mood: 5 });
        } else {
          setFormData({
            highlights: '', challenges: '', learnings: '', next_steps: '', gratitude: '', mood: 5,
            keep: '', problem: '', try_: '',
            objective_summary: '', reflective_summary: '', interpretive_summary: '', decisional_summary: '',
          });
        }
      }
    } catch (error) {
      console.error('加载复盘失败:', error);
      showToast('加载复盘失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, getPeriodParams, showToast]);

  useEffect(() => { loadReviews(); }, [loadReviews]);
  useEffect(() => { loadCurrentReview(); }, [loadCurrentReview]);
  
  // 加载今日数据统计
  useEffect(() => {
    const loadTodayStats = async () => {
      if (activeTab !== 'daily') return;
      
      try {
        const today = format(currentDate, 'yyyy-MM-dd');
        
        // 获取今日任务
        const tasksRes = await taskAPI.list('today');
        const tasks = tasksRes.data || [];
        const completedTasks = tasks.filter((t: Task) => t.status === 'completed').length;
        
        // 获取今日习惯打卡
        let checkinCount = 0;
        try {
          const weekRes = await habitAPI.getWeek();
          const habits = weekRes.data || [];
          // habits 格式: [{ id, name, week_status: [{ date, actual, completed }, ...] }, ...]
          habits.forEach((habit: any) => {
            const todayStatus = habit.week_status?.find((s: any) => s.date === today);
            if (todayStatus && todayStatus.actual > 0) {
              checkinCount++;
            }
          });
        } catch (e) {
          console.error('加载习惯打卡失败:', e);
        }
        
        setTodayStats({
          completedTasks,
          habitCheckins: checkinCount
        });
      } catch (error) {
        console.error('加载今日统计失败:', error);
      }
    };
    
    loadTodayStats();
  }, [activeTab, currentDate]);

  // 保存复盘
  const handleSave = async () => {
    setSaving(true);
    try {
      const params = getPeriodParams();
      let data: any;
      
      if (activeTab === 'daily') {
        // 清理 timeline 数据，确保格式正确
        const cleanTimeline = dailyForm.timeline.map(item => ({
          time: item.time || '09:00',
          content: item.content,
          type: item.type || 'life',
          ref_id: item.ref_id || null
        }));
        
        data = { 
          period: activeTab, 
          ...params, 
          timeline: cleanTimeline,
          notes: dailyForm.notes,
          tomorrow: dailyForm.tomorrow,
          mood: dailyForm.mood,
          highlights: dailyForm.notes, // 兼容旧字段
          next_steps: dailyForm.tomorrow
        };
      } else {
        data = { period: activeTab, ...params, ...formData };
      }
      
      if (existingReview) {
        await reviewsAPI.update(existingReview.id, data);
      } else {
        await reviewsAPI.create(data);
      }
      
      await loadCurrentReview();
      await loadReviews();
      showToast('复盘已保存', 'success');
    } catch (error: any) {
      console.error('保存复盘失败:', error);
      // 处理不同类型的错误信息
      let msg = '保存失败，请检查网络';
      if (error.response?.data) {
        const data = error.response.data;
        if (typeof data === 'string') {
          msg = data;
        } else if (data.detail) {
          msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
        } else if (Array.isArray(data)) {
          msg = data.map((e: any) => e.msg || e.message || JSON.stringify(e)).join(', ');
        } else {
          msg = JSON.stringify(data);
        }
      }
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // 周期切换
  const handlePrevPeriod = () => {
    switch (activeTab) {
      case 'daily': setCurrentDate(d => addDays(d, -1)); break;
      case 'weekly': setCurrentWeek(w => Math.max(1, w - 1)); break;
      case 'monthly': 
        setCurrentMonth(m => { if (m === 1) { setCurrentYear(y => y - 1); return 12; } return m - 1; });
        break;
      case 'quarterly': 
        setCurrentQuarter(q => { if (q === 1) { setCurrentYear(y => y - 1); return 4; } return q - 1; });
        break;
      case 'yearly': setCurrentYear(y => y - 1); break;
    }
  };

  const handleNextPeriod = () => {
    switch (activeTab) {
      case 'daily': setCurrentDate(d => addDays(d, 1)); break;
      case 'weekly': setCurrentWeek(w => Math.min(53, w + 1)); break;
      case 'monthly': 
        setCurrentMonth(m => { if (m === 12) { setCurrentYear(y => y + 1); return 1; } return m + 1; });
        break;
      case 'quarterly': 
        setCurrentQuarter(q => { if (q === 4) { setCurrentYear(y => y + 1); return 1; } return q + 1; });
        break;
      case 'yearly': setCurrentYear(y => y + 1); break;
    }
  };

  // 获取周期显示文本
  const getPeriodDisplay = () => {
    switch (activeTab) {
      case 'daily': return format(currentDate, 'yyyy年MM月dd日', { locale: zhCN });
      case 'weekly': return `${currentYear}年第${currentWeek}周`;
      case 'monthly': return `${currentYear}年${currentMonth}月`;
      case 'quarterly': return `${currentYear}年第${currentQuarter}季度`;
      case 'yearly': return `${currentYear}年`;
    }
  };

  // 导出为 Markdown
  const exportToMarkdown = () => {
    const date = format(currentDate, 'yyyy-MM-dd');
    const lines = [
      `# 📅 日复盘 - ${date}`,
      '',
      '## ⏰ 时间线',
      ...(dailyForm.timeline.length > 0 
        ? dailyForm.timeline.map(item => `- **${item.time}** ${item.content}`)
        : ['暂无记录']),
      '',
      '## 📊 今日数据',
      `- 完成任务: ${todayStats.completedTasks} 个`,
      `- 习惯打卡: ${todayStats.habitCheckins} 个`,
      `- 心情评分: ${dailyForm.mood}/10`,
      '',
      '## 📝 记录',
      dailyForm.notes || '无',
      '',
      '## 🎯 明日计划',
      dailyForm.tomorrow || '无',
    ];
    
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `复盘-${date}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('已导出 Markdown', 'success');
  };

  // 导出为 PDF（使用 print to PDF）
  const exportToPDF = () => {
    window.print();
    showToast('请使用浏览器打印功能保存为 PDF', 'success');
  };

  // 生成复盘卡片（HTML 转图片）
  const generateCard = () => {
    const cardHtml = `
      <div style="
        width: 600px;
        padding: 40px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 20px;
        color: white;
        font-family: system-ui, -apple-system, sans-serif;
      ">
        <div style="font-size: 14px; opacity: 0.8; margin-bottom: 8px;">
          📅 ${format(currentDate, 'yyyy年MM月dd日')} 日复盘
        </div>
        <div style="font-size: 28px; font-weight: bold; margin-bottom: 20px;">
          今日复盘总结
        </div>
        <div style="
          background: rgba(255,255,255,0.15);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
        ">
          <div style="font-size: 14px; opacity: 0.8; margin-bottom: 8px;">心情评分</div>
          <div style="font-size: 48px; font-weight: bold;">${dailyForm.mood}<span style="font-size: 24px;">/10</span></div>
          <div style="font-size: 36px; margin-top: 8px;">${dailyForm.mood >= 7 ? '😄' : dailyForm.mood >= 4 ? '😐' : '😢'}</div>
        </div>
        <div style="display: flex; gap: 12px; margin-bottom: 16px;">
          <div style="flex: 1; background: rgba(255,255,255,0.15); border-radius: 12px; padding: 16px; text-align: center;">
            <div style="font-size: 32px; font-weight: bold;">${todayStats.completedTasks}</div>
            <div style="font-size: 12px; opacity: 0.8;">完成任务</div>
          </div>
          <div style="flex: 1; background: rgba(255,255,255,0.15); border-radius: 12px; padding: 16px; text-align: center;">
            <div style="font-size: 32px; font-weight: bold;">${todayStats.habitCheckins}</div>
            <div style="font-size: 12px; opacity: 0.8;">习惯打卡</div>
          </div>
        </div>
        <div style="font-size: 12px; opacity: 0.6; text-align: center;">
          Generated by LifeFlow
        </div>
      </div>
    `;
    
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(`
        <html>
          <head>
            <title>复盘卡片</title>
            <style>
              body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; }
            </style>
          </head>
          <body>${cardHtml}</body>
        </html>
      `);
      newWindow.document.close();
      showToast('复盘卡片已生成，请右键保存图片', 'success');
    }
  };

  // 渲染日复盘表单
  const renderDailyForm = () => {
    return (
      <div className="space-y-6">
        {/* 时间线 */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Clock size={16} className="text-primary-600" />
            ⏰ 今天做了什么
          </h4>
          <TimelineEditor 
            timeline={dailyForm.timeline} 
            onChange={(timeline) => setDailyForm({ ...dailyForm, timeline })}
            date={currentDate}
          />
        </div>

        {/* 今日数据汇总 */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Zap size={16} className="text-yellow-600" />
            📊 今日数据（自动同步）
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{todayStats.completedTasks}</div>
              <div className="text-xs text-gray-500">完成任务</div>
            </div>
            <div className="bg-white rounded p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{todayStats.habitCheckins}</div>
              <div className="text-xs text-gray-500">习惯打卡</div>
            </div>
          </div>
        </div>

        {/* 心情评分 */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Smile size={16} className="text-yellow-600" />
            😊 今天状态怎么样？（1-10分）
          </h4>
          <div className="bg-gray-50 rounded-lg p-4">
            <input
              type="range" min={1} max={10}
              value={dailyForm.mood}
              onChange={(e) => setDailyForm({ ...dailyForm, mood: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-gray-500 mt-2">
              <span>😢 1</span>
              <span className="font-medium text-primary-600 text-lg">{dailyForm.mood}</span>
              <span>😄 10</span>
            </div>
          </div>
        </div>

        {/* 随意记录 */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <FileText size={16} className="text-blue-600" />
            📝 有什么想记录的？（可选）
          </h4>
          <textarea
            value={dailyForm.notes}
            onChange={(e) => setDailyForm({ ...dailyForm, notes: e.target.value })}
            placeholder="比如：改论文太繁琐容易遗漏细节... / 今天健身感觉状态不错..."
            className="input w-full"
            rows={3}
          />
        </div>

        {/* 明天注意 */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <CalendarDays size={16} className="text-green-600" />
            🎯 明天要注意什么？（可选）
          </h4>
          <textarea
            value={dailyForm.tomorrow}
            onChange={(e) => setDailyForm({ ...dailyForm, tomorrow: e.target.value })}
            placeholder="比如：继续按入职前冲刺计划执行 / 记得带健身手套..."
            className="input w-full"
            rows={2}
          />
        </div>
      </div>
    );
  };

  // 渲染其他周期表单
  const renderFormFields = () => {
    const template = REVIEW_TEMPLATES[activeTab];
    return (
      <div className="space-y-4">
        {template.fields.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
            <textarea
              value={formData[field.key] || ''}
              onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
              className="input w-full"
              rows={activeTab === 'daily' ? 2 : 3}
              placeholder={field.placeholder}
            />
          </div>
        ))}
        {activeTab === 'daily' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">😊 心情评分 (1-10)</label>
            <input
              type="range" min={1} max={10}
              value={formData.mood}
              onChange={(e) => setFormData({ ...formData, mood: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-gray-500 mt-1">
              <span>😢 1</span>
              <span className="font-medium text-primary-600">{formData.mood}</span>
              <span>😄 10</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const tabs: { key: TabPeriod; label: string }[] = [
    { key: 'daily', label: '日复盘' },
    { key: 'weekly', label: '周复盘' },
    { key: 'monthly', label: '月复盘' },
    { key: 'quarterly', label: '季度' },
    { key: 'yearly', label: '年度' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = [...Array(7)].map((_, i) => addDays(weekStart, i));

  return (
    <div>
      {/* Toast */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">复盘</h2>
        <p className="text-gray-500 mt-1">记录成长，反思进步</p>
      </div>

      {/* Tab 切换 */}
      <div className="mb-6">
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：日历/导航 + 统计 */}
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Calendar size={20} />
              {activeTab === 'daily' ? '本周概览' : '周期选择'}
            </h3>
            <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
              <button onClick={handlePrevPeriod} className="p-1.5 hover:bg-white rounded-lg transition-colors">
                <ChevronLeft size={20} className="text-gray-600" />
              </button>
              <span className="font-medium text-gray-900">{getPeriodDisplay()}</span>
              <button onClick={handleNextPeriod} className="p-1.5 hover:bg-white rounded-lg transition-colors">
                <ChevronRight size={20} className="text-gray-600" />
              </button>
            </div>
            {activeTab === 'daily' && (
              <div className="grid grid-cols-7 gap-1 text-center">
                {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
                  <div key={day} className="text-xs text-gray-400 py-1">{day}</div>
                ))}
                {weekDays.map((date, i) => {
                  const isToday = format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
                  const isSelected = format(date, 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd');
                  const hasReview = allReviews.some(r => r.period === 'daily' && r.date === format(date, 'yyyy-MM-dd'));
                  return (
                    <button
                      key={i}
                      onClick={() => setCurrentDate(date)}
                      className={`aspect-square flex items-center justify-center text-sm rounded-lg transition-colors ${
                        isSelected ? 'bg-primary-600 text-white' : isToday ? 'bg-primary-100 text-primary-700' : hasReview ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'
                      }`}
                    >
                      {format(date, 'd')}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 数据汇总卡片（非日复盘显示） */}
          {activeTab !== 'daily' && periodSummary && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">周期数据汇总</h3>
              <TaskSummaryCard data={periodSummary.tasks} />
              <HabitSummaryCard data={periodSummary.habits} />
              <GoalsSummaryCard data={periodSummary.goals} />
              <ProjectsSummaryCard data={periodSummary.projects} />
            </div>
          )}

          {/* 统计 */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">统计</h3>
            <div className="space-y-3">
              {['daily', 'weekly', 'monthly'].map((p) => (
                <div key={p} className="flex justify-between">
                  <span className="text-gray-500">{p === 'daily' ? '日复盘' : p === 'weekly' ? '周复盘' : '月复盘'}</span>
                  <span className="font-medium">{allReviews.filter(r => r.period === p).length} 篇</span>
                </div>
              ))}
            </div>
          </div>

          {/* 心情曲线和热力图（仅日复盘显示） */}
          {activeTab === 'daily' && (
            <>
              <MoodChart reviews={allReviews} />
              <ReviewHeatmap reviews={allReviews} />
            </>
          )}
        </div>

        {/* 右侧：复盘表单 */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <BookOpen size={20} />
                  {activeTab === 'daily' ? '日复盘' : REVIEW_TEMPLATES[activeTab].title}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {activeTab === 'daily' ? '记录今天的时间线和感受' : REVIEW_TEMPLATES[activeTab].description}
                </p>
              </div>
              {existingReview && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">已保存</span>
              )}
            </div>
            
            {activeTab === 'daily' ? renderDailyForm() : renderFormFields()}
            
            {/* 导出按钮组 */}
            {activeTab === 'daily' && (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={exportToMarkdown}
                  className="flex-1 btn-secondary flex items-center justify-center gap-2 py-2 text-sm"
                >
                  <FileTextIcon size={16} />
                  导出 Markdown
                </button>
                <button
                  onClick={exportToPDF}
                  className="flex-1 btn-secondary flex items-center justify-center gap-2 py-2 text-sm"
                >
                  <Download size={16} />
                  导出 PDF
                </button>
                <button
                  onClick={generateCard}
                  className="flex-1 btn-secondary flex items-center justify-center gap-2 py-2 text-sm"
                >
                  <ImageIcon size={16} />
                  生成卡片
                </button>
              </div>
            )}
            
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full btn-primary flex items-center justify-center gap-2 py-3 mt-6"
            >
              <Save size={20} />
              {saving ? '保存中...' : existingReview ? '更新复盘' : '保存复盘'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
