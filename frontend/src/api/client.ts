import axios from 'axios';

const apiClient = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token from localStorage on every request
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('omnibus_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 globally
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname;
      const loginPath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login`;
      if (path !== loginPath) {
        localStorage.removeItem('omnibus_token');
        window.location.href = loginPath;
      }
    }
    return Promise.reject(err);
  },
);

export default apiClient;
