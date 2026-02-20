import { useEffect, useState } from 'react';
import { Plus, Check, ChevronLeft, ChevronRight, Settings, Trash2, Edit2 } from 'lucide-react';
import { habitsAPI } from '../services/api';
import { format, addDays, getWeek, getYear } from 'date-fns';

// 图标选项
const ICON_OPTIONS = [
  '✅', '✨', '💪', '🎯', '🏃', '🧘', '💊', '📖', '🌙', '🌞',
  '💧', '🥗', '🛌', '🎵', '📚', '💻', '✍️', '🎨', '🎸', '🏊',
  '🚴', '🧗', '🏋️', '⛹️', '🧘‍♂️', '🧘‍♀️', '🎮', '🎬', '📱', '💰',
  '🌱', '🔥', '⭐', '💎', '🏆', '🎖️', '🌈', '☀️', '⛅', '⚡'
];

// 颜色选项
const COLOR_OPTIONS = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E',
  '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9', '#3B82F6',
  '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#EC4899',
  '#F43F5E', '#78716C', '#52525B', '#71717A', '#0F172A'
];

// 星期几标签
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export default function Habits() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weekData, setWeekData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState<any>(null);
  const [habitForm, setHabitForm] = useState({
    name: '',
    icon: '✅',
    color: '#3B82F6',
    frequency_type: 'daily',
    weekly_target: 7,
    times_per_day: 1,
    custom_schedule: [1, 1, 1, 1, 1, 0, 0],
    allow_overflow: false,
  });
  
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  
  const loadWeekData = async () => {
    try {
      const year = getYear(currentDate);
      const week = getWeek(currentDate, { weekStartsOn: 1 });
      const data = await habitsAPI.getWeekData(year, week);
      setWeekData(data);
    } catch (error) {
      console.error('加载周数据失败:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadWeekData();
  }, [currentDate]);
  
  const changeWeek = (offset: number) => {
    setCurrentDate(addDays(currentDate, offset * 7));
  };
  
  const toggleCheck = async (habitId: number, dateStr: string, currentStatus: any, allowOverflow: boolean) => {
    try {
      if (currentStatus.completed) {
        // 已完成则取消（重置为0）
        await habitsAPI.uncheck(habitId, dateStr);
      } else {
        // 未完成：打卡（设为1，表示当日已完成）
        await habitsAPI.check(habitId, dateStr, 1);
      }
      loadWeekData();
    } catch (error) {
      console.error('打卡失败:', error);
    }
  };
  
  const openAddModal = () => {
    setEditingHabit(null);
    setHabitForm({
      name: '',
      icon: '✅',
      color: '#3B82F6',
      frequency_type: 'flexible',
      weekly_target: 5,
      times_per_day: 1,
      custom_schedule: [1, 1, 1, 1, 1, 0, 0],
      allow_overflow: true,
    });
    setShowModal(true);
  };
  
  const openEditModal = (habit: any) => {
    setEditingHabit(habit);
    setHabitForm({
      name: habit.name,
      icon: habit.icon,
      color: habit.color,
      frequency_type: habit.frequency_type,
      weekly_target: habit.weekly_target || 7,
      times_per_day: habit.times_per_day,
      custom_schedule: habit.custom_schedule || [1, 1, 1, 1, 1, 0, 0],
      allow_overflow: habit.allow_overflow || false,
    });
    setShowModal(true);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingHabit) {
        await habitsAPI.update(editingHabit.id, habitForm);
      } else {
        await habitsAPI.create(habitForm);
      }
      setShowModal(false);
      loadWeekData();
    } catch (error) {
      console.error('保存习惯失败:', error);
    }
  };
  
  const handleDelete = async (id: number) => {
    try {
      await habitsAPI.delete(id);
      setShowDeleteConfirm(null);
      loadWeekData();
    } catch (error) {
      console.error('删除习惯失败:', error);
    }
  };
  
  const isToday = (dateStr: string) => {
    return dateStr === format(new Date(), 'yyyy-MM-dd');
  };
  
  const canEdit = (dateStr: string) => {
    return editMode || isToday(dateStr);
  };
  
  // 获取频次显示文字
  const getFrequencyText = (habit: any) => {
    if (habit.frequency_type === 'flexible') {
      return `一周${habit.weekly_target}次${habit.times_per_day > 1 ? ` · ${habit.times_per_day}次/天` : ''}`;
    }
    if (habit.frequency_type === 'custom' && habit.custom_schedule) {
      const days = habit.custom_schedule.filter((x: number) => x > 0).length;
      return `一周${days}天${habit.times_per_day > 1 ? ` · ${habit.times_per_day}次/天` : ''}`;
    }
    if (habit.frequency_type === 'daily') {
      return habit.times_per_day > 1 ? `每天${habit.times_per_day}次` : '每天';
    }
    if (habit.frequency_type === 'weekdays') {
      return '工作日' + (habit.times_per_day > 1 ? ` · ${habit.times_per_day}次/天` : '');
    }
    if (habit.frequency_type === 'weekends') {
      return '周末' + (habit.times_per_day > 1 ? ` · ${habit.times_per_day}次/天` : '');
    }
    return '每天';
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  
  const weekDates = weekData?.week_dates || [];
  const habits = weekData?.habits || [];
  
  return (
    <div>
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">习惯追踪</h2>
          <p className="text-gray-500 mt-1">本周打卡情况 · 点击打卡</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditMode(!editMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              editMode ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Settings size={18} />
            <span>{editMode ? '退出编辑' : '编辑历史'}</span>
          </button>
          
          <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200">
            <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-gray-100 rounded-l-lg">
              <ChevronLeft size={20} />
            </button>
            <span className="px-4 font-medium text-gray-700 min-w-[150px] text-center">
              {weekDates.length > 0 && (
                `${format(new Date(weekDates[0]), 'MM/dd')} - ${format(new Date(weekDates[6]), 'MM/dd')}`
              )}
            </span>
            <button onClick={() => changeWeek(1)} className="p-2 hover:bg-gray-100 rounded-r-lg">
              <ChevronRight size={20} />
            </button>
          </div>
          
          <button onClick={openAddModal} className="btn-primary flex items-center gap-2">
            <Plus size={20} />
            新建习惯
          </button>
        </div>
      </div>
      
      {/* 周视图表格 */}
      <div className="card overflow-hidden">
        {editMode && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3">
            <p className="text-yellow-800 text-sm">
              ⚠️ 编辑模式已开启：可以修改任意日期的打卡状态
            </p>
          </div>
        )}
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 w-56">习惯</th>
                {WEEKDAYS.map((day, i) => {
                  const dateStr = weekDates[i];
                  const isTodayCol = dateStr && isToday(dateStr);
                  return (
                    <th 
                      key={i} 
                      className={`px-2 py-3 text-center text-sm font-medium w-20 ${
                        isTodayCol 
                          ? 'bg-primary-100 text-primary-700 border-b-2 border-primary-500' 
                          : 'text-gray-600'
                      }`}
                    >
                      <div className={isTodayCol ? 'font-bold' : ''}>{day}</div>
                      <div className={`text-xs ${isTodayCol ? 'text-primary-600' : 'text-gray-400'}`}>
                        {dateStr && format(new Date(dateStr), 'MM/dd')}
                      </div>
                      {isTodayCol && (
                        <div className="text-xs text-primary-600 font-medium mt-1">今天</div>
                      )}
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 w-20">完成率</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {habits.map((item: any) => (
                <tr 
                  key={item.habit.id} 
                  className={`hover:bg-gray-50 transition-colors ${
                    item.is_perfect ? 'bg-green-50/50' : ''
                  }`}
                >
                  {/* 习惯名称 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span 
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                        style={{ backgroundColor: `${item.habit.color}20`, color: item.habit.color }}
                      >
                        {item.habit.icon}
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">{item.habit.name}</p>
                        <p className="text-xs text-gray-500">
                          {getFrequencyText(item.habit)}
                        </p>
                      </div>
                    </div>
                  </td>
                  
                  {/* 七天打卡 */}
                  {item.week_status.map((status: any, idx: number) => {
                    const dateStr = weekDates[idx];
                    const isTodayCol = dateStr && isToday(dateStr);
                    
                    return (
                      <td 
                        key={idx} 
                        className={`px-2 py-3 ${isTodayCol ? 'bg-primary-50/50' : ''}`}
                      >
                        {status.target > 0 || item.habit.allow_overflow ? (
                          <button
                            onClick={() => canEdit(status.date) && toggleCheck(
                              item.habit.id, 
                              status.date, 
                              status, 
                              item.habit.allow_overflow
                            )}
                            disabled={!canEdit(status.date)}
                            className={`w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-all ${
                              status.completed
                                ? 'bg-green-500 text-white shadow-md'
                                : isTodayCol
                                  ? 'bg-primary-100 text-primary-600 border-2 border-primary-400'
                                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                            } ${!canEdit(status.date) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                            title={`${status.date} (${status.actual}/${status.target || '不限'})`}
                          >
                            {status.completed ? (
                              <Check size={18} />
                            ) : (
                              <span className="text-xs">+</span>
                            )}
                          </button>
                        ) : (
                          <div className="w-10 h-10 mx-auto flex items-center justify-center text-gray-300 text-xs">
                            -
                          </div>
                        )}
                      </td>
                    );
                  })}
                  
                  {/* 完成率 */}
                  <td className="px-4 py-3">
                    <div className="text-center">
                      <span className={`text-lg font-bold ${
                        item.is_perfect || item.is_overflow ? 'text-green-600' : 'text-gray-700'
                      }`}>
                        {item.weekly_rate}%
                      </span>
                      {item.is_overflow && (
                        <div className="text-xs text-green-600">超额!</div>
                      )}
                    </div>
                  </td>
                  
                  {/* 操作按钮 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEditModal(item.habit)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="编辑"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(item.habit.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="删除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              
              {habits.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    <p>还没有习惯，点击「新建习惯」开始创建</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* 新建/编辑习惯弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingHabit ? '编辑习惯' : '新建习惯'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input
                  type="text"
                  value={habitForm.name}
                  onChange={(e) => setHabitForm({ ...habitForm, name: e.target.value })}
                  className="input"
                  placeholder="例如：早睡早起"
                  required
                />
              </div>
              
              {/* 图标选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">图标</label>
                <div className="grid grid-cols-10 gap-2 max-h-32 overflow-y-auto p-2 bg-gray-50 rounded-lg">
                  {ICON_OPTIONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setHabitForm({ ...habitForm, icon })}
                      className={`aspect-square flex items-center justify-center text-xl rounded transition-colors ${
                        habitForm.icon === icon
                          ? 'bg-primary-100 ring-2 ring-primary-500'
                          : 'bg-white hover:bg-gray-100'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 颜色选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">颜色</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setHabitForm({ ...habitForm, color })}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        habitForm.color === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              
              {/* 频次类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">频次类型</label>
                <select
                  value={habitForm.frequency_type}
                  onChange={(e) => setHabitForm({ ...habitForm, frequency_type: e.target.value })}
                  className="input"
                >
                  <option value="flexible">灵活次数（不固定日期）</option>
                  <option value="custom">固定日期（可选具体周几）</option>
                  <option value="daily">每天</option>
                  <option value="weekdays">工作日（周一到周五）</option>
                  <option value="weekends">周末（周六周日）</option>
                </select>
              </div>
              
              {/* 灵活模式设置 */}
              {habitForm.frequency_type === 'flexible' && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-700 mb-3">
                    💡 灵活模式：不固定具体哪天，只要本周完成目标次数即可
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      每周目标次数
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={21}
                        value={habitForm.weekly_target}
                        onChange={(e) => setHabitForm({ ...habitForm, weekly_target: parseInt(e.target.value) })}
                        className="flex-1"
                      />
                      <span className="w-12 text-center font-bold text-lg">{habitForm.weekly_target}</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* 固定日期设置 */}
              {habitForm.frequency_type === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    选择固定日期（点击切换）
                  </label>
                  <div className="flex gap-2">
                    {WEEKDAYS.map((day, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const newSchedule = [...habitForm.custom_schedule];
                          newSchedule[i] = newSchedule[i] > 0 ? 0 : 1;
                          setHabitForm({ ...habitForm, custom_schedule: newSchedule });
                        }}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                          habitForm.custom_schedule[i] > 0
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {day.slice(1)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    已选 {habitForm.custom_schedule.filter(x => x > 0).length} 天
                  </p>
                </div>
              )}
              
              {/* 每日次数 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  每日次数
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={habitForm.times_per_day}
                    onChange={(e) => setHabitForm({ ...habitForm, times_per_day: parseInt(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-8 text-center font-medium">{habitForm.times_per_day}</span>
                </div>
              </div>
              
              {/* 预览 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-2">预览</p>
                <div className="flex items-center gap-3">
                  <span 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                    style={{ backgroundColor: `${habitForm.color}20`, color: habitForm.color }}
                  >
                    {habitForm.icon}
                  </span>
                  <div>
                    <p className="font-medium">{habitForm.name || '习惯名称'}</p>
                    <p className="text-xs text-gray-500">
                      {habitForm.frequency_type === 'flexible' 
                        ? `一周${habitForm.weekly_target}次` 
                        : habitForm.frequency_type === 'custom'
                          ? `一周${habitForm.custom_schedule.filter(x => x > 0).length}天`
                          : habitForm.frequency_type === 'daily' ? '每天' : ''
                      }
                      {habitForm.times_per_day > 1 ? ` · ${habitForm.times_per_day}次/天` : ''}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* 按钮 */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 btn-secondary"
                >
                  取消
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  {editingHabit ? '保存修改' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">确认删除？</h3>
            <p className="text-gray-500 mb-6">删除后将无法恢复，该习惯的所有打卡记录也会被删除。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 btn-secondary"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
