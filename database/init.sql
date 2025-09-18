-- Esquema Completo Base de Datos SRI API System
-- Total: 7 tablas para autenticación, autorización, auditoría y seguridad

-- 1. TABLA USUARIOS (Clientes del sistema)
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    empresa VARCHAR(100),
    email VARCHAR(100) UNIQUE NOT NULL,
    telefono VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL, -- Para login en portal web
    rol VARCHAR(20) CHECK (rol IN ('cliente', 'admin', 'moderador')) DEFAULT 'cliente',
    estado VARCHAR(30) CHECK (estado IN ('activo', 'suspendido', 'inactivo', 'pendiente_confirmacion')) DEFAULT 'pendiente_confirmacion',
    plan VARCHAR(20) CHECK (plan IN ('free', 'basic', 'premium', 'enterprise')) DEFAULT 'free',
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_acceso TIMESTAMP,
    email_verificado BOOLEAN DEFAULT FALSE,
    token_verificacion VARCHAR(255), -- Para confirmar email
    direccion_ip_permitida INET[], -- Restricciones por IP si es necesario
    notas_admin TEXT, -- Notas internas del administrador
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance usuarios
CREATE INDEX idx_email ON usuarios(email);
CREATE INDEX idx_estado ON usuarios(estado);
CREATE INDEX idx_plan ON usuarios(plan);
CREATE INDEX idx_fecha_registro ON usuarios(fecha_registro);

-- 2. TABLA API_TOKENS (Tokens de acceso a la API)
CREATE TABLE api_tokens (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA256 del token real
    nombre VARCHAR(100) NOT NULL, -- "Token Producción", "Token Desarrollo"
    descripcion TEXT, -- Descripción opcional del uso del token
    permisos JSONB DEFAULT '{"consultar": true, "batch": true, "admin": false}',
    limite_requests_diario INTEGER NOT NULL DEFAULT 1000,
    requests_utilizados_hoy INTEGER DEFAULT 0,
    estado VARCHAR(20) CHECK (estado IN ('activo', 'revocado', 'expirado', 'suspendido')) DEFAULT 'activo',
    fecha_expiracion TIMESTAMP, -- NULL = nunca expira
    ultimo_uso TIMESTAMP,
    ip_ultimo_uso INET,
    user_agent_ultimo_uso TEXT,
    total_requests_historico BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para autenticación rápida
CREATE INDEX idx_token_hash ON api_tokens(token_hash);
CREATE INDEX idx_usuario_activo ON api_tokens(usuario_id, estado);
CREATE INDEX idx_estado_expiracion ON api_tokens(estado, fecha_expiracion);

-- 3. TABLA REQUESTS_LOG (Auditoría completa y billing)
CREATE TABLE requests_log (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id),
    token_id INTEGER REFERENCES api_tokens(id),
    endpoint VARCHAR(50) NOT NULL, -- '/consultar', '/consultar_multiple'
    metodo_http VARCHAR(10) DEFAULT 'POST',
    cedula_consultada VARCHAR(13), -- La cédula/RUC consultado
    cantidad_cedulas INTEGER DEFAULT 1, -- Para batch requests
    metodo_usado VARCHAR(50), -- 'hybrid_aiohttp', 'fallback_ecuadorlegal', 'api_publica_sri'
    tiempo_respuesta DECIMAL(6,3), -- En segundos
    status_code INTEGER NOT NULL,
    mensaje_respuesta TEXT, -- Para errores o información adicional
    ip_cliente INET NOT NULL,
    user_agent TEXT,
    referrer TEXT,
    costo_creditos DECIMAL(10,2) DEFAULT 1.0, -- Para facturación futura
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para reportes y análisis
CREATE INDEX idx_usuario_fecha ON requests_log(usuario_id, timestamp);
CREATE INDEX idx_cedula_consultada ON requests_log(cedula_consultada);
CREATE INDEX idx_timestamp ON requests_log(timestamp);
CREATE INDEX idx_endpoint_status ON requests_log(endpoint, status_code);
CREATE INDEX idx_metodo_usado ON requests_log(metodo_usado);
CREATE INDEX idx_ip_cliente ON requests_log(ip_cliente);

-- 4. TABLA LIMITS_USAGE (Control de cuotas diarias/mensuales)
CREATE TABLE limits_usage (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    requests_count INTEGER DEFAULT 0,
    requests_exitosos INTEGER DEFAULT 0,
    requests_fallidos INTEGER DEFAULT 0,
    tiempo_total_respuesta DECIMAL(10,3) DEFAULT 0, -- Suma de todos los tiempos
    ultimo_request TIMESTAMP,
    ultimo_reset TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    overage_count INTEGER DEFAULT 0, -- Requests que excedieron el límite
    UNIQUE(usuario_id, fecha)
);

CREATE INDEX idx_usuario_fecha_limits ON limits_usage(usuario_id, fecha);
CREATE INDEX idx_fecha_limits ON limits_usage(fecha);

-- 5. TABLA SECURITY_EVENTS (Monitoreo de amenazas y comportamientos sospechosos)
CREATE TABLE security_events (
    id SERIAL PRIMARY KEY,
    ip_address INET NOT NULL,
    usuario_id INTEGER REFERENCES usuarios(id), -- NULL si no está autenticado
    token_id INTEGER REFERENCES api_tokens(id), -- NULL si no hay token válido
    evento_tipo VARCHAR(30) CHECK (evento_tipo IN ('login_fallido', 'token_invalido', 'token_expirado', 'rate_limit_excedido', 'ip_sospechosa', 'patron_anomalo', 'multiple_tokens')) NOT NULL,
    severidad VARCHAR(10) CHECK (severidad IN ('baja', 'media', 'alta', 'critica')) DEFAULT 'media',
    endpoint VARCHAR(50),
    metodo_http VARCHAR(10),
    payload_sospechoso TEXT, -- Input que causó la alerta
    user_agent TEXT,
    referrer TEXT,
    intentos_count INTEGER DEFAULT 1,
    resuelto BOOLEAN DEFAULT FALSE,
    notas_investigacion TEXT,
    investigado_por INTEGER REFERENCES usuarios(id), -- Admin que investigó
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ip_timestamp ON security_events(ip_address, timestamp);
CREATE INDEX idx_tipo_severidad ON security_events(evento_tipo, severidad);
CREATE INDEX idx_timestamp_security ON security_events(timestamp);
CREATE INDEX idx_resuelto ON security_events(resuelto);
CREATE INDEX idx_usuario_evento ON security_events(usuario_id, evento_tipo);

-- 6. TABLA BLOCKED_IPS (IPs bloqueadas por comportamiento malicioso)
CREATE TABLE blocked_ips (
    id SERIAL PRIMARY KEY,
    ip_address INET UNIQUE NOT NULL,
    razon VARCHAR(200) NOT NULL, -- "Fuerza bruta", "Abuso de API", "Inyección SQL"
    tipo_bloqueo VARCHAR(20) CHECK (tipo_bloqueo IN ('temporal', 'permanente', 'escalado')) DEFAULT 'temporal',
    bloqueado_hasta TIMESTAMP, -- NULL para bloqueos permanentes
    intentos_fallidos INTEGER NOT NULL DEFAULT 0,
    ultimo_intento TIMESTAMP,
    primer_incidente TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    bloqueado_por VARCHAR(50) DEFAULT 'sistema_automatico', -- 'admin_manual', 'sistema_automatico'
    admin_id INTEGER REFERENCES usuarios(id), -- Si fue bloqueado manualmente
    puede_apelar BOOLEAN DEFAULT TRUE,
    apelacion_enviada BOOLEAN DEFAULT FALSE,
    notas_bloqueo TEXT,
    veces_bloqueado INTEGER DEFAULT 1, -- Contador de bloqueos históricos
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ip_address_blocked ON blocked_ips(ip_address);
CREATE INDEX idx_bloqueado_hasta ON blocked_ips(bloqueado_hasta);
CREATE INDEX idx_tipo_bloqueo ON blocked_ips(tipo_bloqueo);
CREATE INDEX idx_timestamp_blocked ON blocked_ips(created_at);

-- 7. TABLA ATTACK_ATTEMPTS (Intentos de inyección y ataques)
CREATE TABLE attack_attempts (
    id SERIAL PRIMARY KEY,
    ip_address INET NOT NULL,
    usuario_id INTEGER REFERENCES usuarios(id), -- Si estaba autenticado
    attack_type VARCHAR(30) CHECK (attack_type IN ('sql_injection', 'xss', 'path_traversal', 'command_injection', 'malformed_input', 'scanner_bot', 'ddos_attempt')) NOT NULL,
    severidad VARCHAR(10) CHECK (severidad IN ('baja', 'media', 'alta', 'critica')) DEFAULT 'media',
    payload TEXT NOT NULL, -- El input malicioso completo
    payload_hash VARCHAR(64), -- Hash del payload para detección de repeticiones
    endpoint VARCHAR(50) NOT NULL,
    metodo_http VARCHAR(10) DEFAULT 'POST',
    user_agent TEXT,
    referrer TEXT,
    headers_completos JSONB, -- Todos los headers HTTP para análisis
    bloqueado_automaticamente BOOLEAN DEFAULT FALSE,
    reportado_a_autoridades BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ip_type ON attack_attempts(ip_address, attack_type);
CREATE INDEX idx_attack_type ON attack_attempts(attack_type);
CREATE INDEX idx_severidad_attack ON attack_attempts(severidad);
CREATE INDEX idx_timestamp_attack ON attack_attempts(timestamp);
CREATE INDEX idx_payload_hash ON attack_attempts(payload_hash);
CREATE INDEX idx_endpoint_attack ON attack_attempts(endpoint);

-- TRIGGERS para actualizaciones automáticas
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_usuarios_updated_at 
    BEFORE UPDATE ON usuarios 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_tokens_updated_at 
    BEFORE UPDATE ON api_tokens 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blocked_ips_updated_at 
    BEFORE UPDATE ON blocked_ips 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- DATOS INICIALES
-- Crear usuario administrador inicial
INSERT INTO usuarios (
    nombre, 
    email, 
    password_hash, 
    rol, 
    estado, 
    plan, 
    email_verificado
) VALUES (
    'Administrador Sistema', 
    'admin@fastpaw.com', 
    '$2b$12$LQv3c1yqBWVHxkd0LQ4YCOYz6TtxMQJqhN8/gX7/X8O8HGjKQE9HK', -- password: admin123
    'admin', 
    'activo', 
    'enterprise', 
    TRUE
);

-- Comentarios de documentación
COMMENT ON TABLE usuarios IS 'Usuarios registrados en el sistema (clientes y administradores)';
COMMENT ON TABLE api_tokens IS 'Tokens de acceso a la API con permisos granulares';
COMMENT ON TABLE requests_log IS 'Log completo de todas las peticiones para auditoría y billing';
COMMENT ON TABLE limits_usage IS 'Control de cuotas y límites de uso por usuario';
COMMENT ON TABLE security_events IS 'Eventos de seguridad y comportamientos sospechosos';
COMMENT ON TABLE blocked_ips IS 'IPs bloqueadas por actividad maliciosa';
COMMENT ON TABLE attack_attempts IS 'Intentos de ataque e inyecciones detectados';