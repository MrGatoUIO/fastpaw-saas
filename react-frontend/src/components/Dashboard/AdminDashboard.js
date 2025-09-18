// components/Dashboard/AdminDashboard.js
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Area, AreaChart, PieChart, Pie, Cell
} from 'recharts';
import { 
  Shield, Activity, Users, Database, Server, RefreshCw, AlertTriangle,
  Play, Pause, Trash2, Settings, Terminal, Eye, Download, Upload,
  Cpu, HardDrive, Network, Clock, Zap, Bug, CheckCircle,
  XCircle, AlertCircle, TrendingUp, TrendingDown
} from 'lucide-react';
import toast from 'react-hot-toast';

const AdminDashboard = () => {
  const { user, fetchAdminStats, fetchSystemStatus, refreshPythonPool } = useAuth();
  const [adminStats, setAdminStats] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [realTimeData, setRealTimeData] = useState([]);
  const [poolMetrics, setPoolMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    loadAdminData();
    // Simular datos en tiempo real
    const interval = setInterval(() => {
      updateRealTimeData();
      simulateLogs();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [stats, status] = await Promise.all([
        fetchAdminStats(),
        fetchSystemStatus()
      ]);
      setAdminStats(stats);
      setSystemStatus(status);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateRealTimeData = () => {
    const now = new Date();
    const newDataPoint = {
      time: now.toLocaleTimeString(),
      requests: Math.floor(Math.random() * 50) + 10,
      response_time: Math.random() * 2 + 0.1,
      cpu_usage: Math.random() * 100,
      memory_usage: Math.random() * 80 + 20,
      active_sessions: Math.floor(Math.random() * 3) + 1
    };

    setRealTimeData(prev => [...prev.slice(-29), newDataPoint]);
  };

  const simulateLogs = () => {
    const logTypes = ['INFO', 'WARNING', 'ERROR', 'SUCCESS'];
    const services = ['python-api', 'nodejs-web', 'postgres', 'selenium'];
    const messages = [
      'Pool híbrido: Nueva sesión Selenium iniciada',
      'Consulta SRI procesada exitosamente',
      'Rate limiting activado para IP 192.168.1.100',
      'Base de datos: Conexión establecida',
      'WebDriver: Sesión cerrada automáticamente',
      'Token API validado correctamente',
      'Fallback activado: ecuadorlegalonline.com',
      'Cache Redis: Datos actualizados'
    ];

    const newLog = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      level: logTypes[Math.floor(Math.random() * logTypes.length)],
      service: services[Math.floor(Math.random() * services.length)],
      message: messages[Math.floor(Math.random() * messages.length)]
    };

    setLogs(prev => [newLog, ...prev.slice(0, 49)]);
  };

  const handleRefreshPool = async () => {
    setRefreshing(true);
    try {
      await refreshPythonPool();
      await loadAdminData();
      toast.success('Pool híbrido reiniciado exitosamente');
    } catch (error) {
      toast.error('Error al reiniciar pool híbrido');
    } finally {
      setRefreshing(false);
    }
  };

  const MetricCard = ({ title, value, icon: Icon, color, trend, subtitle }) => (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {trend && (
            <div className="flex items-center mt-2">
              {trend > 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span className={`text-sm ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {Math.abs(trend)}%
              </span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg bg-${color}-50`}>
          <Icon className={`w-6 h-6 text-${color}-600`} />
        </div>
      </div>
    </motion.div>
  );

  const getLevelColor = (level) => {
    switch (level) {
      case 'ERROR': return 'text-red-600 bg-red-50';
      case 'WARNING': return 'text-yellow-600 bg-yellow-50';
      case 'SUCCESS': return 'text-green-600 bg-green-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando panel de administración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Shield className="w-8 h-8 mr-3 text-red-600" />
            Panel de Administración
          </h1>
          <p className="text-gray-600 mt-1">
            Control total del sistema FastPaw SaaS
          </p>
        </div>
        <div className="flex space-x-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRefreshPool}
            disabled={refreshing}
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-medium flex items-center space-x-2 shadow-lg disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Reiniciando...' : 'Reiniciar Pool'}</span>
          </motion.button>
          <button
            onClick={loadAdminData}
            className="bg-gray-600 text-white px-6 py-3 rounded-lg font-medium flex items-center space-x-2"
          >
            <RefreshCw className="w-5 h-5" />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', name: 'Vista General', icon: Activity },
            { id: 'system', name: 'Sistema', icon: Server },
            { id: 'users', name: 'Usuarios', icon: Users },
            { id: 'logs', name: 'Logs en Vivo', icon: Terminal },
            { id: 'monitoring', name: 'Monitoreo', icon: Eye }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-5 h-5 mr-2" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              title="Usuarios Totales"
              value={adminStats?.general?.total_usuarios || 0}
              icon={Users}
              color="blue"
              trend={5}
              subtitle="Activos: ${adminStats?.general?.usuarios_activos || 0}"
            />
            <MetricCard
              title="Consultas Hoy"
              value={adminStats?.general?.consultas_hoy || 0}
              icon={Activity}
              color="green"
              trend={12}
              subtitle="Total: ${adminStats?.general?.total_consultas || 0}"
            />
            <MetricCard
              title="Sesiones Pool"
              value={`${systemStatus?.pool_hibrido?.total_sessions || 0}/3`}
              icon={Zap}
              color="yellow"
              subtitle="Híbrido activo"
            />
            <MetricCard
              title="Tokens API"
              value={adminStats?.general?.total_tokens || 0}
              icon={Database}
              color="purple"
              subtitle="Activos"
            />
          </div>

          {/* Real-time Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Real-time Requests */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Activity className="w-5 h-5 mr-2" />
                Requests en Tiempo Real
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={realTimeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="requests" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* System Performance */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Cpu className="w-5 h-5 mr-2" />
                Rendimiento del Sistema
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={realTimeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="cpu_usage" stroke="#EF4444" name="CPU %" />
                  <Line type="monotone" dataKey="memory_usage" stroke="#10B981" name="RAM %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Users Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Top Usuarios (Últimos 30 días)
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usuario
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Empresa
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Consultas
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {adminStats?.top_users?.map((user, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{user.nombre}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.empresa || 'Sin empresa'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.total_consultas}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          Activo
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Terminal className="w-5 h-5 mr-2" />
              Logs del Sistema en Tiempo Real
            </h3>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setLogs([])}
                className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
              >
                Limpiar
              </button>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                <span className="text-sm text-gray-600">En vivo</span>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
            {logs.length === 0 ? (
              <div className="text-gray-400">
                Esperando logs del sistema...
              </div>
            ) : (
              <div>
                {logs.map((log) => (
                  <div key={log.id} className="mb-1 flex items-start space-x-2">
                    <span className="text-gray-500 text-xs">{log.timestamp}</span>
                    <span className={`text-xs font-bold px-1 rounded ${getLevelColor(log.level)}`}>
                      {log.level}
                    </span>
                    <span className="text-blue-400 text-xs">[{log.service}]</span>
                    <span className="text-gray-300 flex-1">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'system' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Python API Status */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                <Server className="w-5 h-5 mr-2" />
                Python API
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Estado</span>
                  <span className="flex items-center text-green-600">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Healthy
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Pool Sessions</span>
                  <span className="text-sm font-medium">{systemStatus?.pool_hibrido?.total_sessions || 0}/3</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Uptime</span>
                  <span className="text-sm font-medium">99.9%</span>
                </div>
              </div>
            </div>

            {/* Database Status */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                <Database className="w-5 h-5 mr-2" />
                PostgreSQL
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Conexiones</span>
                  <span className="text-sm font-medium">5/100</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Tamaño BD</span>
                  <span className="text-sm font-medium">256 MB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Queries/min</span>
                  <span className="text-sm font-medium">142</span>
                </div>
              </div>
            </div>

            {/* Redis Status */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                <HardDrive className="w-5 h-5 mr-2" />
                Redis Cache
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Memoria</span>
                  <span className="text-sm font-medium">64 MB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Keys</span>
                  <span className="text-sm font-medium">1,247</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Hit Rate</span>
                  <span className="text-sm font-medium">94.2%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;