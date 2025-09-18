// components/Dashboard/UserDashboard.js
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import TokenModal from '../TokenModal';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import { 
  Activity, TrendingUp, Clock, CreditCard, Plus, Eye, Trash2, 
  Copy, CheckCircle, AlertCircle, Search
} from 'lucide-react';
import toast from 'react-hot-toast';

const UserDashboard = () => {
  const { user, token, fetchDashboardStats, fetchApiTokens, generateApiToken, revokeApiToken, apiTokens } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [newTokenData, setNewTokenData] = useState({
    nombre: '',
    descripcion: '',
    limite_diario: 1000
  });
  const [testRuc, setTestRuc] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [generatedToken, setGeneratedToken] = useState(null);
  const [generatedTokenInfo, setGeneratedTokenInfo] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [statsData, tokensData] = await Promise.all([
        fetchDashboardStats(),
        fetchApiTokens()
      ]);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateToken = async (e) => {
    e.preventDefault();
    const result = await generateApiToken(newTokenData);
    if (result.success) {
      setShowTokenForm(false);
      setNewTokenData({ nombre: '', descripcion: '', limite_diario: 1000 });
      
      // Mostrar el modal con el token real
      setGeneratedToken(result.token);
      setGeneratedTokenInfo(result.tokenInfo);
      setShowTokenModal(true);
      
      loadDashboardData();
    }
  };

  const handleRevokeToken = async (tokenId) => {
    if (window.confirm('¿Estás seguro de que quieres revocar este token?')) {
      await revokeApiToken(tokenId);
      loadDashboardData();
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Token copiado al portapapeles');
  };

  const testApiQuery = async () => {
    if (!testRuc || testRuc.length < 10) {
      toast.error('Ingresa un RUC válido (10-13 dígitos)');
      return;
    }

    setTestLoading(true);
    try {
      // Llamada REAL a tu API a través de Nginx
      const response = await fetch('/api/consultar', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // El token del usuario logueado
        },
        body: JSON.stringify({
          ruc: testRuc,
          metodo: 'hybrid'
        })
      });

      const data = await response.json();

      if (response.ok) {
        setTestResult({
          success: true,
          data: data,
          tiempo_respuesta: data.tiempo_respuesta || '0.00s',
          metodo: data.metodo_usado || 'hybrid-selenium'
        });
      } else {
        setTestResult({
          success: false,
          error: data.error || 'Error en la consulta'
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        error: 'Error de conexión: ' + error.message
      });
    } finally {
      setTestLoading(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, subtitle }) => (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 ${color}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color.replace('border-l-4', 'bg-opacity-10')}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </motion.div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Bienvenido, {user?.nombre}
          </h1>
          <p className="text-gray-600 mt-1">
            Panel de control de FastPaw SaaS
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowTokenForm(true)}
          className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-medium flex items-center space-x-2 shadow-lg"
        >
          <Plus className="w-5 h-5" />
          <span>Generar Token API</span>
        </motion.button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Consultas Totales"
          value={stats?.stats?.total_consultas || 0}
          icon={Activity}
          color="border-l-4 border-blue-500"
          subtitle="Últimos 30 días"
        />
        <StatCard
          title="Tasa de Éxito"
          value={`${Math.round((stats?.stats?.consultas_exitosas / (stats?.stats?.total_consultas || 1)) * 100)}%`}
          icon={TrendingUp}
          color="border-l-4 border-green-500"
          subtitle={`${stats?.stats?.consultas_exitosas || 0} exitosas`}
        />
        <StatCard
          title="Tiempo Promedio"
          value={`${stats?.stats?.tiempo_promedio?.toFixed(2) || 0}s`}
          icon={Clock}
          color="border-l-4 border-yellow-500"
          subtitle="Por consulta"
        />
        <StatCard
          title="Uso Diario"
          value={`${stats?.usado_hoy || 0}/${stats?.limite_diario || 1000}`}
          icon={CreditCard}
          color="border-l-4 border-purple-500"
          subtitle="Consultas disponibles"
        />
      </div>

      {/* Quick Test Tool */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Search className="w-5 h-5 mr-2" />
          Prueba rápida de consulta
        </h3>
        <div className="flex space-x-4">
          <input
            type="text"
            value={testRuc}
            onChange={(e) => setTestRuc(e.target.value)}
            placeholder="Ingresa un RUC o cédula (ej: 1234567890)"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={testApiQuery}
            disabled={testLoading}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
          >
            {testLoading ? 'Consultando...' : 'Probar'}
          </motion.button>
        </div>
        
        {testResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-gray-50 rounded-lg"
          >
            <pre className="text-sm text-gray-800 overflow-x-auto">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          </motion.div>
        )}
      </div>

      {/* Charts */}
      {stats?.daily_stats && stats.daily_stats.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily Usage Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Consultas por día (últimos 7 días)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.daily_stats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="consultas" fill="#3B82F6" />
                <Bar dataKey="exitosas" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Success Rate Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Rendimiento del sistema
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Exitosas', value: stats.stats.consultas_exitosas, fill: '#10B981' },
                    { name: 'Fallidas', value: stats.stats.consultas_fallidas, fill: '#EF4444' }
                  ]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  <Cell fill="#10B981" />
                  <Cell fill="#EF4444" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* API Tokens Management */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Tokens API
        </h3>
        
        {apiTokens && apiTokens.length > 0 ? (
          <div className="space-y-4">
            {apiTokens.map((token) => (
              <motion.div
                key={token.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-gray-200 rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      token.estado === 'activo' ? 'bg-green-500' : 'bg-red-500'
                    }`}></div>
                    <div>
                      <h4 className="font-medium text-gray-900">{token.nombre}</h4>
                      <p className="text-sm text-gray-600">{token.descripcion || 'Sin descripción'}</p>
                      <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                        <span>Límite: {token.limite_requests_diario}/día</span>
                        <span>Usado hoy: {token.requests_utilizados_hoy}</span>
                        <span>Total: {token.total_requests_historico}</span>
                        {token.ultimo_uso && (
                          <span>Último uso: {new Date(token.ultimo_uso).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="text-xs text-gray-500">
                    Token oculto por seguridad
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleRevokeToken(token.id)}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    title="Revocar token"
                  >
                    <Trash2 className="w-4 h-4" />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-600 mb-4">No tienes tokens API creados</p>
            <button
              onClick={() => setShowTokenForm(true)}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Crear tu primer token
            </button>
          </div>
        )}
      </div>

      {/* Token Generation Modal */}
      {showTokenForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Generar nuevo token API
            </h3>
            <form onSubmit={handleGenerateToken} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del token
                </label>
                <input
                  type="text"
                  value={newTokenData.nombre}
                  onChange={(e) => setNewTokenData(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Token Principal"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción
                </label>
                <input
                  type="text"
                  value={newTokenData.descripcion}
                  onChange={(e) => setNewTokenData(prev => ({ ...prev, descripcion: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Para consultas de producción"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Límite diario
                </label>
                <input
                  type="number"
                  value={newTokenData.limite_diario}
                  onChange={(e) => setNewTokenData(prev => ({ ...prev, limite_diario: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="1"
                  max="10000"
                />
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowTokenForm(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Generar Token
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
      <TokenModal
        isOpen={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        token={generatedToken}
        tokenInfo={generatedTokenInfo}
      />
    </div>
  );
};

export default UserDashboard;