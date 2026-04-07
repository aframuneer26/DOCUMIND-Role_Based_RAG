import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5 min for large uploads/queries (matches backend RAG processing timeout)
});

// Attach JWT token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rag_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global response handler
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('rag_token');
      localStorage.removeItem('rag_user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;
