# middleware/security.py - FastAPI version
import os
import time
import ipaddress
import logging
from functools import wraps
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from typing import Callable

logger = logging.getLogger(__name__)

def require_internal_access(func: Callable) -> Callable:
    """Middleware para verificar acceso interno desde Node.js"""
    @wraps(func)
    async def wrapper(request: Request, *args, **kwargs):
        # Verificar header de request interno
        internal_header = request.headers.get('x-internal-request')
        if internal_header != 'true':
            logger.warning(f"Acceso externo bloqueado desde IP: {request.client.host}")
            raise HTTPException(
                status_code=403, 
                detail="Acceso denegado - Solo acceso interno autorizado"
            )
        
        # Verificar headers requeridos del proxy Node.js
        user_id = request.headers.get('x-user-id')
        token_id = request.headers.get('x-api-token-id')
        
        if not user_id or not token_id:
            logger.warning(f"Headers de autorización faltantes desde IP: {request.client.host}")
            raise HTTPException(
                status_code=401,
                detail="Headers de autorización requeridos"
            )
        
        # Verificar IP interna de Docker
        client_ip = request.client.host
        if not is_internal_docker_ip(client_ip):
            logger.warning(f"IP externa no autorizada: {client_ip}")
            raise HTTPException(
                status_code=403,
                detail="Acceso denegado desde IP externa"
            )
        
        # Agregar información al request
        request.state.user_id = user_id
        request.state.api_token_id = token_id
        
        return await func(request, *args, **kwargs)
    
    return wrapper

def is_internal_docker_ip(ip_str: str) -> bool:
    """Verificar si la IP pertenece a la red interna de Docker"""
    try:
        ip = ipaddress.ip_address(ip_str)
        
        # Rangos de IP privadas/Docker
        internal_ranges = [
            ipaddress.ip_network('127.0.0.0/8'),    # Localhost
            ipaddress.ip_network('10.0.0.0/8'),     # Docker default
            ipaddress.ip_network('172.16.0.0/12'),  # Docker compose
            ipaddress.ip_network('192.168.0.0/16'), # Docker bridge
        ]
        
        return any(ip in network for network in internal_ranges)
    except ValueError:
        return False

def validate_ruc_format(ruc_str: str) -> tuple[bool, str]:
    """Validación de formato de RUC ecuatoriano"""
    if not ruc_str or not isinstance(ruc_str, str):
        return False, "RUC debe ser una cadena"
    
    # Solo números
    if not ruc_str.isdigit():
        return False, "RUC debe contener solo números"
    
    # Longitud válida
    if len(ruc_str) not in [10, 13]:
        return False, "RUC debe tener 10 o 13 dígitos"
    
    # Validación de provincia (primeros 2 dígitos)
    try:
        provincia = int(ruc_str[:2])
        if provincia < 1 or provincia > 24:
            return False, "Código de provincia inválido"
    except ValueError:
        return False, "Formato de RUC inválido"
    
    return True, ""

def detect_suspicious_patterns(data: str) -> tuple[bool, str]:
    """Detectar patrones sospechosos"""
    suspicious_patterns = [
        'SELECT', 'UNION', 'INSERT', 'DELETE', 'DROP', 'CREATE',
        '<script', 'javascript:', 'eval(', 'exec(',
        '../', '..\\', '/etc/', '/bin/', '/usr/',
        'system(', 'os.', 'subprocess', 'import os'
    ]
    
    data_lower = str(data).lower()
    
    for pattern in suspicious_patterns:
        if pattern.lower() in data_lower:
            return True, f"Patrón sospechoso detectado: {pattern}"
    
    return False, ""

# Rate limiter simple
class SimpleRateLimiter:
    def __init__(self):
        self.requests = {}  # ip -> [timestamps]
    
    def is_allowed(self, ip: str, limit: int = 10, window: int = 60) -> bool:
        current_time = time.time()
        
        if ip not in self.requests:
            self.requests[ip] = []
        
        # Limpiar requests antiguos
        self.requests[ip] = [
            req_time for req_time in self.requests[ip] 
            if current_time - req_time < window
        ]
        
        # Verificar límite
        if len(self.requests[ip]) >= limit:
            return False
        
        # Agregar request actual
        self.requests[ip].append(current_time)
        return True

rate_limiter = SimpleRateLimiter()

def apply_rate_limit(limit: int = 10, window: int = 60):
    """Decorator para rate limiting"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            client_ip = request.client.host
            
            if not rate_limiter.is_allowed(client_ip, limit, window):
                logger.warning(f"Rate limit excedido para IP {client_ip}")
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error": "Rate limit excedido",
                        "limite": limit,
                        "ventana_segundos": window
                    }
                )
            
            return await func(request, *args, **kwargs)
        return wrapper
    return decorator