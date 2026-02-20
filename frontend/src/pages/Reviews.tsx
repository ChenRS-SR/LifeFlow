import { useEffect, useState } from 'react';
import { BookOpen, Calendar, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { reviewsAPI } from '../services/api';
import type { Review } from '../types';
import { format, startOfWeek, addDays } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export default function Reviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [todayReview, setTodayReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // 日复盘表单
  const [dailyForm, setDailyForm] = useState({
    highlights: '',
    challenges: '',
    learnings: '',
    next_steps: '',
    gratitude: '',
    mood: 5,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [reviewsData, todayData] = await Promise.all([
        reviewsAPI.getAll(),
        reviewsAPI.getTodayDaily(),
      ]);
      setReviews(reviewsData);
      
      if (todayData) {
        setTodayReview(todayData);
        setDailyForm({
          highlights: todayData.highlights || '',
          challenges: todayData.challenges || '',
          learnings: todayData.learnings || '',
          next_steps: todayData.next_steps || '',
          gratitude: todayData.gratitude || '',
          mood: todayData.mood || 5,
        });
      }
    } catch (error) {
      console.error('加载复盘失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDaily = async () => {
    setSaving(true);
    try {
      const today = new Date();
      const data = {
        period: 'daily' as const,
        year: today.getFullYear(),
        month: today.getMonth() + 1,
        date: format(today, 'yyyy-MM-dd'),
        ...dailyForm,
      };

      if (todayReview) {
        await reviewsAPI.update(todayReview.id, data);
      } else {
        await reviewsAPI.create(data);
      }
      loadData();
    } catch (error) {
      console.error('保存复盘失败:', error);
    } finally {
      setSaving(false);
    }
  };

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
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">复盘</h2>
        <p className="text-gray-500 mt-1">记录成长，反思进步</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：日历和快捷入口 */}
        <div className="space-y-6">
          {/* 本周概览 */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Calendar size={20} />
              本周
            </h3>
            <div className="grid grid-cols-7 gap-1 text-center">
              {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
                <div key={day} className="text-xs text-gray-400 py-1">{day}</div>
              ))}
              {weekDays.map((date, i) => {
                const isToday = format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
                const hasReview = reviews.some(
                  r => r.period === 'daily' && r.date === format(date, 'yyyy-MM-dd')
                );
                return (
                  <div
                    key={i}
                    className={`aspect-square flex items-center justify-center text-sm rounded-lg cursor-pointer transition-colors ${
                      isToday
                        ? 'bg-primary-600 text-white'
                        : hasReview
                        ? 'bg-green-100 text-green-700'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    {format(date, 'd')}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 统计 */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">统计</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">日复盘</span>
                <span className="font-medium">
                  {reviews.filter(r => r.period === 'daily').length} 篇
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">周复盘</span>
                <span className="font-medium">
                  {reviews.filter(r => r.period === 'weekly').length} 篇
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">月复盘</span>
                <span className="font-medium">
                  {reviews.filter(r => r.period === 'monthly').length} 篇
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：日复盘表单 */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <BookOpen size={20} />
                日复盘
              </h3>
              <div className="flex items-center gap-2">
                <button className="p-2 hover:bg-gray-100 rounded-lg">
                  <ChevronLeft size={20} />
                </button>
                <span className="text-gray-700">
                  {format(today, 'yyyy年MM月dd日', { locale: zhCN })}
                </span>
                <button className="p-2 hover:bg-gray-100 rounded-lg">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🌟 今日高光 / 成就
                </label>
                <textarea
                  value={dailyForm.highlights}
                  onChange={(e) => setDailyForm({ ...dailyForm, highlights: e.target.value })}
                  className="input"
                  rows={2}
                  placeholder="今天最有成就感的事是什么？"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  💪 遇到的挑战
                </label>
                <textarea
                  value={dailyForm.challenges}
                  onChange={(e) => setDailyForm({ ...dailyForm, challenges: e.target.value })}
                  className="input"
                  rows={2}
                  placeholder="今天遇到什么困难？"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  💡 学到的东西
                </label>
                <textarea
                  value={dailyForm.learnings}
                  onChange={(e) => setDailyForm({ ...dailyForm, learnings: e.target.value })}
                  className="input"
                  rows={2}
                  placeholder="今天有什么新收获？"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📝 下一步行动
                </label>
                <textarea
                  value={dailyForm.next_steps}
                  onChange={(e) => setDailyForm({ ...dailyForm, next_steps: e.target.value })}
                  className="input"
                  rows={2}
                  placeholder="明天打算做什么？"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🙏 感恩事项
                </label>
                <textarea
                  value={dailyForm.gratitude}
                  onChange={(e) => setDailyForm({ ...dailyForm, gratitude: e.target.value })}
                  className="input"
                  rows={2}
                  placeholder="今天有什么值得感恩的？"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  😊 心情评分 (1-10)
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={dailyForm.mood}
                  onChange={(e) => setDailyForm({ ...dailyForm, mood: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-1">
                  <span>😢 1</span>
                  <span className="font-medium text-primary-600">{dailyForm.mood}</span>
                  <span>😄 10</span>
                </div>
              </div>

              <button
                onClick={handleSaveDaily}
                disabled={saving}
                className="w-full btn-primary flex items-center justify-center gap-2 py-3"
              >
                <Save size={20} />
                {saving ? '保存中...' : '保存复盘'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
