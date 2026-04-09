import { useState, useEffect } from 'react';
import { 
  Plus, Calendar, Inbox, CheckCircle2, Circle, Clock, AlertCircle, 
  Folder, List, Edit3, 
  X, Filter, Settings, Trash2, Save, BookOpen,
  ArrowLeft, CheckSquare, ChevronLeft, ChevronRight
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, isPast, parseISO, isWithinInterval } from 'date-fns';
import { taskAPI, projectAPI } from '../services/api';

type ViewType = 'inbox' | 'today' | 'week' | 'overdue' | 'todo' | 'completed' | 'someday' | 'trash' | 'detail' | 'project';
type ProjectTaskFilter = 'all' | 'pending' | 'overdue' | 'completed';

interface Task {
  id: number;
  title: string;
  description?: string;
  task_type: 'schedule' | 'todo' | 'someday' | 'trash' | 'inbox';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 1 | 2 | 3 | 4;
  due_date?: string;
  scheduled_date?: string;
  scheduled_type?: string;
  estimated_pomodoros?: number;
  actual_pomodoros?: number;
  project_id?: number;
  project_name?: string;
  is_inbox: number;
  completed_at?: string;
  created_at: string;
}

interface ProjectGoal {
  id: number;
  project_id: number;
  title: string;
  description?: string;
  is_completed: boolean;
  completed_at?: string;
  sort_order: number;
}

interface Project {
  id: number;
  name: string;
  description?: string;
  status: 'active' | 'completed' | 'on_hold' | 'cancelled' | 'planning' | 'archived';
  progress: number;
  target_date?: string;
  created_at?: string;
  completed_date?: string;
  outline?: string;
  goals?: ProjectGoal[];
  total_tasks: number;
  completed_tasks: number;
}

const PRIORITY_CONFIG = {
  1: { label: '低', color: 'text-gray-500', bg: 'bg-gray-100', border: 'border-gray-200', dot: 'bg-gray-400' },
  2: { label: '中', color: 'text-blue-500', bg: 'bg-blue-100', border: 'border-blue-200', dot: 'bg-blue-400' },
  3: { label: '高', color: 'text-orange-500', bg: 'bg-orange-100', border: 'border-orange-200', dot: 'bg-orange-400' },
  4: { label: '紧急', color: 'text-red-500', bg: 'bg-red-100', border: 'border-red-200', dot: 'bg-red-400' },
};

const TASK_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  schedule: { label: '日程', color: 'text-blue-600', bg: 'bg-blue-50', icon: '📅' },
  todo: { label: '待办', color: 'text-green-600', bg: 'bg-green-50', icon: '✅' },
  someday: { label: '将来也许', color: 'text-purple-600', bg: 'bg-purple-50', icon: '💭' },
  trash: { label: '垃圾箱', color: 'text-red-600', bg: 'bg-red-50', icon: '🗑️' },
  inbox: { label: '未分类', color: 'text-gray-600', bg: 'bg-gray-50', icon: '📥' },
};

const PROJECT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  planning: { label: '规划中', color: 'text-gray-600', bg: 'bg-gray-100' },
  active: { label: '进行中', color: 'text-blue-600', bg: 'bg-blue-100' },
  paused: { label: '暂停', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  completed: { label: '已完成', color: 'text-emerald-600', bg: 'bg-emerald-100' },
  archived: { label: '已归档', color: 'text-gray-400', bg: 'bg-gray-50' },
  on_hold: { label: '暂停', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  cancelled: { label: '已取消', color: 'text-red-600', bg: 'bg-red-100' },
};

const VIEW_CONFIG: Record<ViewType, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  inbox: { label: '收件箱', icon: <Inbox className="w-4 h-4" />, color: 'text-purple-600', desc: '未整理的想法' },
  today: { label: '今天', icon: <Calendar className="w-4 h-4" />, color: 'text-blue-600', desc: '今日待办' },
  week: { label: '本周', icon: <Calendar className="w-4 h-4" />, color: 'text-green-600', desc: '本周日程' },
  overdue: { label: '已逾期', icon: <AlertCircle className="w-4 h-4" />, color: 'text-red-600', desc: '逾期任务' },
  todo: { label: '待办清单', icon: <Circle className="w-4 h-4" />, color: 'text-gray-600', desc: '所有待办' },
  completed: { label: '已完成', icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-600', desc: '已完成任务' },
  someday: { label: '将来也许', icon: <Clock className="w-4 h-4" />, color: 'text-pink-500', desc: '暂不执行的任务' },
  trash: { label: '垃圾箱', icon: <Trash2 className="w-4 h-4" />, color: 'text-red-500', desc: '废弃的任务' },
  detail: { label: '详细视图', icon: <List className="w-4 h-4" />, color: 'text-indigo-600', desc: '详细信息' },
  project: { label: '项目详情', icon: <Folder className="w-4 h-4" />, color: 'text-orange-600', desc: '项目详情' },
};

const AVAILABLE_COLUMNS = [
  { key: 'status', label: '状态', default: true },
  { key: 'title', label: '任务', default: true },
  { key: 'task_type', label: '类型', default: true },
  { key: 'priority', label: '优先级', default: true },
  { key: 'project', label: '项目', default: true },
  { key: 'estimated', label: '预估', default: true },
  { key: 'actual', label: '实际', default: true },
  { key: 'due_date', label: '截止日期', default: true },
  { key: 'scheduled_date', label: '计划日期', default: true },
  { key: 'completed_at', label: '完成时间', default: false },
  { key: 'created_at', label: '创建时间', default: false },
];

export default function Tasks() {
  const [currentView, setCurrentView] = useState<ViewType>('today');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  
  // 项目相关状态
  const [projectTaskFilter, setProjectTaskFilter] = useState<ProjectTaskFilter>('all');
  const [showProjectEditModal, setShowProjectEditModal] = useState(false);
  const [showOutlineModal, setShowOutlineModal] = useState(false);
  const [showCreateProjectTaskModal, setShowCreateProjectTaskModal] = useState(false);
  const [projectEditForm, setProjectEditForm] = useState<Partial<Project>>({});
  const [outlineContent, setOutlineContent] = useState('');
  
  // 项目目标状态
  const [projectGoals, setProjectGoals] = useState<ProjectGoal[]>([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<ProjectGoal | null>(null);
  const [goalForm, setGoalForm] = useState({ title: '', description: '' });
  
  // 项目目标拖拽排序状态
  const [draggedGoalIndex, setDraggedGoalIndex] = useState<number | null>(null);
  const [dragOverGoalIndex, setDragOverGoalIndex] = useState<number | null>(null);
  
  // 本周视图状态
  const [weekOffset, setWeekOffset] = useState(0); // 0=本周, -1=上周, 1=下周
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [weekPickerDate, setWeekPickerDate] = useState('');
  
  // 项目搜索
  const [projectSearch, setProjectSearch] = useState('');
  
  // 筛选状态
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [dateRange, setDateRange] = useState<{start?: string; end?: string}>({});
  
  // 列配置
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    AVAILABLE_COLUMNS.filter(c => c.default).map(c => c.key)
  );
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  
  // 实际番茄钟弹窗
  const [showPomodoroModal, setShowPomodoroModal] = useState(false);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [actualPomodoros, setActualPomodoros] = useState<number | ''>('');
  
  // 任务详情弹窗（可编辑）
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState<Partial<Task>>({});
  
  // 新建任务表单状态
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<1 | 2 | 3 | 4>(2);
  const [newTaskScheduledType, setNewTaskScheduledType] = useState<string>('');
  const [newTaskProjectId, setNewTaskProjectId] = useState<number | ''>('');
  const [newTaskEstimatedPomodoros, setNewTaskEstimatedPomodoros] = useState<number | ''>('');
  const [newTaskType, setNewTaskType] = useState<'schedule' | 'todo' | 'someday' | 'trash' | 'inbox'>('inbox');
  const [newTaskScheduledDate, setNewTaskScheduledDate] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  
  // 项目表单
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectTargetDate, setNewProjectTargetDate] = useState('');

  // 加载数据
  useEffect(() => {
    loadData();
  }, [currentView, selectedProject?.id]);

  // 大纲弹窗打开时立即同步内容，避免延迟
  useEffect(() => {
    if (showOutlineModal && selectedProject) {
      setOutlineContent(selectedProject.outline || '');
    }
  }, [showOutlineModal, selectedProject]);

  // 筛选逻辑
  useEffect(() => {
    if (dateRange.start || dateRange.end) {
      const filtered = allTasks.filter(task => {
        const taskDate = task.due_date || task.scheduled_date;
        if (!taskDate) return false;
        const date = parseISO(taskDate);
        
        if (dateRange.start && dateRange.end) {
          return isWithinInterval(date, { start: parseISO(dateRange.start), end: parseISO(dateRange.end) });
        } else if (dateRange.start) {
          return date >= parseISO(dateRange.start);
        } else if (dateRange.end) {
          return date <= parseISO(dateRange.end);
        }
        return true;
      });
      setTasks(filtered);
    } else {
      setTasks(allTasks);
    }
  }, [dateRange, allTasks]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (currentView === 'project' && selectedProject) {
        const [tasksRes, projectRes] = await Promise.all([
          taskAPI.list('all'),
          projectAPI.get(selectedProject.id)
        ]);
        const projectTasks = tasksRes.data?.filter((t: Task) => t.project_id === selectedProject.id) || [];
        setAllTasks(projectTasks);
        setTasks(projectTasks);
        // 更新选中项目的最新数据（包括大纲）
        setSelectedProject(projectRes.data);
      } else {
        const [tasksRes, projectsRes] = await Promise.all([
          taskAPI.list(currentView === 'detail' || currentView === 'week' ? 'all' : currentView),
          projectAPI.list(),
        ]);
        const loadedTasks = tasksRes.data || [];
        setAllTasks(loadedTasks);
        setTasks(loadedTasks);
        setProjects(projectsRes.data || []);
      }
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // ==================== 项目管理功能 ====================
  const openProjectEdit = () => {
    if (!selectedProject) return;
    setProjectEditForm({
      name: selectedProject.name,
      description: selectedProject.description,
      status: selectedProject.status,
      target_date: selectedProject.target_date,
    });
    setShowProjectEditModal(true);
  };

  const saveProjectEdit = async () => {
    if (!selectedProject) return;
    try {
      const res = await projectAPI.update(selectedProject.id, projectEditForm);
      setSelectedProject({ ...selectedProject, ...res.data });
      setShowProjectEditModal(false);
      loadData();
    } catch (err) {
      console.error('保存项目失败:', err);
    }
  };

  const openOutline = async () => {
    if (!selectedProject) return;
    // 重新获取项目最新数据，确保大纲内容是最新的
    try {
      const res = await projectAPI.get(selectedProject.id);
      const latestProject = res.data;
      setSelectedProject(latestProject);
      setOutlineContent(latestProject.outline || '');
    } catch (err) {
      // 如果获取失败，使用当前数据
      setOutlineContent(selectedProject.outline || '');
    }
    setShowOutlineModal(true);
  };

  const saveOutline = async () => {
    if (!selectedProject) return;
    try {
      const res = await projectAPI.update(selectedProject.id, { outline: outlineContent });
      setSelectedProject({ ...selectedProject, ...res.data });
      setShowOutlineModal(false);
    } catch (err) {
      console.error('保存大纲失败:', err);
    }
  };

  const openCreateProjectTask = () => {
    resetTaskForm();
    if (selectedProject) {
      setNewTaskProjectId(selectedProject.id);
    }
    setShowCreateProjectTaskModal(true);
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    if (!confirm(`确定要删除项目"${selectedProject.name}"吗？`)) return;
    try {
      await projectAPI.delete(selectedProject.id);
      setSelectedProject(null);
      setCurrentView('today');
      loadData();
    } catch (err) {
      console.error('删除项目失败:', err);
    }
  };

  // ==================== 任务完成功能 ====================
  const handleCompleteClick = (task: Task, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (task.status === 'completed') {
      handleComplete(task.id, task.actual_pomodoros || 0);
    } else {
      setCompletingTask(task);
      setActualPomodoros(task.estimated_pomodoros || '');
      setShowPomodoroModal(true);
    }
  };

  const confirmComplete = async () => {
    if (!completingTask) return;
    await handleComplete(completingTask.id, actualPomodoros || 0);
    setShowPomodoroModal(false);
    setCompletingTask(null);
    setActualPomodoros('');
  };

  const handleComplete = async (taskId: number, actualPomos: number) => {
    try {
      await taskAPI.complete(taskId, actualPomos);
      loadData();
    } catch (err) {
      console.error('完成任务失败:', err);
    }
  };

  // ==================== 任务详情编辑功能 ====================
  const openTaskDetail = (task: Task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      description: task.description,
      task_type: task.task_type,
      priority: task.priority,
      due_date: task.due_date,
      scheduled_date: task.scheduled_date,
      estimated_pomodoros: task.estimated_pomodoros,
      actual_pomodoros: task.actual_pomodoros,
      project_id: task.project_id,
      status: task.status,
    });
    setShowDetailModal(true);
  };

  const saveTaskEdit = async () => {
    if (!editingTask) return;
    try {
      await taskAPI.update(editingTask.id, editForm);
      setShowDetailModal(false);
      setEditingTask(null);
      loadData();
    } catch (err) {
      console.error('保存任务失败:', err);
    }
  };

  const handleDelete = async (taskId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm('确定要删除这个任务吗？')) return;
    try {
      await taskAPI.delete(taskId);
      loadData();
    } catch (err) {
      console.error('删除任务失败:', err);
    }
  };

  // ==================== 创建任务 ====================
  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    try {
      await taskAPI.create({
        title: newTaskTitle,
        description: newTaskDescription || undefined,
        task_type: newTaskType,
        scheduled_date: newTaskScheduledDate || undefined,
        priority: newTaskPriority,
        scheduled_type: newTaskScheduledType || undefined,
        due_date: newTaskDueDate || undefined,
        project_id: newTaskProjectId || undefined,
        estimated_pomodoros: newTaskEstimatedPomodoros || undefined,
        is_inbox: currentView === 'inbox' ? 1 : 0,
      });
      
      resetTaskForm();
      setShowCreateModal(false);
      setShowCreateProjectTaskModal(false);
      loadData();
    } catch (err) {
      console.error('创建任务失败:', err);
    }
  };

  const resetTaskForm = () => {
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskPriority(2);
    setNewTaskScheduledType('');
    setNewTaskScheduledDate('');
    setNewTaskDueDate('');
    setNewTaskProjectId('');
    setNewTaskEstimatedPomodoros('');
    setNewTaskType('inbox');
  };

  // ==================== 创建项目 ====================
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      await projectAPI.create({
        name: newProjectName,
        target_date: newProjectTargetDate || undefined,
      });
      setNewProjectName('');
      setNewProjectTargetDate('');
      setShowProjectModal(false);
      // 强制刷新项目列表
      const projectsRes = await projectAPI.list();
      setProjects(projectsRes.data || []);
      loadData();
    } catch (err) {
      console.error('创建项目失败:', err);
    }
  };

  const selectProject = async (project: Project) => {
    setSelectedProject(project);
    setCurrentView('project');
    // 加载项目目标
    try {
      const res = await projectAPI.getGoals(project.id);
      setProjectGoals(res.data || []);
    } catch (err) {
      console.error('加载项目目标失败:', err);
    }
  };

  const backToMain = () => {
    setSelectedProject(null);
    setProjectGoals([]);
    setCurrentView('today');
  };

  // ==================== 项目目标管理 ====================
  const loadProjectGoals = async () => {
    if (!selectedProject) return;
    try {
      const res = await projectAPI.getGoals(selectedProject.id);
      setProjectGoals(res.data || []);
    } catch (err) {
      console.error('加载项目目标失败:', err);
    }
  };

  const openGoalModal = (goal?: ProjectGoal) => {
    if (goal) {
      setEditingGoal(goal);
      setGoalForm({ title: goal.title, description: goal.description || '' });
    } else {
      setEditingGoal(null);
      setGoalForm({ title: '', description: '' });
    }
    setShowGoalModal(true);
  };

  const saveGoal = async () => {
    if (!selectedProject || !goalForm.title.trim()) return;
    try {
      if (editingGoal) {
        await projectAPI.updateGoal(selectedProject.id, editingGoal.id, goalForm);
      } else {
        await projectAPI.createGoal(selectedProject.id, goalForm);
      }
      await loadProjectGoals();
      // 刷新项目数据以更新进度
      const projectRes = await projectAPI.get(selectedProject.id);
      const updatedProject = { ...selectedProject, ...projectRes.data };
      setSelectedProject(updatedProject);
      // 同时更新左侧项目导航栏的进度
      setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, ...projectRes.data } : p));
      setShowGoalModal(false);
      setEditingGoal(null);
      setGoalForm({ title: '', description: '' });
    } catch (err) {
      console.error('保存目标失败:', err);
    }
  };

  const deleteGoal = async (goalId: number) => {
    if (!selectedProject) return;
    if (!confirm('确定要删除这个目标吗？')) return;
    try {
      await projectAPI.deleteGoal(selectedProject.id, goalId);
      await loadProjectGoals();
      // 刷新项目数据以更新进度
      const projectRes = await projectAPI.get(selectedProject.id);
      const updatedProject = { ...selectedProject, ...projectRes.data };
      setSelectedProject(updatedProject);
      // 同时更新左侧项目导航栏的进度
      setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, ...projectRes.data } : p));
    } catch (err) {
      console.error('删除目标失败:', err);
    }
  };

  const toggleGoal = async (goal: ProjectGoal) => {
    if (!selectedProject) return;
    try {
      await projectAPI.toggleGoal(selectedProject.id, goal.id);
      await loadProjectGoals();
      // 刷新项目数据以更新进度
      const projectRes = await projectAPI.get(selectedProject.id);
      const updatedProject = { ...selectedProject, ...projectRes.data };
      setSelectedProject(updatedProject);
      // 同时更新左侧项目导航栏的进度
      setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, ...projectRes.data } : p));
    } catch (err) {
      console.error('切换目标状态失败:', err);
    }
  };

  // ==================== 项目目标拖拽排序 ====================
  const handleGoalDragStart = (e: React.DragEvent, index: number) => {
    setDraggedGoalIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // 设置拖拽时的幽灵图像透明度
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '0.5';
  };

  const handleGoalDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedGoalIndex === null || draggedGoalIndex === index) return;
    setDragOverGoalIndex(index);
  };

  const handleGoalDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '1';
    
    if (draggedGoalIndex === null || draggedGoalIndex === dropIndex) {
      setDraggedGoalIndex(null);
      setDragOverGoalIndex(null);
      return;
    }

    // 重新排序目标列表
    const newGoals = [...projectGoals];
    const [removed] = newGoals.splice(draggedGoalIndex, 1);
    newGoals.splice(dropIndex, 0, removed);
    
    setProjectGoals(newGoals);
    setDraggedGoalIndex(null);
    setDragOverGoalIndex(null);

    // 调用 API 保存排序顺序
    if (selectedProject) {
      try {
        await projectAPI.reorderGoals(selectedProject.id, newGoals.map(g => g.id));
      } catch (err) {
        console.error('保存排序失败:', err);
      }
    }
  };

  const handleGoalDragEnd = (e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '1';
    setDraggedGoalIndex(null);
    setDragOverGoalIndex(null);
  };

  // ==================== Markdown 预览组件 ====================
  const MarkdownPreview = ({ content }: { content: string }) => {
    if (!content) {
      return (
        <div className="flex-1 p-4 overflow-y-auto">
          <p className="text-gray-400 italic text-center mt-20">开始输入 Markdown 内容，此处将显示预览...</p>
        </div>
      );
    }

    // 解析 Markdown 为 HTML
    const parseMarkdown = (text: string): string => {
      let html = text;

      // 代码块 ```code```
      html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-800 text-gray-100 p-3 rounded-lg overflow-x-auto my-3 text-xs font-mono"><code>$2</code></pre>');
      
      // 行内代码 `code`
      html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>');

      // 分割线 --- 或 ***
      html = html.replace(/^\s*[-*]{3,}\s*$/gm, '<hr class="border-t border-gray-200 my-4" />');

      // 勾选框 - [ ] 和 - [x]
      html = html.replace(/^- \[ \] (.*$)/gim, '<div class="flex items-center gap-2 my-1"><span class="w-4 h-4 border-2 border-gray-300 rounded flex-shrink-0"></span><span class="text-gray-700">$1</span></div>');
      html = html.replace(/^- \[x\] (.*$)/gim, '<div class="flex items-center gap-2 my-1"><span class="w-4 h-4 bg-emerald-500 border-2 border-emerald-500 rounded flex-shrink-0 flex items-center justify-center text-white text-xs">✓</span><span class="text-gray-400 line-through">$1</span></div>');

      // 表格 | a | b |
      const tableRegex = /\|(.+)\|\n\|[-\s|]+\|\n((?:\|.+\|\n?)+)/g;
      html = html.replace(tableRegex, (_match, header, rows) => {
        const headers = header.split('|').map((h: string) => h.trim()).filter((h: string) => h);
        const rowData = rows.trim().split('\n').map((row: string) => 
          row.split('|').map((cell: string) => cell.trim()).filter((cell: string) => cell)
        );
        
        let tableHtml = '<table class="w-full border-collapse my-3 text-sm"><thead><tr>';
        headers.forEach((h: string) => {
          tableHtml += `<th class="border border-gray-200 px-3 py-2 bg-gray-50 text-left font-medium text-gray-700">${h}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';
        
        rowData.forEach((row: string[]) => {
          tableHtml += '<tr>';
          row.forEach((cell: string) => {
            tableHtml += `<td class="border border-gray-200 px-3 py-2 text-gray-600">${cell}</td>`;
          });
          tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table>';
        return tableHtml;
      });

      // 标题 # ## ###
      html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold text-gray-800 mt-4 mb-2">$1</h3>');
      html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold text-gray-900 mt-5 mb-3 border-b border-gray-200 pb-1">$1</h2>');
      html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold text-gray-900 mt-4 mb-4">$1</h1>');

      // 粗体 **text**
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900">$1</strong>');
      
      // 斜体 *text*
      html = html.replace(/\*(.*?)\*/g, '<em class="text-gray-600">$1</em>');

      // 有序列表 1. item
      html = html.replace(/^\d+\.\s+(.*$)/gim, '<li class="ml-4 text-gray-700 my-1 list-decimal"><span>$1</span></li>');
      
      // 无序列表 - item（注意：要在勾选框之后处理）
      html = html.replace(/^-\s+(.*$)/gim, '<li class="ml-4 text-gray-700 my-1 list-disc"><span>$1</span></li>');

      // 链接 [text](url)
      html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-blue-600 hover:underline">$1</a>');

      // 段落（处理换行）
      const paragraphs = html.split('\n\n');
      html = paragraphs.map(p => {
        p = p.trim();
        if (!p) return '';
        // 如果已经是HTML标签开头，不包裹
        if (p.startsWith('<') && !p.startsWith('<li')) return p;
        // 如果是列表项，包裹在ul中
        if (p.includes('<li')) {
          const isOrdered = p.includes('list-decimal');
          return `<${isOrdered ? 'ol' : 'ul'} class="${isOrdered ? 'list-decimal' : 'list-disc'} my-2">${p}</${isOrdered ? 'ol' : 'ul'}>`;
        }
        return `<p class="text-gray-700 my-2">${p}</p>`;
      }).join('');

      return html;
    };

    return (
      <div 
        className="flex-1 p-4 overflow-y-auto prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
      />
    );
  };

  // ==================== 渲染组件 ====================
  const renderTaskCard = (task: Task) => (
    <div
      key={task.id}
      onClick={() => openTaskDetail(task)}
      className={`group flex items-start gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
        task.status === 'completed'
          ? 'bg-gray-50 border-gray-200 opacity-70'
          : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'
      }`}
    >
      <button
        onClick={(e) => handleCompleteClick(task, e)}
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          task.status === 'completed'
            ? 'bg-emerald-500 border-emerald-500'
            : 'border-gray-300 hover:border-blue-500'
        }`}
      >
        {task.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
      </button>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <h3 className={`text-sm font-medium ${
            task.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'
          }`}>
            {task.title}
          </h3>
          <span className={`text-xs px-1.5 py-0.5 rounded ${TASK_TYPE_CONFIG[task.task_type]?.bg || 'bg-gray-100'} ${TASK_TYPE_CONFIG[task.task_type]?.color || 'text-gray-600'}`}>
            {TASK_TYPE_CONFIG[task.task_type]?.icon} {TASK_TYPE_CONFIG[task.task_type]?.label || task.task_type}
          </span>
        </div>
        
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          {task.project_name && (
            <span className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded">
              <Folder className="w-3 h-3" />
              {task.project_name}
            </span>
          )}
          {task.estimated_pomodoros && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              预估{task.estimated_pomodoros}🍅
              {task.actual_pomodoros !== undefined && task.actual_pomodoros > 0 && (
                <span className={task.actual_pomodoros > task.estimated_pomodoros ? 'text-orange-500' : 'text-emerald-500'}>
                  (实际{task.actual_pomodoros})
                </span>
              )}
            </span>
          )}
          {task.due_date && (
            <span className={isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date)) && task.status !== 'completed' ? 'text-red-500 font-medium' : ''}>
              截止: {format(parseISO(task.due_date), 'MM/dd')}
            </span>
          )}
          {task.scheduled_date && (
            <span>计划: {format(parseISO(task.scheduled_date), 'MM/dd')}</span>
          )}
        </div>
      </div>
      
      <button
        onClick={(e) => handleDelete(task.id, e)}
        className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  const renderFilterPanel = () => {
    if (!showFilterPanel) return null;
    return (
      <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-50">
        <h3 className="text-sm font-medium text-gray-900 mb-3">时间筛选</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">开始日期</label>
            <input
              type="date"
              value={dateRange.start || ''}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">结束日期</label>
            <input
              type="date"
              value={dateRange.end || ''}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDateRange({})}
              className="flex-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              重置
            </button>
            <button
              onClick={() => setShowFilterPanel(false)}
              className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              应用
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderDetailView = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowColumnSettings(!showColumnSettings)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <Settings className="w-4 h-4" />
          列设置
        </button>
      </div>
      
      {showColumnSettings && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <p className="text-sm text-gray-700 mb-2">选择要显示的列：</p>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_COLUMNS.map(col => (
              <label key={col.key} className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(col.key)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setVisibleColumns([...visibleColumns, col.key]);
                    } else {
                      setVisibleColumns(visibleColumns.filter(k => k !== col.key));
                    }
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-700">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {visibleColumns.includes('status') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-16">状态</th>}
              {visibleColumns.includes('title') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">任务</th>}
              {visibleColumns.includes('task_type') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-20">类型</th>}
              {visibleColumns.includes('priority') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-24">优先级</th>}
              {visibleColumns.includes('project') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">项目</th>}
              {visibleColumns.includes('estimated') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-20">预估</th>}
              {visibleColumns.includes('actual') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-20">实际</th>}
              {visibleColumns.includes('due_date') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-28">截止日期</th>}
              {visibleColumns.includes('scheduled_date') && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-28">计划日期</th>}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-16">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tasks.map((task) => (
              <tr 
                key={task.id} 
                onClick={() => openTaskDetail(task)}
                className={`hover:bg-gray-50 cursor-pointer ${task.status === 'completed' ? 'bg-gray-50/50' : ''}`}
              >
                {visibleColumns.includes('status') && (
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCompleteClick(task); }}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        task.status === 'completed' ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'
                      }`}
                    >
                      {task.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </button>
                  </td>
                )}
                {visibleColumns.includes('title') && (
                  <td className={`px-4 py-3 text-sm ${task.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {task.title}
                  </td>
                )}
                {visibleColumns.includes('task_type') && (
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${TASK_TYPE_CONFIG[task.task_type]?.bg || 'bg-gray-100'} ${TASK_TYPE_CONFIG[task.task_type]?.color || 'text-gray-600'}`}>
                      {TASK_TYPE_CONFIG[task.task_type]?.icon} {TASK_TYPE_CONFIG[task.task_type]?.label || task.task_type}
                    </span>
                  </td>
                )}
                {visibleColumns.includes('priority') && (
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${PRIORITY_CONFIG[task.priority].bg} ${PRIORITY_CONFIG[task.priority].color}`}>
                      {PRIORITY_CONFIG[task.priority].label}
                    </span>
                  </td>
                )}
                {visibleColumns.includes('project') && (
                  <td className="px-4 py-3 text-sm text-gray-500">{task.project_name || '-'}</td>
                )}
                {visibleColumns.includes('estimated') && (
                  <td className="px-4 py-3 text-sm text-gray-500">{task.estimated_pomodoros || '-'}</td>
                )}
                {visibleColumns.includes('actual') && (
                  <td className="px-4 py-3 text-sm text-gray-500">{task.actual_pomodoros || '-'}</td>
                )}
                {visibleColumns.includes('due_date') && (
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {task.due_date ? format(parseISO(task.due_date), 'yyyy-MM-dd') : '-'}
                  </td>
                )}
                {visibleColumns.includes('scheduled_date') && (
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {task.scheduled_date ? format(parseISO(task.scheduled_date), 'yyyy-MM-dd') : '-'}
                  </td>
                )}
                <td className="px-4 py-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(task.id, e); }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && (
          <div className="text-center py-16 text-gray-500">暂无任务</div>
        )}
      </div>
    </div>
  );

  const renderProjectView = () => {
    if (!selectedProject) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let filteredTasks = tasks;
    if (projectTaskFilter === 'pending') {
      // 进行中：未逾期且未完成（当前日期 <= 截止日期）
      filteredTasks = tasks.filter(t => {
        if (t.status === 'completed') return false;
        if (!t.due_date) return true; // 无截止日期的视为进行中
        const dueDate = new Date(t.due_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate >= today;
      });
    } else if (projectTaskFilter === 'overdue') {
      // 已逾期：已逾期且未完成（当前日期 > 截止日期）
      filteredTasks = tasks.filter(t => {
        if (t.status === 'completed') return false;
        if (!t.due_date) return false;
        const dueDate = new Date(t.due_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < today;
      });
    } else if (projectTaskFilter === 'completed') {
      filteredTasks = tasks.filter(t => t.status === 'completed');
    }
    
    // 按重要程度排序（priority 降序：4最高 -> 1最低）
    filteredTasks = filteredTasks.sort((a, b) => b.priority - a.priority);
    const statusConfig = PROJECT_STATUS_CONFIG[selectedProject.status] || PROJECT_STATUS_CONFIG.active;
    
    return (
      <div className="space-y-6">
        <button onClick={backToMain} className="flex items-center gap-2 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>
        
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-6 text-white">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold">{selectedProject.name}</h2>
                <span className={`px-2 py-1 rounded text-xs ${statusConfig.bg} ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
              {selectedProject.description && <p className="mt-2 text-blue-100">{selectedProject.description}</p>}
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{Math.round(selectedProject.progress)}%</div>
              <div className="text-sm text-blue-100">完成度</div>
            </div>
          </div>
          <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full" style={{ width: `${selectedProject.progress}%` }} />
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={openCreateProjectTask} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" />
            新建任务
          </button>
          <button onClick={openProjectEdit} className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            <Edit3 className="w-4 h-4" />
            编辑项目
          </button>
          <button onClick={openOutline} className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">
            <BookOpen className="w-4 h-4" />
            项目大纲
          </button>
          <button onClick={handleDeleteProject} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 ml-auto">
            <Trash2 className="w-4 h-4" />
            删除项目
          </button>
        </div>
        
        {/* 项目目标和项目任务 - 左右分栏布局 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：项目目标/里程碑 (占1/3) */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-blue-500" />
                  项目目标
                </h3>
                <span className="text-[10px] text-gray-400" title="按住目标可拖拽排序">💡拖拽</span>
              </div>
              <button 
                onClick={() => openGoalModal()} 
                className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
              >
                <Plus className="w-3 h-3" />
                添加
              </button>
            </div>
            
            {projectGoals.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm bg-gray-50 rounded-lg">
                暂无目标
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {projectGoals.map((goal, index) => (
                <div 
                  key={goal.id} 
                  draggable
                  onDragStart={(e) => handleGoalDragStart(e, index)}
                  onDragOver={(e) => handleGoalDragOver(e, index)}
                  onDrop={(e) => handleGoalDrop(e, index)}
                  onDragEnd={handleGoalDragEnd}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-move ${
                    goal.is_completed ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-blue-300'
                  } ${dragOverGoalIndex === index && draggedGoalIndex !== index ? 'border-blue-400 border-dashed transform scale-[1.02]' : ''}`}
                >
                  <button
                    onClick={() => toggleGoal(goal)}
                    className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      goal.is_completed ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-blue-500'
                    }`}
                  >
                    {goal.is_completed && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${goal.is_completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {goal.title}
                    </p>
                    {goal.description && (
                      <p className={`text-xs mt-1 ${goal.is_completed ? 'text-gray-300' : 'text-gray-500'}`}>
                        {goal.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => openGoalModal(goal)}
                      className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => deleteGoal(goal.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* 目标完成统计 */}
          {projectGoals.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  已完成 {projectGoals.filter(g => g.is_completed).length} / {projectGoals.length} 个目标
                </span>
                <span className="text-blue-600 font-medium">
                  {Math.round((projectGoals.filter(g => g.is_completed).length / projectGoals.length) * 100)}%
                </span>
              </div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${(projectGoals.filter(g => g.is_completed).length / projectGoals.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

          {/* 右侧：项目任务 (占2/3) */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-medium text-gray-900">项目任务</h3>
              <span className="text-xs text-gray-500">
                共 <span className="font-medium text-gray-700">{tasks.length}</span> 个
                {tasks.filter(t => t.status === 'completed').length > 0 && (
                  <>, 已完成 <span className="font-medium text-emerald-600">{tasks.filter(t => t.status === 'completed').length}</span> 个</>
                )}
              </span>
              <div className="flex-1" />
              {(['all', 'pending', 'overdue', 'completed'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setProjectTaskFilter(filter)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    projectTaskFilter === filter ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {filter === 'all' ? '全部' : filter === 'pending' ? '进行中' : filter === 'overdue' ? '已逾期' : '已完成'}
                </button>
              ))}
            </div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl">该项目暂无任务</div>
              ) : (
                filteredTasks.map(renderTaskCard)
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTodayView = () => {
    const today = new Date();
    const todayStr = format(today, 'yyyy年MM月dd日');
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][today.getDay()];
    
    // 按优先级和状态分组
    const urgentTasks = tasks.filter(t => t.priority === 4 && t.status !== 'completed');
    const importantTasks = tasks.filter(t => t.priority === 3 && t.status !== 'completed');
    const normalTasks = tasks.filter(t => [1, 2].includes(t.priority) && t.status !== 'completed');
    const completedTasks = tasks.filter(t => t.status === 'completed');
    
    const pendingCount = urgentTasks.length + importantTasks.length + normalTasks.length;
    const completedCount = completedTasks.length;
    const totalCount = tasks.length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    
    // 按截止时间排序的辅助函数
    const sortByDueDate = (a: Task, b: Task) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime();
    };
    
    const renderTaskSection = (title: string, taskList: Task[], colorClass: string, icon: string) => {
      if (taskList.length === 0) return null;
      
      return (
        <div className="mb-6">
          <div className={`flex items-center gap-2 mb-3 px-4 py-2 rounded-lg ${colorClass}`}>
            <span className="text-lg">{icon}</span>
            <h3 className="font-medium">{title}</h3>
            <span className="ml-auto text-sm opacity-70">{taskList.length}个</span>
          </div>
          <div className="space-y-2">
            {[...taskList].sort(sortByDueDate).map(task => (
              <div key={task.id} onClick={() => openTaskDetail(task)} className="cursor-pointer">
                {renderTaskCard(task)}
              </div>
            ))}
          </div>
        </div>
      );
    };
    
    return (
      <div className="max-w-3xl">
        {/* 今日概览卡片 */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-6 text-white mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold">{todayStr}</h2>
              <p className="text-blue-100 mt-1">{weekday} · 今日待办</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{progress}%</div>
              <div className="text-sm text-blue-100">完成进度</div>
            </div>
          </div>
          
          <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <div className="mt-4 flex gap-6 text-sm">
            <div>
              <span className="text-blue-100">今日任务</span>
              <span className="ml-2 text-xl font-bold">{totalCount}</span>
            </div>
            <div>
              <span className="text-blue-100">待完成</span>
              <span className="ml-2 text-xl font-bold">{pendingCount}</span>
            </div>
            <div>
              <span className="text-blue-100">已完成</span>
              <span className="ml-2 text-xl font-bold">{completedCount}</span>
            </div>
          </div>
        </div>
        
        {/* 任务分组 */}
        {pendingCount === 0 && completedCount === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-blue-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">今天暂无任务</h3>
            <p className="text-gray-500 text-sm">享受美好的一天，或者新建一个任务开始工作</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* 紧急事项 */}
            {renderTaskSection('🔥 紧急事项', urgentTasks, 'bg-red-50 text-red-700', '🔥')}
            
            {/* 重要事项 */}
            {renderTaskSection('⚠️ 重要事项', importantTasks, 'bg-orange-50 text-orange-700', '⚠️')}
            
            {/* 普通待办 */}
            {renderTaskSection('✅ 普通待办', normalTasks, 'bg-blue-50 text-blue-700', '✅')}
            
            {/* 已完成（可折叠） */}
            {completedCount > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-200">
                <details className="group">
                  <summary className="flex items-center gap-2 cursor-pointer text-gray-500 hover:text-gray-700">
                    <span className="text-lg">✓</span>
                    <span className="font-medium">已完成 ({completedCount})</span>
                    <span className="ml-auto text-xs group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="mt-3 space-y-2 opacity-60">
                    {completedTasks.map(task => (
                      <div key={task.id} onClick={() => openTaskDetail(task)} className="cursor-pointer">
                        {renderTaskCard(task)}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderWeekView = () => {
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + weekOffset * 7);
    const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
    
    // 获取任务的计划日期（用于周视图显示）
    // 优先使用 scheduled_date（计划执行日期），如果没有则使用 due_date（截止日期）
    const getTaskScheduledDate = (task: Task): string | null => task.scheduled_date || task.due_date || null;
    
    // 获取任务的截止日期
    const getTaskDueDate = (task: Task): string | null => task.due_date || null;
    
    // 逾期任务：截止日期在本周开始之前且未完成的
    const overdueTasks = tasks.filter(t => {
      if (t.status === 'completed') return false; // 已完成的不是逾期
      const dueDateStr = getTaskDueDate(t);
      if (!dueDateStr) return false;
      const due = parseISO(dueDateStr);
      // 逾期：截止日期 < 本周开始时间 且 不是今天（今天的在正常任务里）
      return due < weekStart && !isToday(due);
    });
    
    // 本周范围内的任务：根据计划日期（scheduled_date 或 due_date）判断是否显示在本周
    const weekTasks = tasks.filter(t => {
      const scheduledDateStr = getTaskScheduledDate(t);
      if (!scheduledDateStr) return false;
      const scheduledDate = parseISO(scheduledDateStr);
      return scheduledDate >= weekStart && scheduledDate <= weekEnd;
    });
    
    const isCurrentWeek = weekOffset === 0;
    const weekNumber = format(weekStart, 'w');
    
    // 处理周选择
    const handleWeekSelect = (dateStr: string) => {
      if (!dateStr) return;
      const selected = parseISO(dateStr);
      const now = new Date();
      const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
      const selectedWeekStart = startOfWeek(selected, { weekStartsOn: 1 });
      const diffDays = Math.round((selectedWeekStart.getTime() - currentWeekStart.getTime()) / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.round(diffDays / 7);
      setWeekOffset(diffWeeks);
      setShowWeekPicker(false);
    };

    return (
      <div className="space-y-4">
        {/* 周导航栏 */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setWeekOffset(weekOffset - 1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="上一周"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            
            <div className="text-center min-w-[200px]">
              <h3 className="text-lg font-bold text-gray-900">
                {isCurrentWeek ? '本周' : `${format(weekStart, 'MM月dd日')} - ${format(weekEnd, 'MM月dd日')}`}
              </h3>
              <p className="text-sm text-gray-500">
                {format(weekStart, 'yyyy年')} 第{weekNumber}周
                {isCurrentWeek && <span className="ml-2 text-blue-600 font-medium">(当前)</span>}
              </p>
            </div>
            
            <button 
              onClick={() => setWeekOffset(weekOffset + 1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="下一周"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset(0)}
              disabled={isCurrentWeek}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                isCurrentWeek 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
            >
              回到本周
            </button>
            
            <div className="relative">
              <button
                onClick={() => setShowWeekPicker(!showWeekPicker)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
              >
                <Calendar className="w-4 h-4" />
                选择日期
              </button>
              
              {showWeekPicker && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-50 min-w-[280px]">
                  <p className="text-sm font-medium text-gray-700 mb-3">选择任意日期跳转到该周</p>
                  <input
                    type="date"
                    value={weekPickerDate}
                    onChange={(e) => {
                      setWeekPickerDate(e.target.value);
                      handleWeekSelect(e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <button
                    onClick={() => setShowWeekPicker(false)}
                    className="mt-3 w-full px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* 任务统计 */}
        <div className="flex gap-4 text-sm">
          <div className="px-4 py-2 bg-blue-50 rounded-lg">
            <span className="text-gray-600">本周任务:</span>
            <span className="ml-2 font-bold text-blue-600">{weekTasks.length}</span>
          </div>
          <div className="px-4 py-2 bg-red-50 rounded-lg">
            <span className="text-gray-600">逾期:</span>
            <span className="ml-2 font-bold text-red-600">{overdueTasks.filter(t => t.status !== 'completed').length}</span>
          </div>
          <div className="px-4 py-2 bg-emerald-50 rounded-lg">
            <span className="text-gray-600">已完成:</span>
            <span className="ml-2 font-bold text-emerald-600">{weekTasks.filter(t => t.status === 'completed').length}</span>
          </div>
        </div>
        
        {/* 周视图网格 */}
        <div className="grid grid-cols-8 gap-3">
          {/* 逾期任务列 */}
          <div className="min-h-[200px]">
            <div className="text-center py-2 rounded-t-lg bg-red-100">
              <p className="text-xs text-red-600 font-medium">逾期</p>
              <p className="text-xs text-red-500 mt-0.5">{overdueTasks.length}个</p>
            </div>
            <div className="p-2 space-y-2 border border-t-0 border-red-200 rounded-b-lg min-h-[200px] bg-red-50/30">
              {overdueTasks.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">无逾期</p>
              ) : (
                overdueTasks.map(task => (
                  <div 
                    key={task.id} 
                    className={`text-xs p-2.5 rounded-lg border cursor-pointer transition-all ${
                      task.status === 'completed' 
                        ? 'bg-gray-100 border-gray-200 opacity-50' 
                        : 'bg-white border-red-300 hover:border-red-500 hover:shadow-md'
                    }`}
                  >
                    {/* 第一行：勾选框 + 标题 */}
                    <div className="flex items-start gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleCompleteClick(task); }}
                        className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors mt-0.5 ${
                          task.status === 'completed' 
                            ? 'bg-emerald-500 border-emerald-500' 
                            : 'border-gray-300 hover:border-emerald-500 bg-white'
                        }`}
                      >
                        {task.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </button>
                      <div 
                        onClick={() => openTaskDetail(task)}
                        className={`flex-1 min-w-0 ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'}`}
                      >
                        <div className="font-medium leading-tight mb-1.5">{task.title}</div>
                        
                        {/* 第二行：类型 + 优先级标签 */}
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${TASK_TYPE_CONFIG[task.task_type]?.bg || 'bg-gray-100'}`}>
                            {TASK_TYPE_CONFIG[task.task_type]?.icon}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_CONFIG[task.priority].bg} ${PRIORITY_CONFIG[task.priority].color}`}>
                            {PRIORITY_CONFIG[task.priority].label}
                          </span>
                          {task.status === 'completed' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600">已完成</span>
                          )}
                        </div>
                        
                        {/* 第三行：项目 + 番茄钟 + 逾期日期 */}
                        <div className="flex items-center justify-between text-[10px] text-gray-500">
                          <div className="flex items-center gap-1.5">
                            {task.project_name && (
                              <span className="flex items-center gap-0.5 text-gray-400">
                                <Folder className="w-3 h-3" />
                                <span className="truncate max-w-[60px]">{task.project_name}</span>
                              </span>
                            )}
                            {task.estimated_pomodoros && (
                              <span className="text-orange-500">🍅{task.estimated_pomodoros}</span>
                            )}
                          </div>
                          <span className="text-red-500 font-medium">{format(parseISO(task.due_date!), 'MM/dd')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* 周一至周日 */}
          {weekDays.map((day, index) => {
            const dayTasks = tasks.filter(t => {
              const scheduledDate = getTaskScheduledDate(t);
              return scheduledDate && isSameDay(parseISO(scheduledDate), day);
            });
            const isTodayDate = isToday(day);
            
            return (
              <div key={index} className="min-h-[200px]">
                <div className={`text-center py-2 rounded-t-lg ${isTodayDate ? 'bg-blue-100' : 'bg-gray-50'}`}>
                  <p className={`text-xs ${isTodayDate ? 'text-blue-600' : 'text-gray-500'}`}>{['一','二','三','四','五','六','日'][index]}</p>
                  <p className={`text-lg font-medium ${isTodayDate ? 'text-blue-600' : 'text-gray-900'}`}>{format(day, 'd')}</p>
                  <p className="text-[10px] mt-0.5 text-gray-400">{dayTasks.length}个</p>
                </div>
                <div className="p-2 space-y-2 border border-t-0 border-gray-200 rounded-b-lg min-h-[200px]">
                  {dayTasks.map(task => (
                    <div 
                      key={task.id} 
                      className={`text-xs p-2 rounded-lg border cursor-pointer transition-all overflow-hidden ${
                        task.status === 'completed' 
                          ? 'bg-gray-50 border-gray-200 opacity-50' 
                          : `${PRIORITY_CONFIG[task.priority].bg} ${PRIORITY_CONFIG[task.priority].border} hover:shadow-md`
                      }`}
                    >
                      {/* 第一行：勾选框 + 标题 */}
                      <div className="flex items-start gap-1.5">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleCompleteClick(task); }}
                          className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors mt-0.5 ${
                            task.status === 'completed' 
                              ? 'bg-emerald-500 border-emerald-500' 
                              : 'border-gray-300 hover:border-emerald-500 bg-white'
                          }`}
                        >
                          {task.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </button>
                        <div 
                          onClick={() => openTaskDetail(task)}
                          className={`flex-1 min-w-0 ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'}`}
                        >
                          <div className="font-medium leading-tight mb-1 truncate">{task.title}</div>
                          
                          {/* 第二行：类型 + 优先级标签 */}
                          <div className="flex flex-wrap gap-1 mb-1">
                            <span className={`text-[10px] px-1 py-0.5 rounded ${TASK_TYPE_CONFIG[task.task_type]?.bg || 'bg-gray-100'}`}>
                              {TASK_TYPE_CONFIG[task.task_type]?.icon}
                            </span>
                            <span className={`text-[10px] px-1 py-0.5 rounded ${PRIORITY_CONFIG[task.priority].bg} ${PRIORITY_CONFIG[task.priority].color}`}>
                              {PRIORITY_CONFIG[task.priority].label}
                            </span>
                            {task.status === 'completed' && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-600">已完成</span>
                            )}
                          </div>
                          
                          {/* 第三行：项目 + 番茄钟 + 截止日期 - 使用flex-wrap防止溢出 */}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500">
                            {task.project_name && (
                              <span className="flex items-center gap-0.5 text-gray-400 truncate max-w-[70px]">
                                <Folder className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{task.project_name}</span>
                              </span>
                            )}
                            {task.estimated_pomodoros && (
                              <span className="text-orange-500 whitespace-nowrap">🍅{task.estimated_pomodoros}</span>
                            )}
                            {task.due_date && !isSameDay(parseISO(task.due_date), day) && (
                              <span className="text-red-400 whitespace-nowrap">截止{format(parseISO(task.due_date), 'MM/dd')}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {dayTasks.length === 0 && <p className="text-xs text-gray-300 text-center py-4">无任务</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex gap-6">
      {/* 左侧边栏 */}
      <div className="w-56 flex-shrink-0 space-y-6">
        <button onClick={() => setShowCreateModal(true)} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700">
          <Plus className="w-4 h-4" />
          新建任务
        </button>
        
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-400 uppercase px-3 mb-2">视图</p>
          {(['inbox', 'today', 'week', 'overdue', 'todo', 'completed', 'someday', 'trash', 'detail'] as ViewType[]).map((view) => (
            <button
              key={view}
              onClick={() => { setCurrentView(view); setSelectedProject(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${currentView === view ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <span className={currentView === view ? VIEW_CONFIG[view].color : 'text-gray-400'}>{VIEW_CONFIG[view].icon}</span>
              <span>{VIEW_CONFIG[view].label}</span>
            </button>
          ))}
        </div>
        
        <div className="flex flex-col min-h-0">
          <div className="flex items-center justify-between px-3 mb-2">
            <p className="text-xs font-medium text-gray-400 uppercase">项目</p>
            <button onClick={() => setShowProjectModal(true)} className="text-blue-600 hover:text-blue-700"><Plus className="w-4 h-4" /></button>
          </div>
          
          {/* 项目搜索框 */}
          <div className="px-3 mb-2">
            <div className="relative">
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="搜索项目..."
                className="w-full px-3 py-1.5 pl-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {projectSearch && (
                <button
                  onClick={() => setProjectSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          
          {/* 项目列表 - 带滚动条 */}
          <div className="overflow-y-auto max-h-[calc(100vh-400px)] space-y-1 px-1">
            {projects
              .filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase()))
              .map((project) => (
                <div key={project.id} onClick={() => selectProject(project)} className={`px-3 py-2 rounded-lg cursor-pointer ${selectedProject?.id === project.id && currentView === 'project' ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-100'}`}>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Folder className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="flex-1 truncate" title={project.name}>{project.name}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${project.progress}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">{Math.round(project.progress)}%</span>
                  </div>
                </div>
              ))}
            {projects.filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase())).length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">
                {projectSearch ? '未找到匹配的项目' : '暂无项目'}
              </p>
            )}
          </div>
        </div>
      </div>
      
      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span className={VIEW_CONFIG[currentView].color}>{VIEW_CONFIG[currentView].icon}</span>
            {currentView === 'project' && selectedProject ? selectedProject.name : VIEW_CONFIG[currentView].label}
          </h1>
          {['overdue', 'todo', 'completed', 'detail'].includes(currentView) && (
            <div className="relative">
              <button onClick={() => setShowFilterPanel(!showFilterPanel)} className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                <Filter className="w-4 h-4" />
                筛选
              </button>
              {renderFilterPanel()}
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
          ) : currentView === 'today' ? (
            renderTodayView()
          ) : currentView === 'week' ? (
            renderWeekView()
          ) : currentView === 'detail' ? (
            renderDetailView()
          ) : currentView === 'project' ? (
            renderProjectView()
          ) : (
            <div className="max-w-3xl space-y-3">
              {tasks.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">{VIEW_CONFIG[currentView].icon}</div>
                  <h3 className="text-lg font-medium text-gray-900">暂无任务</h3>
                </div>
              ) : (
                tasks.map(renderTaskCard)
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* 完成任务弹窗（输入实际番茄钟） */}
      {showPomodoroModal && completingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80">
            <h2 className="text-lg font-bold mb-2">完成任务</h2>
            <p className="text-gray-500 text-sm mb-4">{completingTask.title}</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                实际花费番茄钟数
                {completingTask.estimated_pomodoros && (
                  <span className="text-gray-400 font-normal ml-1">(预估 {completingTask.estimated_pomodoros} 个)</span>
                )}
              </label>
              <input 
                type="number" 
                value={actualPomodoros} 
                onChange={(e) => setActualPomodoros(e.target.value ? Number(e.target.value) : '')} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500" 
                placeholder="输入实际番茄钟数" 
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowPomodoroModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={confirmComplete} disabled={!actualPomodoros} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">确认完成</button>
            </div>
          </div>
        </div>
      )}
      
      {/* 任务详情/编辑弹窗 */}
      {showDetailModal && editingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">编辑任务</h2>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                <input type="text" value={editForm.title || ''} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea value={editForm.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">任务类型</label>
                  <select 
                    value={editForm.task_type || 'inbox'} 
                    onChange={(e) => setEditForm({ ...editForm, task_type: e.target.value as any })} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="inbox">📥 未分类</option>
                    <option value="schedule">📅 日程</option>
                    <option value="todo">✅ 待办</option>
                    <option value="someday">💭 将来也许</option>
                    <option value="trash">🗑️ 垃圾箱</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
                  <select value={editForm.priority || 2} onChange={(e) => setEditForm({ ...editForm, priority: Number(e.target.value) as any })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    <option value={1}>低</option>
                    <option value={2}>中</option>
                    <option value={3}>高</option>
                    <option value={4}>紧急</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所属项目</label>
                <select value={editForm.project_id || ''} onChange={(e) => setEditForm({ ...editForm, project_id: e.target.value ? Number(e.target.value) : undefined })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="">无</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">截止日期</label>
                  <input type="date" value={editForm.due_date || ''} onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">计划日期</label>
                  <input type="date" value={editForm.scheduled_date || ''} onChange={(e) => setEditForm({ ...editForm, scheduled_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">预估番茄钟</label>
                  <input type="number" value={editForm.estimated_pomodoros || ''} onChange={(e) => setEditForm({ ...editForm, estimated_pomodoros: e.target.value ? Number(e.target.value) : undefined })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">实际番茄钟</label>
                  <input type="number" value={editForm.actual_pomodoros || ''} onChange={(e) => setEditForm({ ...editForm, actual_pomodoros: e.target.value ? Number(e.target.value) : undefined })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowDetailModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={saveTaskEdit} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Save className="w-4 h-4" />
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 新建任务弹窗 - 完整字段 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-4">新建任务</h2>
            
            <div className="space-y-4">
              {/* 标题 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">任务标题 *</label>
                <input 
                  type="text" 
                  value={newTaskTitle} 
                  onChange={(e) => setNewTaskTitle(e.target.value)} 
                  placeholder="输入任务标题" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500" 
                  autoFocus 
                />
              </div>
              
              {/* 描述 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">任务描述</label>
                <textarea 
                  value={newTaskDescription} 
                  onChange={(e) => setNewTaskDescription(e.target.value)} 
                  placeholder="输入任务描述（可选）" 
                  rows={3} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500" 
                />
              </div>
              
              {/* 任务类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">任务类型</label>
                <select 
                  value={newTaskType} 
                  onChange={(e) => setNewTaskType(e.target.value as 'schedule' | 'todo' | 'someday' | 'trash' | 'inbox')} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="schedule">📅 日程（有明确日期）</option>
                  <option value="todo">✅ 待办（需要完成）</option>
                  <option value="someday">💭 将来也许</option>
                  <option value="trash">🗑️ 垃圾箱</option>
                  <option value="inbox">📥 未分类</option>
                </select>
              </div>

              {/* 优先级 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
                <select 
                  value={newTaskPriority} 
                  onChange={(e) => setNewTaskPriority(Number(e.target.value) as 1 | 2 | 3 | 4)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value={1}>低</option>
                  <option value={2}>中</option>
                  <option value={3}>高</option>
                  <option value={4}>紧急</option>
                </select>
              </div>
              
              {/* 截止日期、计划日期和预估番茄钟 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">截止日期</label>
                  <input 
                    type="date" 
                    value={newTaskDueDate} 
                    onChange={(e) => setNewTaskDueDate(e.target.value)} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">计划日期</label>
                  <input 
                    type="date" 
                    value={newTaskScheduledDate} 
                    onChange={(e) => setNewTaskScheduledDate(e.target.value)} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">预估番茄钟</label>
                  <input 
                    type="number" 
                    min={1}
                    value={newTaskEstimatedPomodoros} 
                    onChange={(e) => setNewTaskEstimatedPomodoros(e.target.value ? Number(e.target.value) : '')} 
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              
              {/* 所属项目 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所属项目</label>
                <select 
                  value={newTaskProjectId} 
                  onChange={(e) => setNewTaskProjectId(e.target.value ? Number(e.target.value) : '')} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">无</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={handleCreateTask} disabled={!newTaskTitle.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">创建</button>
            </div>
          </div>
        </div>
      )}
      
      {/* 新建项目弹窗 */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96">
            <h2 className="text-lg font-bold text-gray-900 mb-4">新建项目</h2>
            <input type="text" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="项目名称" className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4" />
            <input type="date" value={newProjectTargetDate} onChange={(e) => setNewProjectTargetDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowProjectModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={handleCreateProject} disabled={!newProjectName.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">创建</button>
            </div>
          </div>
        </div>
      )}
      
      {/* 项目编辑弹窗 */}
      {showProjectEditModal && selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96">
            <h2 className="text-lg font-bold text-gray-900 mb-4">编辑项目</h2>
            <div className="space-y-4">
              <input type="text" value={projectEditForm.name || ''} onChange={(e) => setProjectEditForm({ ...projectEditForm, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <textarea value={projectEditForm.description || ''} onChange={(e) => setProjectEditForm({ ...projectEditForm, description: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <select value={projectEditForm.status || ''} onChange={(e) => setProjectEditForm({ ...projectEditForm, status: e.target.value as any })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="planning">规划中</option>
                <option value="active">进行中</option>
                <option value="paused">暂停</option>
                <option value="completed">已完成</option>
                <option value="archived">已归档</option>
              </select>
              <input type="date" value={projectEditForm.target_date || ''} onChange={(e) => setProjectEditForm({ ...projectEditForm, target_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowProjectEditModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={saveProjectEdit} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">保存</button>
            </div>
          </div>
        </div>
      )}
      
      {/* 大纲编辑弹窗 - 优化版：左右分栏，实时预览 */}
      {showOutlineModal && selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-5xl h-[85vh] flex flex-col">
            {/* 头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-purple-600" />
                  项目大纲
                  <span className="text-sm font-normal text-gray-500">- {selectedProject.name}</span>
                </h2>
                <p className="text-xs text-gray-500 mt-1">左侧编辑 Markdown，右侧实时预览。支持 # 标题、- 列表、**粗体** 等语法。</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setOutlineContent('')}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                  title="清空内容"
                >
                  清空
                </button>
                <button onClick={() => setShowOutlineModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* 主体：左右分栏 */}
            <div className="flex-1 flex overflow-hidden">
              {/* 左侧：编辑器 */}
              <div className="flex-1 flex flex-col border-r border-gray-200">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 flex items-center justify-between">
                  <span>📝 Markdown 编辑（支持 #标题 **粗体** `代码` -[]勾选框 |表格| ）</span>
                  <div className="flex gap-1">
                    <button onClick={() => setOutlineContent(v => v + '# 标题\n')} className="px-2 py-0.5 hover:bg-gray-200 rounded" title="标题">#</button>
                    <button onClick={() => setOutlineContent(v => v + '- 列表项\n')} className="px-2 py-0.5 hover:bg-gray-200 rounded" title="列表">-</button>
                    <button onClick={() => setOutlineContent(v => v + '**粗体**')} className="px-2 py-0.5 hover:bg-gray-200 rounded" title="粗体">B</button>
                    <button onClick={() => setOutlineContent(v => v + '`代码`')} className="px-2 py-0.5 hover:bg-gray-200 rounded font-mono text-xs" title="代码">&lt;/&gt;</button>
                    <button onClick={() => setOutlineContent(v => v + '- [ ] 待办\n')} className="px-2 py-0.5 hover:bg-gray-200 rounded" title="勾选框">☐</button>
                    <button onClick={() => setOutlineContent(v => v + '---\n')} className="px-2 py-0.5 hover:bg-gray-200 rounded" title="分割线">―</button>
                  </div>
                </div>
                <textarea
                  value={outlineContent}
                  onChange={(e) => setOutlineContent(e.target.value)}
                  placeholder="# 项目大纲\n\n## 项目目标\n- 目标1\n- 目标2\n\n## 里程碑\n1. 第一阶段\n2. 第二阶段\n\n## 注意事项\n- 重要提示\n"
                  className="flex-1 w-full p-4 font-mono text-sm resize-none focus:outline-none"
                  spellCheck={false}
                />
              </div>
              
              {/* 右侧：预览 */}
              <div className="flex-1 flex flex-col bg-gray-50">
                <div className="px-4 py-2 bg-gray-100 border-b border-gray-200 text-xs text-gray-500">
                  👁️ 实时预览
                </div>
                <MarkdownPreview content={outlineContent} />
              </div>
            </div>
            
            {/* 底部 */}
            <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="text-xs text-gray-500">
                共 {outlineContent.length} 字符
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowOutlineModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg">取消</button>
                <button onClick={saveOutline} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                  <Save className="w-4 h-4" />
                  保存大纲
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 项目内新建任务弹窗 - 完整字段 */}
      {showCreateProjectTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-2">新建任务</h2>
            <p className="text-sm text-gray-500 mb-4">关联项目: <span className="font-medium text-blue-600">{selectedProject?.name}</span></p>
            
            <div className="space-y-4">
              {/* 标题 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">任务标题 *</label>
                <input 
                  type="text" 
                  value={newTaskTitle} 
                  onChange={(e) => setNewTaskTitle(e.target.value)} 
                  placeholder="输入任务标题" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500" 
                  autoFocus 
                />
              </div>
              
              {/* 描述 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">任务描述</label>
                <textarea 
                  value={newTaskDescription} 
                  onChange={(e) => setNewTaskDescription(e.target.value)} 
                  placeholder="输入任务描述（可选）" 
                  rows={3} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500" 
                />
              </div>
              
              {/* 任务类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">任务类型</label>
                <select 
                  value={newTaskType} 
                  onChange={(e) => setNewTaskType(e.target.value as 'schedule' | 'todo' | 'someday' | 'trash' | 'inbox')} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="schedule">📅 日程（有明确日期）</option>
                  <option value="todo">✅ 待办（需要完成）</option>
                  <option value="someday">💭 将来也许</option>
                  <option value="trash">🗑️ 垃圾箱</option>
                  <option value="inbox">📥 未分类</option>
                </select>
              </div>

              {/* 优先级 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
                <select 
                  value={newTaskPriority} 
                  onChange={(e) => setNewTaskPriority(Number(e.target.value) as 1 | 2 | 3 | 4)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value={1}>低</option>
                  <option value={2}>中</option>
                  <option value={3}>高</option>
                  <option value={4}>紧急</option>
                </select>
              </div>
              
              {/* 截止日期、计划日期和预估番茄钟 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">截止日期</label>
                  <input 
                    type="date" 
                    value={newTaskDueDate} 
                    onChange={(e) => setNewTaskDueDate(e.target.value)} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">计划日期</label>
                  <input 
                    type="date" 
                    value={newTaskScheduledDate} 
                    onChange={(e) => setNewTaskScheduledDate(e.target.value)} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">预估番茄钟</label>
                  <input 
                    type="number" 
                    min={1}
                    value={newTaskEstimatedPomodoros} 
                    onChange={(e) => setNewTaskEstimatedPomodoros(e.target.value ? Number(e.target.value) : '')} 
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreateProjectTaskModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={handleCreateTask} disabled={!newTaskTitle.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">创建</button>
            </div>
          </div>
        </div>
      )}

      {/* 项目目标编辑弹窗 */}
      {showGoalModal && selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {editingGoal ? '编辑目标' : '添加目标'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目标标题 *</label>
                <input 
                  type="text" 
                  value={goalForm.title} 
                  onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} 
                  placeholder="输入目标标题" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目标描述</label>
                <textarea 
                  value={goalForm.description} 
                  onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} 
                  placeholder="输入目标描述（可选）" 
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setShowGoalModal(false)} 
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                取消
              </button>
              <button 
                onClick={saveGoal} 
                disabled={!goalForm.title.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {editingGoal ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
