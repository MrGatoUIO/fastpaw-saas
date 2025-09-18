// server.js - Backend Web para autenticación y dashboard FastPaw SaaS
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const moment = require('moment');
const morgan = require('morgan');
const compression = require('compression');
const axios = require('axios');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configuración de PostgreSQL (ÚNICO)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://fastpaw_admin:Fastpaw2024!@postgres:5432/fastpaw_saas',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const { 
  validateAPIToken, 
  detectAttacks, 
  checkBlockedIP,
  logSecurityEvent 
} = require('./middleware/security');

// Middlewares de seguridad
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: ['http://localhost:3000', 'http://react-frontend:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(checkBlockedIP);
app.use(detectAttacks);

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos de login, intenta en 15 minutos' }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas peticiones, intenta más tarde' }
});

// Middleware de autenticación JWT
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fastpaw_jwt_secret_2024_super_secure');
    
    const userResult = await pool.query(
      'SELECT id, email, rol, estado FROM usuarios WHERE id = $1 AND estado = $2',
      [decoded.userId, 'activo']
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    console.error('Error verificando token:', error);
    return res.status(403).json({ error: 'Token inválido' });
  }
};

// Middleware para verificar rol de administrador
const requireAdmin = (req, res, next) => {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de administrador' });
  }
  next();
};

// ============= RUTAS DE AUTENTICACIÓN =============

app.post('/auth/register', 
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('nombre').trim().isLength({ min: 2 }),
    body('empresa').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
      }

      const { email, password, nombre, empresa, telefono } = req.body;

      const existingUser = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'El email ya está registrado' });
      }

      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const verificationToken = crypto.randomBytes(32).toString('hex');

      const result = await pool.query(`
        INSERT INTO usuarios (email, password_hash, nombre, empresa, telefono, token_verificacion)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, nombre, empresa, plan, estado
      `, [email, passwordHash, nombre, empresa || null, telefono || null, verificationToken]);

      const newUser = result.rows[0];

      res.status(201).json({
        message: 'Usuario registrado exitosamente',
        user: {
          id: newUser.id,
          email: newUser.email,
          nombre: newUser.nombre,
          empresa: newUser.empresa,
          plan: newUser.plan,
          estado: newUser.estado
        }
      });

    } catch (error) {
      console.error('Error en registro:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
);

app.post('/auth/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').exists()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Email y contraseña requeridos' });
      }

      const { email, password } = req.body;
      const clientIp = req.ip || req.connection.remoteAddress;

      const userResult = await pool.query(
        'SELECT id, email, password_hash, nombre, rol, estado, plan FROM usuarios WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        await pool.query(`
          INSERT INTO security_events (ip_address, evento_tipo, severidad, endpoint, payload_sospechoso)
          VALUES ($1, $2, $3, $4, $5)
        `, [clientIp, 'login_fallido', 'media', '/auth/login', email]);

        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      const user = userResult.rows[0];

      if (user.estado !== 'activo') {
        return res.status(401).json({ 
          error: 'Cuenta inactiva',
          estado: user.estado 
        });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        await pool.query(`
          INSERT INTO security_events (ip_address, usuario_id, evento_tipo, severidad, endpoint)
          VALUES ($1, $2, $3, $4, $5)
        `, [clientIp, user.id, 'login_fallido', 'media', '/auth/login']);

        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      await pool.query(
        'UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );

      const token = jwt.sign(
        { userId: user.id, email: user.email, rol: user.rol },
        process.env.JWT_SECRET || 'fastpaw_jwt_secret_2024_super_secure',
        { expiresIn: '24h' }
      );

      res.json({
        message: 'Login exitoso',
        token,
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          rol: user.rol,
          plan: user.plan
        }
      });

    } catch (error) {
      console.error('Error en login:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
);

// ============= RUTAS DEL DASHBOARD =============

app.get('/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const statsQuery = `
      SELECT 
        COUNT(*) as total_consultas,
        COUNT(*) FILTER (WHERE status_code = 200) as consultas_exitosas,
        COUNT(*) FILTER (WHERE status_code != 200) as consultas_fallidas,
        AVG(tiempo_respuesta) as tiempo_promedio,
        SUM(costo_creditos) as creditos_usados
      FROM requests_log 
      WHERE usuario_id = $1 AND timestamp >= CURRENT_DATE - INTERVAL '30 days'
    `;

    const statsResult = await pool.query(statsQuery, [userId]);
    const stats = statsResult.rows[0];

    const dailyQuery = `
      SELECT 
        DATE(timestamp) as fecha,
        COUNT(*) as consultas,
        COUNT(*) FILTER (WHERE status_code = 200) as exitosas
      FROM requests_log 
      WHERE usuario_id = $1 AND timestamp >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(timestamp)
      ORDER BY fecha
    `;

    const dailyResult = await pool.query(dailyQuery, [userId]);

    const userQuery = `
      SELECT u.plan, u.nombre, u.empresa,
             at.limite_requests_diario, at.requests_utilizados_hoy
      FROM usuarios u
      LEFT JOIN api_tokens at ON u.id = at.usuario_id AND at.estado = 'activo'
      WHERE u.id = $1
      LIMIT 1
    `;

    const userResult = await pool.query(userQuery, [userId]);
    const userInfo = userResult.rows[0];

    res.json({
      stats: {
        total_consultas: parseInt(stats.total_consultas) || 0,
        consultas_exitosas: parseInt(stats.consultas_exitosas) || 0,
        consultas_fallidas: parseInt(stats.consultas_fallidas) || 0,
        tiempo_promedio: parseFloat(stats.tiempo_promedio) || 0,
        creditos_usados: parseFloat(stats.creditos_usados) || 0
      },
      daily_stats: dailyResult.rows,
      user_info: userInfo,
      limite_diario: userInfo?.limite_requests_diario || 1000,
      usado_hoy: userInfo?.requests_utilizados_hoy || 0
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// ============= GESTIÓN DE TOKENS API =============

app.get('/tokens', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, nombre, descripcion, limite_requests_diario, requests_utilizados_hoy,
             estado, ultimo_uso, total_requests_historico, created_at
      FROM api_tokens 
      WHERE usuario_id = $1 
      ORDER BY created_at DESC
    `, [req.user.id]);

    res.json({ tokens: result.rows });
  } catch (error) {
    console.error('Error obteniendo tokens:', error);
    res.status(500).json({ error: 'Error obteniendo tokens' });
  }
});

app.post('/tokens/generate', 
  authenticateToken,
  [
    body('nombre').trim().isLength({ min: 1, max: 100 }),
    body('descripcion').optional().trim(),
    body('limite_diario').optional().isInt({ min: 1, max: 10000 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
      }

      const { nombre, descripcion, limite_diario } = req.body;
      
      const token = `fp_${crypto.randomBytes(32).toString('hex')}`;
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const result = await pool.query(`
        INSERT INTO api_tokens (usuario_id, token_hash, nombre, descripcion, limite_requests_diario)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, nombre, descripcion, limite_requests_diario, created_at
      `, [req.user.id, tokenHash, nombre, descripcion || null, limite_diario || 1000]);

      res.status(201).json({
        message: 'Token generado exitosamente',
        token,
        token_info: result.rows[0]
      });

    } catch (error) {
      console.error('Error generando token:', error);
      res.status(500).json({ error: 'Error generando token' });
    }
  }
);

app.delete('/tokens/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE api_tokens SET estado = $1 WHERE id = $2 AND usuario_id = $3 RETURNING id',
      ['revocado', req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Token no encontrado' });
    }

    res.json({ message: 'Token revocado exitosamente' });
  } catch (error) {
    console.error('Error revocando token:', error);
    res.status(500).json({ error: 'Error revocando token' });
  }
});

// ============= RUTAS DE ADMINISTRACIÓN =============

app.get('/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, nombre, empresa, email, rol, estado, plan, 
             fecha_registro, ultimo_acceso, email_verificado
      FROM usuarios 
      ORDER BY fecha_registro DESC
    `);

    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

app.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const generalStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT u.id) as total_usuarios,
        COUNT(DISTINCT u.id) FILTER (WHERE u.estado = 'activo') as usuarios_activos,
        COUNT(DISTINCT at.id) as total_tokens,
        COUNT(DISTINCT rl.id) as total_consultas,
        COUNT(DISTINCT rl.id) FILTER (WHERE rl.timestamp >= CURRENT_DATE) as consultas_hoy
      FROM usuarios u
      LEFT JOIN api_tokens at ON u.id = at.usuario_id
      LEFT JOIN requests_log rl ON u.id = rl.usuario_id
    `);

    const topUsers = await pool.query(`
      SELECT u.nombre, u.email, u.empresa, COUNT(rl.id) as total_consultas
      FROM usuarios u
      LEFT JOIN requests_log rl ON u.id = rl.usuario_id
      WHERE rl.timestamp >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY u.id, u.nombre, u.email, u.empresa
      ORDER BY total_consultas DESC
      LIMIT 10
    `);

    res.json({
      general: generalStats.rows[0],
      top_users: topUsers.rows
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas admin:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// ============= ENDPOINTS DE ADMINISTRACIÓN PARA PYTHON API =============

app.get('/admin/system/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pythonResponse = await axios.get('http://python-api:8000/status', {
      timeout: 10000
    });

    res.json({
      success: true,
      python_api: pythonResponse.data,
      node_api: {
        status: 'healthy',
        version: '1.0.0',
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error obteniendo status del sistema:', error);
    
    res.status(503).json({
      success: false,
      error: 'Python API no disponible',
      python_api: null,
      node_api: {
        status: 'healthy',
        version: '1.0.0',
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        timestamp: new Date().toISOString()
      },
      details: error.message
    });
  }
});

app.post('/admin/pool/refresh', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pythonResponse = await axios.post('http://python-api:8000/pool/refresh', {}, {
      headers: {
        'Authorization': 'Bearer sri_hybrid_token_2024',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    await pool.query(`
      INSERT INTO security_events (ip_address, usuario_id, evento_tipo, severidad, endpoint, detalles)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      req.ip,
      req.user.id,
      'pool_refresh',
      'alta',
      '/admin/pool/refresh',
      JSON.stringify({ admin_user: req.user.email, timestamp: new Date().toISOString() })
    ]);

    res.json({
      success: true,
      message: 'Pool híbrido reiniciado exitosamente',
      python_response: pythonResponse.data,
      admin_user: req.user.email,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error reiniciando pool:', error);

    await pool.query(`
      INSERT INTO security_events (ip_address, usuario_id, evento_tipo, severidad, endpoint, detalles)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      req.ip,
      req.user.id,
      'pool_refresh_failed',
      'alta',
      '/admin/pool/refresh',
      JSON.stringify({ error: error.message, admin_user: req.user.email })
    ]);

    if (error.response) {
      res.status(error.response.status).json({
        success: false,
        error: 'Error en Python API',
        details: error.response.data,
        admin_user: req.user.email
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Python API no disponible',
        details: error.message,
        admin_user: req.user.email
      });
    }
  }
});

app.get('/admin/health', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const checks = await Promise.allSettled([
      axios.get('http://python-api:8000/health', { timeout: 5000 }),
      pool.query('SELECT 1 as health_check')
    ]);

    const pythonHealth = checks[0].status === 'fulfilled' ? checks[0].value.data : null;
    const dbHealth = checks[1].status === 'fulfilled' ? 'healthy' : 'unhealthy';

    const overallHealth = pythonHealth && dbHealth === 'healthy' ? 'healthy' : 'degraded';

    res.json({
      overall_status: overallHealth,
      services: {
        python_api: {
          status: pythonHealth ? 'healthy' : 'unhealthy',
          data: pythonHealth,
          note: "Incluye estado de Redis interno"
        },
        database: {
          status: dbHealth,
          connection_pool: {
            total_connections: pool.totalCount,
            idle_connections: pool.idleCount,
            waiting_requests: pool.waitingCount
          }
        },
        node_api: {
          status: 'healthy',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.version
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error en health check:', error);
    res.status(500).json({
      overall_status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/consultar - Proxy para Python API
app.post('/api/consultar', 
  authenticateToken,
  async (req, res) => {
    try {
      const { ruc, metodo } = req.body;
      const userId = req.user.id;

      const pythonResponse = await axios.post('http://python-api:8000/consultar', {
        ruc: ruc,
        metodo: metodo || 'hybrid'
      }, {
        headers: {
          'x-internal-request': 'true',
          'x-user-id': userId.toString(),
          'x-api-token-id': '1',
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      res.json(pythonResponse.data);

    } catch (error) {
      console.error('Error en consulta:', error);
      if (error.response) {
        res.status(error.response.status).json(error.response.data);
      } else {
        res.status(500).json({ error: 'Error interno del servidor' });
      }
    }
  }
);

// ============= HEALTH CHECK =============

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'FastPaw Web Backend'
  });
});

app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 FastPaw Web Backend ejecutándose en puerto ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

app.get('/public/consultar/:token/:ruc', async (req, res) => {
  try {
    const { token, ruc } = req.params;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Validar formato del token
    if (!token || !token.startsWith('fp_')) {
      return res.status(401).json({ error: 'Formato de token inválido' });
    }
    
    // Validar formato del RUC
    if (!ruc || !/^\d+$/.test(ruc) || ![10, 13].includes(ruc.length)) {
      return res.status(400).json({ error: 'RUC inválido - debe tener 10 o 13 dígitos' });
    }
    
    // Buscar y validar token en base de datos
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenResult = await pool.query(`
      SELECT at.*, u.nombre, u.email, u.estado as user_estado, u.plan
      FROM api_tokens at
      JOIN usuarios u ON at.usuario_id = u.id
      WHERE at.token_hash = $1 AND at.estado = 'activo' AND u.estado = 'activo'
    `, [tokenHash]);

    if (tokenResult.rows.length === 0) {
      // Log intento de acceso con token inválido
      await pool.query(`
        INSERT INTO security_events (ip_address, evento_tipo, severidad, endpoint, payload_sospechoso)
        VALUES ($1, $2, $3, $4, $5)
      `, [clientIp, 'token_invalido', 'alta', '/public/consultar', token.substring(0, 10) + '...']);
      
      return res.status(401).json({ error: 'Token inválido o inactivo' });
    }

    const tokenData = tokenResult.rows[0];

    // Verificar límite diario
    if (tokenData.requests_utilizados_hoy >= tokenData.limite_requests_diario) {
      // Log límite excedido
      await pool.query(`
        INSERT INTO security_events (ip_address, usuario_id, evento_tipo, severidad, endpoint, detalles)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        clientIp, 
        tokenData.usuario_id, 
        'limite_excedido', 
        'media', 
        '/public/consultar',
        JSON.stringify({ limite: tokenData.limite_requests_diario, usado: tokenData.requests_utilizados_hoy })
      ]);
      
      return res.status(429).json({ 
        error: 'Límite diario excedido', 
        limite: tokenData.limite_requests_diario,
        usado: tokenData.requests_utilizados_hoy,
        resetea_en: '24 horas'
      });
    }

    // Actualizar estadísticas del token ANTES de la consulta
    await pool.query(`
      UPDATE api_tokens 
      SET requests_utilizados_hoy = requests_utilizados_hoy + 1,
          total_requests_historico = total_requests_historico + 1,
          ultimo_uso = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [tokenData.id]);

    // Log consulta autorizada
    console.log(`✅ Consulta pública autorizada: user=${tokenData.email}, token=${tokenData.nombre}, ruc=${ruc}`);

    // Llamar a Python API con datos del token real
    const pythonResponse = await axios.post('http://python-api:8000/public', {
      token: token,
      ruc: ruc
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-user-context': JSON.stringify({
          user_id: tokenData.usuario_id,
          user_email: tokenData.email,
          token_name: tokenData.nombre,
          plan: tokenData.plan
        })
      },
      timeout: 30000
    });

    // Log resultado exitoso en requests_log
    await pool.query(`
      INSERT INTO requests_log (usuario_id, token_id, endpoint, cedula_consultada, status_code, tiempo_respuesta, ip_cliente)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      tokenData.usuario_id,
      tokenData.id,
      '/public/consultar',
      ruc,
      200,
      parseFloat(pythonResponse.data.api_metadata?.total_api_time?.replace('s', '') || '0'),
      clientIp
    ]);

    // Agregar información del token a la respuesta
    const response = {
      ...pythonResponse.data,
      token_info: {
        usuario: tokenData.nombre,
        plan: tokenData.plan,
        requests_restantes: tokenData.limite_requests_diario - tokenData.requests_utilizados_hoy - 1,
        limite_diario: tokenData.limite_requests_diario
      }
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Error en consulta pública:', error);
    
    // Log error en base de datos si tenemos info del token
    try {
      const tokenHash = crypto.createHash('sha256').update(req.params.token || '').digest('hex');
      const tokenResult = await pool.query('SELECT usuario_id, id FROM api_tokens WHERE token_hash = $1', [tokenHash]);
      
      if (tokenResult.rows.length > 0) {
        await pool.query(`
          INSERT INTO requests_log (usuario_id, token_id, endpoint, cedula_consultada, status_code, mensaje_respuesta, ip_cliente)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          tokenResult.rows[0].usuario_id,
          tokenResult.rows[0].id,
          '/public/consultar',
          req.params.ruc || 'unknown',
          error.response?.status || 500,
          error.message,
          req.ip
        ]);
      }
    } catch (logError) {
      console.error('Error logging request:', logError);
    }
    
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ 
        error: 'Error interno del servidor',
        message: 'No se pudo procesar la consulta'
      });
    }
  }
});