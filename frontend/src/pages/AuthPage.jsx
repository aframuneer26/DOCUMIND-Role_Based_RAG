import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  Brain, Shield, Users, FileSearch, Lock, Zap,
  Eye, EyeOff, ChevronDown, Loader2
} from 'lucide-react';

const ROLES = [
  { value: 'user', label: 'User', icon: Users, desc: 'Ask questions, query documents' },
  { value: 'admin', label: 'Administrator', icon: Shield, desc: 'Upload docs, manage access' },
];

export default function AuthPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [role, setRole] = useState('user');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '' });

  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password, role);
        toast.success(`Welcome back! Logged in as ${role}`);
      } else {
        if (!form.username.trim()) {
          toast.error('Username is required');
          return;
        }
        await register(form.username, form.email, form.password, role);
        toast.success('Account created successfully!');
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Authentication failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const selectedRole = ROLES.find(r => r.value === role);

  return (
    <div className="auth-page">
      {/* Left Panel */}
      <div className="auth-left">
        <div className="auth-grid-bg" />

        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Brain size={22} strokeWidth={2.5} />
          </div>
          <span className="auth-logo-text">DocuMind</span>
        </div>

        <h1 className="auth-headline">
          Welcome to<br />
          <span>DocuMind</span>
        </h1>

      </div>

      {/* Right Panel */}
      <div className="auth-right">
        <div className="auth-form-wrapper">
          <div className="auth-tabs">
            {['login', 'register'].map(m => (
              <button
                key={m}
                className={`auth-tab${mode === m ? ' active' : ''}`}
                onClick={() => setMode(m)}
                type="button"
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <h2 className="auth-form-title" style={{ marginTop: '28px' }}>
            {mode === 'login' ? 'Welcome back' : 'Get started'}
          </h2>
          <p className="auth-form-sub">
            {mode === 'login'
              ? 'Sign in to access your workspace'
              : 'Create your account to get started'}
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {/* Role Dropdown */}
            <div className="input-group">
              <label className="input-label">Select Account Type</label>
              <div style={{ position: 'relative' }}>
                <select
                  className="input select"
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  id="role-select"
                >
                  <option value="user">User</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </div>

            {/* Username (register only) */}
            {mode === 'register' && (
              <div className="input-group">
                <label className="input-label" htmlFor="username">Username</label>
                <input
                  id="username"
                  className="input"
                  type="text"
                  placeholder="johndoe"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  required
                  minLength={3}
                  maxLength={50}
                />
              </div>
            )}

            {/* Email */}
            <div className="input-group">
              <label className="input-label" htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
              />
            </div>

            {/* Password */}
            <div className="input-group">
              <label className="input-label" htmlFor="password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                  minLength={6}
                  style={{ paddingRight: '48px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute',
                    right: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--white-600)',
                    display: 'flex',
                    padding: 0
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn--primary btn--lg"
              disabled={loading}
              style={{ width: '100%', marginTop: '8px' }}
            >
              {loading ? (
                <><Loader2 size={18} className="spin" />{mode === 'login' ? 'Signing in...' : 'Creating account...'}</>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.8rem', color: 'var(--white-600)' }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--white-300)', fontWeight: 600 }}
            >
              {mode === 'login' ? 'Register' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
