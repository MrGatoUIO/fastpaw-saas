// components/TokenModal.js
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, CheckCircle, AlertTriangle, X, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

const TokenModal = ({ isOpen, onClose, token, tokenInfo }) => {
  const [copied, setCopied] = useState(false);
  const [showToken, setShowToken] = useState(true);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Seleccionar todo el texto cuando se abre el modal
      setTimeout(() => {
        inputRef.current.select();
        inputRef.current.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      toast.success('Token copiado al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Error al copiar token');
    }
  };

  const handleSelectAll = () => {
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Token API Generado
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {tokenInfo?.nombre || 'Nuevo token'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                  Importante: Guarda este token ahora
                </p>
                <p className="text-yellow-700 dark:text-yellow-300">
                  Por seguridad, este token no se mostrará de nuevo. Cópialo y guárdalo en un lugar seguro.
                </p>
              </div>
            </div>
          </div>

          {/* Token Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tu Token API
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showToken ? "text" : "password"}
                value={token}
                readOnly
                className="w-full px-4 py-3 pr-20 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onClick={handleSelectAll}
              />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex space-x-1">
                <button
                  onClick={() => setShowToken(!showToken)}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                  title={showToken ? "Ocultar token" : "Mostrar token"}
                >
                  {showToken ? (
                    <EyeOff className="w-4 h-4 text-gray-500" />
                  ) : (
                    <Eye className="w-4 h-4 text-gray-500" />
                  )}
                </button>
                <button
                  onClick={handleCopy}
                  className={`p-1.5 rounded transition-colors ${
                    copied 
                      ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400' 
                      : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500'
                  }`}
                  title="Copiar token"
                >
                  {copied ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Haz clic en el input para seleccionar todo el token
            </p>
          </div>

          {/* Token Info */}
          {tokenInfo && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                Información del Token
              </h4>
              <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex justify-between">
                  <span>Límite diario:</span>
                  <span className="font-medium">{tokenInfo.limite_requests_diario || 1000} consultas</span>
                </div>
                <div className="flex justify-between">
                  <span>Descripción:</span>
                  <span className="font-medium">{tokenInfo.descripcion || 'Sin descripción'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Creado:</span>
                  <span className="font-medium">Ahora</span>
                </div>
              </div>
            </div>
          )}

          {/* Usage Example */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
              Ejemplo de uso
            </h4>
            <code className="text-xs text-blue-800 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">
              GET /public/consultar/{'{token}'}/{'{ruc}'}
            </code>
          </div>

          {/* Actions */}
          <div className="flex space-x-3">
            <button
              onClick={handleCopy}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {copied ? 'Copiado!' : 'Copiar Token'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TokenModal;