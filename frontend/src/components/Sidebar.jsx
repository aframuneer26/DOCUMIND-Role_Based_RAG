import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Brain, LogOut, Home, FileText, Users, BarChart2,
         Upload, MessageSquare, Settings } from 'lucide-react';

const Sidebar = ({ navItems, onLogout, user }) => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Brain size={18} strokeWidth={2.5} />
        </div>
        <div>
          <div className="sidebar-brand">DocuMind</div>
          <div className="sidebar-brand-sub">RAG Platform</div>
        </div>
      </div>

      <div className="sidebar-user">
        <div className="sidebar-user-info">
          <div className="sidebar-avatar">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <div className="sidebar-user-name">{user?.username}</div>
            <span className={`badge badge--${user?.role === 'admin' ? 'admin' : 'user'}`}
              style={{ fontSize: '0.62rem', padding: '1px 7px' }}>
              {user?.role}
            </span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Navigation</div>
        {navItems.map(item => (
          <button
            key={item.path}
            className={`nav-item${location.pathname === item.path || location.pathname.startsWith(item.path + '/') ? ' active' : ''}`}
            onClick={() => navigate(item.path)}
            id={`nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="nav-item" onClick={onLogout} id="btn-logout" style={{ width: '100%', color: 'var(--accent-danger)' }}>
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
