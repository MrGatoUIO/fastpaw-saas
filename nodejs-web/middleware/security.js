// middleware/security.js
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Middleware para validar API tokens (para consultas SRI)
const validateAPIToken = async (req, res, next) => {
  const apiToken = req.headers['x-api-key'];
  
  if (!apiToken) {
    await logSecurityEvent(req.ip, null, 'token_invalido', 'media', req.path, 'Missing API token');
    return res.status(401).json({ error: 'API token requerido' });
  }

  try {
    // Hash del token para buscar en BD
    const tokenHash = crypto.createHash('sha256').update(apiToken).digest('hex');
    
    const tokenResult = await pool.query(`
      SELECT at.*, u.estado as usuario_estado, u.rol
      FROM api_tokens at
      JOIN usuarios u ON at.usuario_id = u.id
      WHERE at.token_hash = $1 AND at.estado = 'activo' AND u.estado = 'activo'
    `, [tokenHash]);

    if (tokenResult.rows.length === 0) {
      await logSecurityEvent(req.ip, null, 'token_invalido', 'alta', req.path, apiToken.substring(0, 10) + '...');
      return res.status(401).json({ error: 'API token inválido o revocado' });
    }

    const token = tokenResult.rows[0];

    // Verificar expiración
    if (token.fecha_expiracion && new Date() > new Date(token.fecha_expiracion)) {
      await pool.query('UPDATE api_tokens SET estado = $1 WHERE id = $2', ['expirado', token.id]);
      await logSecurityEvent(req.ip, token.usuario_id, 'token_expirado', 'media', req.path);
      return res.status(401).json({ error: 'API token expirado' });
    }

    // Verificar límites de uso
    const today = new Date().toISOString().split('T')[0];
    const usageResult = await pool.query(
      'SELECT requests_count FROM limits_usage WHERE usuario_id = $1 AND fecha = $2',
      [token.usuario_id, today]
    );

    const currentUsage = usageResult.rows[0]?.requests_count || 0;
    
    if (currentUsage >= token.limite_requests_diario) {
      await logSecurityEvent(req.ip, token.usuario_id, 'rate_limit_excedido', 'media', req.path);
      return res.status(429).json({ 
        error: 'Límite diario de requests excedido',
        limite: token.limite_requests_diario,
        usado: currentUsage
      });
    }

    // Actualizar último uso
    await pool.query(`
      UPDATE api_tokens 
      SET ultimo_uso = CURRENT_TIMESTAMP, ip_ultimo_uso = $1, user_agent_ultimo_uso = $2
      WHERE id = $3
    `, [req.ip, req.get('User-Agent'), token.id]);

    req.apiToken = token;
    req.user = { id: token.usuario_id, rol: token.rol };
    next();

  } catch (error) {
    console.error('Error validando API token:', error);
    await logSecurityEvent(req.ip, null, 'patron_anomalo', 'alta', req.path, error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Middleware de detección de ataques
const detectAttacks = async (req, res, next) => {
  const suspiciousPatterns = [
    /(\bSELECT\b|\bUNION\b|\bINSERT\b|\bDELETE\b|\bDROP\b)/i, // SQL Injection
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,      // XSS
    /(\.\.|\/etc\/|\/bin\/|\/usr\/)/i,                          // Path Traversal
    /(\beval\b|\bexec\b|\bsystem\b)/i                           // Command Injection
  ];

  const payload = JSON.stringify(req.body) + req.query.toString() + req.params.toString();
  
  for (let pattern of suspiciousPatterns) {
    if (pattern.test(payload)) {
      let attackType = 'malformed_input';
      if (pattern.source.includes('SELECT|UNION')) attackType = 'sql_injection';
      if (pattern.source.includes('script')) attackType = 'xss';
      if (pattern.source.includes('etc|bin')) attackType = 'path_traversal';
      if (pattern.source.includes('eval|exec')) attackType = 'command_injection';

      await logAttackAttempt(req.ip, req.user?.id, attackType, 'alta', payload, req.path, req.method);
      
      return res.status(400).json({ error: 'Solicitud malformada detectada' });
    }
  }
  next();
};

// Log de eventos de seguridad
const logSecurityEvent = async (ip, userId, eventType, severity, endpoint, payload = null) => {
  try {
    await pool.query(`
      INSERT INTO security_events (ip_address, usuario_id, evento_tipo, severidad, endpoint, payload_sospechoso, user_agent, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `, [ip, userId, eventType, severity, endpoint, payload, null]);
  } catch (error) {
    console.error('Error logging security event:', error);
  }
};

// Log de intentos de ataque
const logAttackAttempt = async (ip, userId, attackType, severity, payload, endpoint, method) => {
  try {
    const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');
    
    await pool.query(`
      INSERT INTO attack_attempts (ip_address, usuario_id, attack_type, severidad, payload, payload_hash, endpoint, metodo_http)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [ip, userId, attackType, severity, payload, payloadHash, endpoint, method]);
    
    // Auto-bloquear IPs con múltiples ataques
    const recentAttacks = await pool.query(`
      SELECT COUNT(*) as count FROM attack_attempts 
      WHERE ip_address = $1 AND timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour'
    `, [ip]);
    
    if (recentAttacks.rows[0].count >= 5) {
      await pool.query(`
        INSERT INTO blocked_ips (ip_address, razon, tipo_bloqueo, bloqueado_hasta, intentos_fallidos)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (ip_address) DO UPDATE SET
          bloqueado_hasta = $4,
          intentos_fallidos = blocked_ips.intentos_fallidos + 1,
          veces_bloqueado = blocked_ips.veces_bloqueado + 1
      `, [ip, 'Múltiples intentos de ataque detectados', 'temporal', 
          new Date(Date.now() + 24 * 60 * 60 * 1000), recentAttacks.rows[0].count]);
    }
    
  } catch (error) {
    console.error('Error logging attack attempt:', error);
  }
};

// Middleware para verificar IPs bloqueadas
const checkBlockedIP = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT * FROM blocked_ips 
      WHERE ip_address = $1 AND (bloqueado_hasta IS NULL OR bloqueado_hasta > CURRENT_TIMESTAMP)
    `, [req.ip]);
    
    if (result.rows.length > 0) {
      const block = result.rows[0];
      return res.status(403).json({ 
        error: 'IP bloqueada por actividad sospechosa',
        razon: block.razon,
        hasta: block.bloqueado_hasta
      });
    }
    
    next();
  } catch (error) {
    console.error('Error checking blocked IP:', error);
    next();
  }
};

module.exports = {
  validateAPIToken,
  detectAttacks,
  checkBlockedIP,
  logSecurityEvent,
  logAttackAttempt
};