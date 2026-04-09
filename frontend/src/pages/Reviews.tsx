import { useEffect, useState, useCallback } from 'react';
import { 
  BookOpen, Calendar, Save, ChevronLeft, ChevronRight, 
  TrendingUp, Target, CheckCircle2, Folder, Plus, X, Clock,
  Smile, FileText, CalendarDays, Zap
} from 'lucide-react';
import { reviewsAPI, taskAPI, habitAPI } from '../services/api';
import type { Review, TimelineItem, Task, Habit, HabitLog } from '../types';
import { format, startOfWeek, addDays, getWeek, getYear, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';

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
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${
      type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    }`}>
      {type === 'success' ? <CheckCircle2 size={18} /> : <X size={18} />}
      <span>{message}</span>
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
  const [suggestedItems, setSuggestedItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 加载当天的任务和习惯作为建议
  useEffect(() => {
    const loadSuggestions = async () => {
      setLoading(true);
      try {
        const suggestions: TimelineItem[] = [];
        
        // 获取当天完成的任务
        const tasksRes = await taskAPI.list('today');
        const tasks = tasksRes.data || [];
        tasks.filter((t: Task) => t.status === 'completed').forEach((t: Task) => {
          suggestions.push({
            time: '09:00', // 默认时间
            content: `完成任务: ${t.title}`,
            type: 'task',
            ref_id: t.id
          });
        });

        // 获取当天的习惯打卡
        const today = format(date, 'yyyy-MM-dd');
        try {
          const habitsRes = await habitAPI.list();
          const habits = habitsRes.data || [];
          // 这里简化处理，实际应该获取当天的打卡记录
          habits.slice(0, 3).forEach((h: Habit) => {
            suggestions.push({
              time: '08:00',
              content: `习惯: ${h.name}`,
              type: 'habit',
              ref_id: h.id
            });
          });
        } catch (e) {
          // 忽略习惯加载错误
        }

        setSuggestedItems(suggestions);
      } catch (error) {
        console.error('加载建议失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSuggestions();
  }, [date]);

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

  const addSuggested = (item: TimelineItem) => {
    if (!timeline.some(t => t.content === item.content && t.type === item.type)) {
      const updated = [...timeline, item].sort((a, b) => a.time.localeCompare(b.time));
      onChange(updated);
    }
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

      {/* 建议项 */}
      {suggestedItems.length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">从今日任务和习惯导入:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedItems.slice(0, 5).map((item, idx) => (
              <button
                key={idx}
                onClick={() => addSuggested(item)}
                disabled={timeline.some(t => t.content === item.content && t.type === item.type)}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + {item.content}
              </button>
            ))}
          </div>
        </div>
      )}
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

  // 保存复盘
  const handleSave = async () => {
    setSaving(true);
    try {
      const params = getPeriodParams();
      let data: any;
      
      if (activeTab === 'daily') {
        data = { 
          period: activeTab, 
          ...params, 
          ...dailyForm,
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
      const msg = error.response?.data?.detail || '保存失败，请检查网络';
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
              <div className="text-2xl font-bold text-blue-600">0</div>
              <div className="text-xs text-gray-500">完成任务</div>
            </div>
            <div className="bg-white rounded p-3 text-center">
              <div className="text-2xl font-bold text-green-600">0</div>
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
