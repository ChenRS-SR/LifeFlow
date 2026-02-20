// 类型定义

export interface User {
  id: number;
  username: string;
  email?: string;
  life_vision?: string;
  created_at: string;
}

export type GoalPeriod = 'life' | 'year' | 'quarter' | 'month';
export type GoalStatus = 'active' | 'completed' | 'archived';

export interface KeyResult {
  id: number;
  goal_id: number;
  title: string;
  target_value: number;
  current_value: number;
  unit?: string;
  is_completed: boolean;
  created_at: string;
}

export interface Goal {
  id: number;
  user_id: number;
  title: string;
  description?: string;
  period: GoalPeriod;
  year?: number;
  quarter?: number;
  month?: number;
  area?: string;
  status: GoalStatus;
  progress: number;
  project_id?: number;
  created_at: string;
  key_results: KeyResult[];
}

export type TaskType = 'task' | 'todo';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 1 | 2 | 3 | 4;

export interface Task {
  id: number;
  user_id: number;
  title: string;
  description?: string;
  task_type: TaskType;
  project_id?: number;
  goal_id?: number;
  priority: TaskPriority;
  status: TaskStatus;
  due_date?: string;
  scheduled_date?: string;
  estimated_minutes?: number;
  created_at: string;
}

export type HabitFrequency = 'daily' | 'weekdays' | 'weekends' | 'weekly';

export interface Habit {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  icon?: string;
  color: string;
  frequency: HabitFrequency;
  target_times: number;
  is_active: boolean;
  created_at: string;
}

export interface HabitLog {
  id: number;
  habit_id: number;
  user_id: number;
  date: string;
  count: number;
  note?: string;
  created_at: string;
}

export type ReviewPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Review {
  id: number;
  user_id: number;
  period: ReviewPeriod;
  year: number;
  quarter?: number;
  month?: number;
  week?: number;
  date?: string;
  highlights?: string;
  challenges?: string;
  learnings?: string;
  next_steps?: string;
  gratitude?: string;
  mood?: number;
  created_at: string;
}

export interface DashboardStats {
  today: {
    tasks_count: number;
    completed_habits: number;
    total_habits: number;
  };
  overview: {
    active_goals: number;
    active_habits: number;
    week_tasks_total: number;
    week_tasks_completed: number;
  };
  heatmap: { date: string; count: number }[];
}
