// components/Layout/Layout.js
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';  // ← Nuevo import
import { 
  LogOut, Settings, User, Bell, Search, Menu, X, 
  Home, BarChart3, Key, Shield, Activity, Moon, Sun  // ← Agregar Moon y Sun
} from 'lucide-react';

const Layout = ({ children }) => {
  const { user, logout, isAdmin } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();  // ← Hook del tema
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: isAdmin ? '/admin' : '/dashboard', icon: Home },
    { name: 'Estadísticas', href: '/stats', icon: BarChart3 },
    { name: 'Tokens API', href: '/tokens', icon: Key },
    ...(isAdmin ? [
      { name: 'Panel Admin', href: '/admin', icon: Shield },
      { name: 'Sistema', href: '/system', icon: Activity }
    ] : [])
  ];

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Sidebar for desktop */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
        <div className="flex flex-col flex-grow bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 pt-5 pb-4 overflow-y-auto transition-colors">
          {/* Logo */}
          <div className="flex items-center flex-shrink-0 px-4">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mr-3">
                <img src="/logo.png" alt="FastPaw" className="w-8 h-8" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Swift Cat</h1>
            </div>
          </div>

          {/* Navigation */}
          <nav className="mt-8 flex-1 px-2 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-r-2 border-blue-500'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <item.icon
                    className={`mr-3 h-5 w-5 flex-shrink-0 ${
                      isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'
                    }`}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User info in sidebar */}
          <div className="flex-shrink-0 flex border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-blue-500 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white">
                  {user?.nombre}
                </p>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300">
                  {user?.rol}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex z-40 lg:hidden"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-gray-600 bg-opacity-75"
                onClick={() => setIsSidebarOpen(false)}
              />

              <motion.div
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="relative flex-1 flex flex-col max-w-xs w-full bg-white dark:bg-gray-800"
              >
                <div className="absolute top-0 right-0 -mr-12 pt-2">
                  <button
                    className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <X className="h-6 w-6 text-white" />
                  </button>
                </div>

                <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
                  <div className="flex-shrink-0 flex items-center px-4">
                    <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-white font-bold text-sm">🐾</span>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">FastPaw SaaS</h1>
                  </div>
                  <nav className="mt-5 px-2 space-y-1">
                    {navigation.map((item) => {
                      const isActive = location.pathname === item.href;
                      return (
                        <Link
                          key={item.name}
                          to={item.href}
                          className={`group flex items-center px-2 py-2 text-base font-medium rounded-md ${
                            isActive
                              ? 'bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                          }`}
                          onClick={() => setIsSidebarOpen(false)}
                        >
                          <item.icon
                            className={`mr-4 h-5 w-5 flex-shrink-0 ${
                              isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'
                            }`}
                          />
                          {item.name}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col flex-1">
        {/* Top navigation */}
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-white dark:bg-gray-800 shadow border-b border-gray-200 dark:border-gray-700 transition-colors">
          {/* Mobile menu button */}
          <button
            className="px-4 border-r border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 lg:hidden"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>

          {/* Search bar */}
          <div className="flex-1 px-4 flex justify-between sm:px-6 lg:px-8">
            <div className="flex-1 flex">
              <div className="w-full flex md:ml-0">
                <div className="relative w-full text-gray-400 dark:text-gray-500 focus-within:text-gray-600 dark:focus-within:text-gray-300">
                  <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none">
                    <Search className="h-5 w-5" />
                  </div>
                  <input
                    className="block w-full h-full pl-8 pr-3 py-2 border-transparent bg-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 dark:focus:placeholder-gray-300 focus:ring-0 focus:border-transparent"
                    placeholder="Buscar..."
                    type="search"
                  />
                </div>
              </div>
            </div>

            {/* Right side */}
            <div className="ml-4 flex items-center md:ml-6 space-x-2">
              {/* Dark mode toggle */}
              <button
                onClick={toggleDarkMode}
                className="bg-white dark:bg-gray-700 p-2 rounded-full text-gray-400 dark:text-gray-300 hover:text-gray-500 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                title={isDarkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
              >
                {isDarkMode ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </button>

              {/* Notifications */}
              <button className="bg-white dark:bg-gray-700 p-2 rounded-full text-gray-400 dark:text-gray-300 hover:text-gray-500 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                <Bell className="h-5 w-5" />
              </button>

              {/* User menu */}
              <div className="ml-3 relative">
                <div>
                  <button
                    className="max-w-xs bg-white dark:bg-gray-700 flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    onClick={() => setShowUserMenu(!showUserMenu)}
                  >
                    <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-blue-500 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  </button>
                </div>

                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.1 }}
                      className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none"
                    >
                      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.nombre}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                      </div>
                      <Link
                        to="/profile"
                        className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => setShowUserMenu(false)}
                      >
                        <Settings className="w-4 h-4 mr-3" />
                        Configuración
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <LogOut className="w-4 h-4 mr-3" />
                        Cerrar sesión
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;