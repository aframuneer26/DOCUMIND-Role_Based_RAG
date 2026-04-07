import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import api from '../lib/api';
import {
  MessageSquare, Home, History, Send, Brain,
  FileText, AlertCircle, Clock, ChevronDown, Loader2
} from 'lucide-react';

// ─── Chat Interface ────────────────────────────────────────────────────────
export const ChatPage = ({ user }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [showDocFilter, setShowDocFilter] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    // Load accessible documents
    api.get('/documents').then(r => {
      setDocuments(r.data.documents);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput('');

    setMessages(prev => [...prev, { type: 'user', content: question }]);
    setLoading(true);

    try {
      const res = await api.post('/query/ask', {
        question,
        document_ids: selectedDocs.length > 0 ? selectedDocs : undefined
      });

      setMessages(prev => [...prev, {
        type: 'ai',
        content: res.data.answer,
        sources: res.data.sources,
        responseTime: res.data.response_time_ms
      }]);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to get an answer. Please try again.';
      setMessages(prev => [...prev, { type: 'error', content: errMsg }]);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div className="page-header" style={{ paddingBottom: '16px', marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title" style={{ fontSize: '1.25rem' }}>AI Document Assistant</h1>
            <p className="page-subtitle">Ask questions about your accessible documents</p>
          </div>

          {/* Document Filter */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setShowDocFilter(v => !v)}
              id="btn-filter-docs"
            >
              <FileText size={14} />
              {selectedDocs.length > 0 ? `${selectedDocs.length} doc${selectedDocs.length > 1 ? 's' : ''}` : 'All Documents'}
              <ChevronDown size={12} />
            </button>
            {showDocFilter && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                background: 'var(--black-850)', border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-lg)', padding: '12px',
                minWidth: '260px', zIndex: 100, boxShadow: 'var(--shadow-lg)',
                animation: 'fadeUp 0.2s ease'
              }}>
                <p style={{ fontSize: '0.72rem', color: 'var(--white-600)', marginBottom: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Filter by document
                </p>
                {documents.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--white-600)', padding: '8px 0' }}>
                    No accessible documents found
                  </p>
                ) : documents.map(d => (
                  <label key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px', borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer', fontSize: '0.85rem',
                    color: selectedDocs.includes(d.id) ? 'var(--white-50)' : 'var(--white-400)',
                    background: selectedDocs.includes(d.id) ? 'var(--accent-glow)' : 'transparent'
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedDocs.includes(d.id)}
                      onChange={e => setSelectedDocs(prev =>
                        e.target.checked ? [...prev, d.id] : prev.filter(id => id !== d.id)
                      )}
                      style={{ accentColor: 'white' }}
                    />
                    {d.title}
                  </label>
                ))}
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => { setSelectedDocs([]); setShowDocFilter(false); }}
                  style={{ width: '100%', marginTop: '8px', fontSize: '0.75rem' }}
                >
                  Clear Filter
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="chat-messages" style={{ flex: 1, overflowY: 'auto' }}
        onClick={() => setShowDocFilter(false)}>
        {messages.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', textAlign: 'center', gap: '16px'
          }}>
            <div style={{
              width: 64, height: 64,
              background: 'var(--black-800)', border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Brain size={28} color="var(--white-500)" />
            </div>
            <div>
              <h3 style={{ color: 'var(--white-200)', marginBottom: '8px', fontSize: '1.1rem' }}>
                Ask Anything
              </h3>
              <p style={{ color: 'var(--white-600)', fontSize: '0.875rem', maxWidth: '360px', lineHeight: 1.6 }}>
                Ask questions about your accessible documents. I'll search through the knowledge base and provide accurate answers.
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '480px' }}>
              {[
                'What is the main topic?',
                'Summarize key points',
                'What are the conclusions?',
                'List important dates',
              ].map(q => (
                <button
                  key={q}
                  className="btn btn--ghost btn--sm"
                  onClick={() => setInput(q)}
                  style={{ fontSize: '0.78rem' }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-message chat-message--${msg.type === 'user' ? 'user' : 'ai'}`}>
            <div className={`chat-avatar chat-avatar--${msg.type === 'user' ? 'user' : 'ai'}`}>
              {msg.type === 'user' ? user?.username?.[0]?.toUpperCase() || 'U' : <Brain size={16} />}
            </div>
            <div>
              {msg.type === 'error' ? (
                <div className="chat-bubble chat-bubble--ai" style={{ borderColor: 'var(--accent-danger)', background: 'var(--accent-danger-dim)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-danger)' }}>
                    <AlertCircle size={16} />
                    <span style={{ fontSize: '0.875rem' }}>{msg.content}</span>
                  </div>
                </div>
              ) : (
                <div className={`chat-bubble chat-bubble--${msg.type === 'user' ? 'user' : 'ai'}`}>
                  {msg.type === 'user' ? (
                    <span>{msg.content}</span>
                  ) : (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p style={{ margin: '0 0 8px', color: 'inherit', lineHeight: 1.7 }}>{children}</p>,
                        strong: ({ children }) => <strong style={{ color: 'var(--white-50)', fontWeight: 700 }}>{children}</strong>,
                        ul: ({ children }) => <ul style={{ paddingLeft: '18px', margin: '4px 0' }}>{children}</ul>,
                        li: ({ children }) => <li style={{ margin: '3px 0', color: 'var(--white-300)' }}>{children}</li>,
                        code: ({ children }) => <code style={{ background: 'var(--black-700)', borderRadius: '4px', padding: '1px 5px', fontSize: '0.85em' }}>{children}</code>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}

                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="chat-sources">
                      <div className="chat-sources-title">Sources</div>
                      {msg.sources.map((s, si) => (
                        <div key={si} className="chat-source-item">
                          <FileText size={11} />
                          {s.document_title} · Chunk {s.chunk_index + 1}
                          <span style={{ marginLeft: 'auto', color: 'var(--white-700)', fontSize: '0.65rem' }}>
                            {(s.relevance_score * 100).toFixed(0)}% match
                          </span>
                        </div>
                      ))}
                      {msg.responseTime && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--white-700)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={10} /> {msg.responseTime}ms
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {loading && (
          <div className="chat-message chat-message--ai">
            <div className="chat-avatar chat-avatar--ai">
              <Brain size={16} />
            </div>
            <div className="chat-bubble chat-bubble--ai">
              <div className="thinking-dots">
                <div className="thinking-dot" />
                <div className="thinking-dot" />
                <div className="thinking-dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="chat-input-area">
        <div className="chat-input-row">
          <textarea
            className="chat-input"
            placeholder="Ask a question about your documents... (Enter to send, Shift+Enter for new line)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={1}
            id="chat-input"
          />
          <button
            className="btn btn--primary"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            id="btn-send-query"
            style={{ padding: '13px 18px', flexShrink: 0 }}
          >
            {loading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
          </button>
        </div>
        <p style={{ fontSize: '0.7rem', color: 'var(--white-700)', marginTop: '8px', textAlign: 'center' }}>
          Answers generated from your accessible documents via Gemini AI + FAISS semantic search
        </p>
      </div>
    </div>
  );
};

// ─── Query History ─────────────────────────────────────────────────────────
export const HistoryPage = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/query/history').then(r => setHistory(r.data.history)).catch(() =>
      toast.error('Failed to load history')
    ).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Query History</h1>
        <p className="page-subtitle">Your recent questions and answers</p>
      </div>
      <div className="page-body">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <Loader2 size={24} className="spin" color="var(--white-500)" />
          </div>
        ) : history.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><History size={24} /></div>
            <div className="empty-state-title">No history yet</div>
            <div className="empty-state-sub">Your questions will appear here</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {history.map(item => (
              <div key={item.id} className="card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--white-100)', fontSize: '0.9rem' }}>
                    Q: {item.query}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--white-700)', flexShrink: 0, marginLeft: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={11} />
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                    {item.response_time_ms && (
                      <div style={{ marginTop: '2px' }}>{item.response_time_ms}ms</div>
                    )}
                  </div>
                </div>
                <div style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '12px',
                  fontSize: '0.85rem',
                  color: 'var(--white-400)',
                  lineHeight: 1.65
                }}>
                  {item.response ? item.response.slice(0, 300) + (item.response.length > 300 ? '...' : '') : 'No response recorded'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── User Dashboard Root ───────────────────────────────────────────────────
export default function UserDashboard() {
  const { user, logout } = useAuth();

  const navItems = [
    { path: '/dashboard', label: 'Ask Questions', icon: MessageSquare },
    { path: '/dashboard/history', label: 'History', icon: History },
  ];

  return (
    <div className="app-layout">
      <Sidebar navItems={navItems} onLogout={logout} user={user} />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<ChatPage user={user} />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </div>
  );
}
