// App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';  // ← Nuevo import
import AuthPage from './pages/AuthPage';
import UserDashboard from './components/Dashboard/UserDashboard';
import AdminDashboard from './components/Dashboard/AdminDashboard';
import Layout from './components/Layout/Layout';

// Componente para rutas protegidas
const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Verificando autenticación...</p>
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }
  
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

// Componente principal de la app
function AppContent() {
  const { isAuthenticated, isAdmin } = useAuth();

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Ruta de autenticación */}
          <Route 
            path="/auth" 
            element={
              isAuthenticated ? (
                <Navigate to={isAdmin ? "/admin" : "/dashboard"} replace />
              ) : (
                <AuthPage />
              )
            } 
          />

          {/* Dashboard de usuario regular */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <UserDashboard />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Dashboard de administrador */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <Layout>
                  <AdminDashboard />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Ruta por defecto */}
          <Route
            path="/"
            element={
              isAuthenticated ? (
                <Navigate to={isAdmin ? "/admin" : "/dashboard"} replace />
              ) : (
                <Navigate to="/auth" replace />
              )
            }
          />

          {/* Ruta 404 */}
          <Route
            path="*"
            element={
              <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                  <h1 className="text-6xl font-bold text-gray-900 dark:text-white">404</h1>
                  <p className="text-xl text-gray-600 dark:text-gray-300 mt-4">Página no encontrada</p>
                  <button
                    onClick={() => window.history.back()}
                    className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    Volver
                  </button>
                </div>
              </div>
            }
          />
        </Routes>

        {/* Toast notifications con tema oscuro */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            className: 'dark:bg-gray-800 dark:text-white',
            style: {
              background: 'var(--toast-bg, #363636)',
              color: 'var(--toast-color, #fff)',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#10B981',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#EF4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </div>
    </Router>
  );
}

// App principal con providers
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;