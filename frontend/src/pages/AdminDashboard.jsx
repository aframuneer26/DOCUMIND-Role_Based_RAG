import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';
import api from '../lib/api';
import {
  BarChart2, FileText, Users, Upload, Home, Trash2, Settings,
  ChevronDown, Plus, Loader2, RefreshCw, Shield, Check, X,
  FileSearch, AlertCircle, MessageSquare, History
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { ChatPage, HistoryPage } from './UserDashboard';

// ─── Admin Overview (Stats) ────────────────────────────────────────────────
const AdminOverview = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats').then(r => {
      setStats(r.data.stats);
    }).catch(() => toast.error('Failed to load stats')).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
      <Loader2 size={24} className="spin" color="var(--white-500)" />
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-subtitle">System overview and management</p>
      </div>
      <div className="page-body">
        <div className="stats-grid">
          {[
            { label: 'Total Users', value: stats?.total_users ?? 0, sub: `${stats?.admins ?? 0} admins` },
            { label: 'Regular Users', value: stats?.regular_users ?? 0, sub: 'active accounts' },
            { label: 'Documents', value: stats?.total_documents ?? 0, sub: 'in knowledge base' },
            { label: 'Total Chunks', value: stats?.total_chunks ?? 0, sub: 'vector embeddings' },
            { label: 'Queries (24h)', value: stats?.queries_last_24h ?? 0, sub: 'in last 24 hours' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-card__label">{s.label}</div>
              <div className="stat-card__value">{s.value.toLocaleString()}</div>
              <div className="stat-card__sub">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: '8px' }}>
          <h3 style={{ color: 'var(--white-50)', marginBottom: '8px', fontSize: '1rem' }}>
            Quick Actions
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--white-600)' }}>
            Use the sidebar to navigate to Documents (upload & manage access), Users (manage accounts), and Analytics.
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Admin Documents ───────────────────────────────────────────────────────
const AdminDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', access_type: 'admin_only' });
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showAccessModal, setShowAccessModal] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [docAccessUsers, setDocAccessUsers] = useState([]);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/documents');
      setDocuments(res.data.documents);
    } catch { toast.error('Failed to load documents'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDocs(); }, []);

  const onDrop = useCallback(files => {
    if (files[0]) setSelectedFile(files[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1
  });

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) { toast.error('Please select a PDF file'); return; }

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('document', selectedFile);
    formData.append('title', uploadForm.title || selectedFile.name);
    formData.append('access_type', uploadForm.access_type);

    try {
      const res = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          setUploadProgress(Math.round((e.loaded / e.total) * 90));
        }
      });
      setUploadProgress(100);
      toast.success(`Document processed! ${res.data.document.total_chunks} chunks created. You can now test Queries on it!`);
      setShowUpload(false);
      setSelectedFile(null);
      setUploadForm({ title: '', access_type: 'admin_only' });
      fetchDocs();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (docId, title) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/documents/${docId}`);
      toast.success('Document deleted');
      fetchDocs();
    } catch { toast.error('Failed to delete'); }
  };

  const handleAccessChange = async (docId, accessType) => {
    try {
      await api.patch(`/documents/${docId}/access`, { access_type: accessType });
      toast.success('Access updated');
      fetchDocs();
    } catch { toast.error('Failed to update access'); }
  };

  const openAccessModal = async (doc) => {
    setShowAccessModal(doc);
    setSelectedUsers([]);
    try {
      const [usersRes, accessRes] = await Promise.all([
        api.get('/admin/users'),
        api.get(`/admin/documents/${doc.id}/users`)
      ]);
      setUsers(usersRes.data.users.filter(u => u.role === 'user'));
      setDocAccessUsers(accessRes.data.users.map(u => u.id));
      setSelectedUsers(accessRes.data.users.map(u => u.id));
    } catch { toast.error('Failed to load users'); }
  };

  const handleGrantAccess = async () => {
    try {
      await api.post(`/admin/documents/${showAccessModal.id}/grant-access`, { user_ids: selectedUsers });
      toast.success('Access granted');
      setShowAccessModal(null);
      fetchDocs();
    } catch { toast.error('Failed to grant access'); }
  };

  const ACCESS_CONFIGS = {
    admin_only: { label: 'Admin Only', color: 'admin' },
    all_users: { label: 'All Users', color: 'all' },
    selected_users: { label: 'Selected Users', color: 'selected' },
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Documents</h1>
            <p className="page-subtitle">Upload and manage document access</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn--ghost btn--sm" onClick={fetchDocs} id="btn-refresh-docs">
              <RefreshCw size={14} />Refresh
            </button>
            <button className="btn btn--primary btn--sm" onClick={() => setShowUpload(v => !v)} id="btn-upload-doc">
              <Upload size={14} />Upload PDF
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Upload Form */}
        {showUpload && (
          <div className="card" style={{ marginBottom: '24px', animation: 'fadeUp 0.25s ease' }}>
            <h3 style={{ color: 'var(--white-50)', marginBottom: '20px', fontSize: '1rem', fontWeight: 700 }}>
              Upload New Document
            </h3>
            <form onSubmit={handleUpload}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div className="input-group">
                  <label className="input-label">Document Title</label>
                  <input
                    className="input"
                    placeholder="Enter document title..."
                    value={uploadForm.title}
                    onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))}
                    id="doc-title-input"
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Access Level</label>
                  <select
                    className="input select"
                    value={uploadForm.access_type}
                    onChange={e => setUploadForm(f => ({ ...f, access_type: e.target.value }))}
                    id="doc-access-select"
                  >
                    <option value="admin_only">Admin Only</option>
                    <option value="all_users">All Users</option>
                    <option value="selected_users">Selected Users</option>
                  </select>
                </div>
              </div>

              {/* Drop Zone */}
              <div
                {...getRootProps()}
                className={`upload-zone${isDragActive ? ' upload-zone--active' : ''}`}
                style={{ marginBottom: '16px' }}
                id="pdf-dropzone"
              >
                <input {...getInputProps()} />
                <div className="upload-zone__icon">
                  <FileText size={24} />
                </div>
                {selectedFile ? (
                  <>
                    <div className="upload-zone__title" style={{ color: 'var(--accent-success)' }}>
                      {selectedFile.name}
                    </div>
                    <div className="upload-zone__sub">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</div>
                  </>
                ) : (
                  <>
                    <div className="upload-zone__title">Drop PDF here or click to browse</div>
                    <div className="upload-zone__sub">Supports PDF files up to 50MB</div>
                  </>
                )}
              </div>

              {uploading && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.75rem', color: 'var(--white-500)' }}>
                    <span>Processing document...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar__fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--white-600)', marginTop: '6px' }}>
                    Extracting text, creating chunks, generating embeddings...
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--ghost btn--sm"
                  onClick={() => { setShowUpload(false); setSelectedFile(null); }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary btn--sm" disabled={uploading || !selectedFile} id="btn-submit-upload">
                  {uploading ? <><Loader2 size={14} className="spin" />Processing...</> : <><Upload size={14} />Upload & Process</>}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Documents Table */}
        <div className="table-wrapper">
          <div className="table-header-row">
            <span className="table-title">Knowledge Base ({documents.length} documents)</span>
          </div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <Loader2 size={20} className="spin" color="var(--white-500)" />
            </div>
          ) : documents.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><FileText size={24} /></div>
              <div className="empty-state-title">No documents yet</div>
              <div className="empty-state-sub">Upload a PDF to get started</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Chunks</th>
                  <th>Access</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => {
                  const ac = ACCESS_CONFIGS[doc.access_type] || ACCESS_CONFIGS.admin_only;
                  return (
                    <tr key={doc.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--white-100)' }}>{doc.title}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--white-600)', marginTop: '2px' }}>
                          {doc.uploader_name ? `by ${doc.uploader_name}` : ''}
                          {doc.file_size ? ` · ${(doc.file_size / 1024 / 1024).toFixed(2)} MB` : ''}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--white-300)' }}>
                          {doc.total_chunks || doc.chunk_count || 0}
                        </span>
                      </td>
                      <td>
                        <select
                          className="input select"
                          value={doc.access_type}
                          onChange={e => handleAccessChange(doc.id, e.target.value)}
                          style={{ padding: '4px 32px 4px 10px', fontSize: '0.775rem', width: 'auto' }}
                          id={`access-select-${doc.id}`}
                        >
                          <option value="admin_only">Admin Only</option>
                          <option value="all_users">All Users</option>
                          <option value="selected_users">Selected Users</option>
                        </select>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--white-600)' }}>
                        {new Date(doc.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {doc.access_type === 'selected_users' && (
                            <button className="btn btn--ghost btn--sm" onClick={() => openAccessModal(doc)}
                              id={`btn-manage-access-${doc.id}`} title="Manage user access">
                              <Users size={13} />
                            </button>
                          )}
                          <button className="btn btn--danger btn--sm" onClick={() => handleDelete(doc.id, doc.title)}
                            id={`btn-delete-doc-${doc.id}`}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Access Management Modal */}
      {showAccessModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAccessModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Manage Access — {showAccessModal.title}</h3>
              <button className="btn btn--ghost btn--icon" onClick={() => setShowAccessModal(null)}>
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--white-600)', marginBottom: '20px' }}>
              Select users who can query this document
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              {users.length === 0 ? (
                <p style={{ color: 'var(--white-600)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>
                  No regular users found. Register users first.
                </p>
              ) : users.map(u => (
                <label key={u.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px', borderRadius: 'var(--radius-md)',
                  background: selectedUsers.includes(u.id) ? 'var(--accent-glow)' : 'var(--black-800)',
                  border: `1px solid ${selectedUsers.includes(u.id) ? 'var(--border-medium)' : 'var(--border-subtle)'}`,
                  cursor: 'pointer', transition: 'all 0.15s'
                }}>
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(u.id)}
                    onChange={e => {
                      setSelectedUsers(prev =>
                        e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id)
                      );
                    }}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-white)' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--white-100)' }}>{u.username}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--white-600)' }}>{u.email}</div>
                  </div>
                  {docAccessUsers.includes(u.id) && (
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--accent-success)' }}>
                      Has access
                    </span>
                  )}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowAccessModal(null)}>Cancel</button>
              <button className="btn btn--primary btn--sm" onClick={handleGrantAccess} id="btn-confirm-access">
                <Check size={14} />Grant Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Admin Users ───────────────────────────────────────────────────────────
const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data.users);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleStatus = async (userId, username) => {
    try {
      const res = await api.patch(`/admin/users/${userId}/toggle-status`);
      toast.success(res.data.message);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Users</h1>
            <p className="page-subtitle">Manage user accounts and permissions</p>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={fetchUsers} id="btn-refresh-users">
            <RefreshCw size={14} />Refresh
          </button>
        </div>
      </div>
      <div className="page-body">
        <div className="table-wrapper">
          <div className="table-header-row">
            <span className="table-title">All Users ({users.length})</span>
          </div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <Loader2 size={20} className="spin" color="var(--white-500)" />
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="sidebar-avatar" style={{ width: 32, height: 32, fontSize: '0.75rem', flexShrink: 0 }}>
                          {u.username[0].toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--white-100)' }}>{u.username}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--white-500)', fontSize: '0.85rem' }}>{u.email}</td>
                    <td>
                      <span className={`badge badge--${u.role === 'admin' ? 'admin' : 'user'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge--${u.is_active ? 'success' : 'danger'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--white-600)' }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      {u.role !== 'admin' && (
                        <button
                          className={`btn btn--sm ${u.is_active ? 'btn--danger' : 'btn--ghost'}`}
                          onClick={() => toggleStatus(u.id, u.username)}
                          id={`btn-toggle-${u.id}`}
                        >
                          {u.is_active ? <><X size={12} />Deactivate</> : <><Check size={12} />Activate</>}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Admin Dashboard Root ──────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { path: '/admin', label: 'Overview', icon: Home },
    { path: '/admin/documents', label: 'Documents', icon: FileText },
    { path: '/admin/users', label: 'Users', icon: Users },
    { path: '/admin/query', label: 'Query AI', icon: MessageSquare },
    { path: '/admin/history', label: 'Query History', icon: History },
  ];

  return (
    <div className="app-layout">
      <Sidebar navItems={navItems} onLogout={logout} user={user} />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<AdminOverview />} />
          <Route path="/documents" element={<AdminDocuments />} />
          <Route path="/users" element={<AdminUsers />} />
          <Route path="/query" element={<ChatPage user={user} />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </div>
  );
}
