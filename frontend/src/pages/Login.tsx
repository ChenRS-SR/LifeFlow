import { useState } from 'react';
import type { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

// API 基础路径：开发环境走 Vite 代理，生产环境走 Nginx 反向代理
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export default function Login({ onLogin }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 登录函数
  const doLogin = async (username: string, password: string) => {
    setError('');
    setLoading(true);

    try {
      // 构建表单数据
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      // 发送请求
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // 保存 token
      localStorage.setItem('token', data.access_token);
      
      // 登录成功
      onLogin(data.user);
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-50">
      <div className="card w-full max-w-md p-8">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-600">LifeFlow</h1>
          <p className="text-gray-500 mt-2">人生管理系统</p>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {/* 默认账户登录 */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">👋</span>
            <div>
              <p className="font-medium text-green-800">欢迎使用！</p>
              <p className="text-sm text-green-600">默认账户: admin / admin123</p>
            </div>
          </div>
          <button
            onClick={() => doLogin('admin', 'admin123')}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>登录中...</span>
            ) : (
              <>
                <span>一键登录默认账户</span>
                <span>→</span>
              </>
            )}
          </button>
        </div>

        {/* 说明文字 */}
        <p className="text-center text-sm text-gray-400">
          首次使用请点击上方按钮快速体验
        </p>
      </div>
    </div>
  );
}
