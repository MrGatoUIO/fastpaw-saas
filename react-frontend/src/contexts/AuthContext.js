// contexts/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const AuthContext = createContext();

// Configurar axios base URL
axios.defaults.baseURL = '/api';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('fastpaw_token'));
  const [isLoading, setIsLoading] = useState(true);
  const [apiTokens, setApiTokens] = useState([]);

  // Configurar axios interceptor para incluir token automáticamente
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Verificar token al cargar la app
  useEffect(() => {
    const initializeAuth = async () => {
      if (token) {
        try {
          // Verificar si el token es válido obteniendo stats del usuario
          const response = await axios.get('/dashboard/stats');
          // Si llegamos aquí, el token es válido
          setIsLoading(false);
        } catch (error) {
          // Token inválido, limpiar
          logout();
        }
      } else {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, [token]);

  const login = async (email, password) => {
    try {
      setIsLoading(true);
      const response = await axios.post('/auth/login', {
        email,
        password
      });

      const { token: newToken, user: userData } = response.data;
      
      setToken(newToken);
      setUser(userData);
      localStorage.setItem('fastpaw_token', newToken);
      
      toast.success(`¡Bienvenido, ${userData.nombre}!`);
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.error || 'Error al iniciar sesión';
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData) => {
    try {
      setIsLoading(true);
      const response = await axios.post('/auth/register', userData);
      
      toast.success('¡Cuenta creada exitosamente! Ahora puedes iniciar sesión.');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.error || 'Error al crear cuenta';
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setApiTokens([]);
    localStorage.removeItem('fastpaw_token');
    delete axios.defaults.headers.common['Authorization'];
    toast.success('Sesión cerrada correctamente');
  };

  const fetchApiTokens = async () => {
    try {
      const response = await axios.get('/tokens');
      setApiTokens(response.data.tokens);
      return response.data.tokens;
    } catch (error) {
      toast.error('Error al cargar tokens API');
      return [];
    }
  };

  const generateApiToken = async (tokenData) => {
    try {
      const response = await axios.post('/tokens/generate', tokenData);
      
      // Mostrar toast de éxito
      toast.success('Token API generado exitosamente');
      
      // Refrescar lista de tokens
      await fetchApiTokens();
      
      // Devolver el token real para que el modal lo pueda mostrar
      return { 
        success: true, 
        data: response.data,
        token: response.data.token,
        tokenInfo: response.data.token_info
      };
    } catch (error) {
      const message = error.response?.data?.error || 'Error al generar token';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const revokeApiToken = async (tokenId) => {
    try {
      await axios.delete(`/tokens/${tokenId}`);
      toast.success('Token revocado exitosamente');
      await fetchApiTokens(); // Refrescar lista
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.error || 'Error al revocar token';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const response = await axios.get('/dashboard/stats');
      return response.data;
    } catch (error) {
      toast.error('Error al cargar estadísticas');
      return null;
    }
  };

  // Funciones para admin
  const fetchAdminStats = async () => {
    try {
      const response = await axios.get('/admin/stats');
      return response.data;
    } catch (error) {
      toast.error('Error al cargar estadísticas de admin');
      return null;
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const response = await axios.get('/admin/system/status');
      return response.data;
    } catch (error) {
      toast.error('Error al obtener estado del sistema');
      return null;
    }
  };

  const refreshPythonPool = async () => {
    try {
      const response = await axios.post('/admin/pool/refresh');
      toast.success('Pool híbrido reiniciado exitosamente');
      return response.data;
    } catch (error) {
      const message = error.response?.data?.error || 'Error al reiniciar pool';
      toast.error(message);
      return null;
    }
  };

  const fetchPoolMetrics = async () => {
    try {
      const response = await axios.get('/admin/pool/metrics');
      return response.data;
    } catch (error) {
      toast.error('Error al obtener métricas del pool');
      return null;
    }
  };

  const fetchSystemHealth = async () => {
    try {
      const response = await axios.get('/admin/health');
      return response.data;
    } catch (error) {
      toast.error('Error al verificar salud del sistema');
      return null;
    }
  };

  const fetchRecentLogs = async (limit = 50, severity = 'all') => {
    try {
      const response = await axios.get('/admin/logs/recent', {
        params: { limit, severity }
      });
      return response.data;
    } catch (error) {
      toast.error('Error al cargar logs del sistema');
      return null;
    }
  };

  const value = {
    user,
    token,
    isLoading,
    apiTokens,
    login,
    register,
    logout,
    fetchApiTokens,
    generateApiToken,
    revokeApiToken,
    fetchDashboardStats,
    fetchAdminStats,
    fetchSystemStatus,
    refreshPythonPool,
    fetchPoolMetrics,
    fetchSystemHealth,
    fetchRecentLogs,
    isAuthenticated: !!token,
    isAdmin: user?.rol === 'admin'
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};