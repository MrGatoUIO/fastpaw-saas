# main.py - FastAPI con Pool Híbrido Selenium + aiohttp
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials  
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from fastapi import Request
from pydantic import BaseModel, field_validator
from contextlib import asynccontextmanager
from typing import List, Optional
import asyncio
import logging
from datetime import datetime
from middleware.security import require_internal_access, apply_rate_limit, validate_ruc_format, detect_suspicious_patterns


# Import del sistema híbrido
from sri_hybrid_manager import SRIHybridPool
from sri_fallback_manager import SRIFallbackManager, validar_cedula_ecuatoriana_sync

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Modelos Pydantic
class ConsultaRequest(BaseModel):
    cedula: str
    
    @field_validator('cedula')
    @classmethod
    def validate_cedula(cls, v):
        if not v.isdigit():
            raise ValueError('Cédula debe contener solo números')
        if len(v) not in [10, 13]:
            raise ValueError('Cédula debe ser cédula (10 dígitos) o RUC (13 dígitos)')
        return v

class ConsultaMultipleRequest(BaseModel):
    cedulas: List[str]
    usar_fallback: Optional[bool] = False  # Por defecto usar híbrido

class CedulaValidationRequest(BaseModel):
    cedula: str

# Variables globales
hybrid_pool = None
fallback_manager = None

# Lifespan handler
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 🚀 STARTUP
    global hybrid_pool, fallback_manager
    
    logger.info("🚀 Iniciando SRI Smart API v3.0 HÍBRIDA...")
    logger.info("✨ Características NUEVAS:")
    logger.info("   - Pool híbrido: Selenium login + aiohttp consultas")
    logger.info("   - Velocidad: 0.1-0.3s por consulta")
    logger.info("   - Concurrencia real: múltiples sesiones simultáneas")
    logger.info("   - Fallback inteligente disponible")
    logger.info("   - Anti-detección: comportamiento de navegador real")
    
    try:
        # Inicializar pool híbrido
        logger.info("🔧 Configurando pool híbrido...")
        hybrid_pool = SRIHybridPool(max_sessions=3)  # 3 sesiones para empezar
        
        logger.info("🔑 Iniciando logins con Selenium...")
        sesiones_activas = await hybrid_pool.initialize()
        
        # Inicializar fallback manager
        fallback_manager = SRIFallbackManager()
        
        if sesiones_activas > 0:
            logger.info(f"✅ Sistema híbrido listo: {sesiones_activas}/3 sesiones")
            logger.info("⚡ API disponible para consultas ultrarrápidas")
        else:
            logger.warning("⚠️ Pool híbrido falló - solo fallbacks disponibles")
            
    except Exception as e:
        logger.error(f"❌ Error crítico en startup híbrido: {e}")
        # No hacer raise - permitir que funcione solo con fallbacks
    
    yield
    
    # 🔒 SHUTDOWN
    logger.info("🔒 Cerrando SRI Smart API Híbrida...")
    if hybrid_pool:
        await hybrid_pool.close_all()
    logger.info("✅ API cerrada correctamente")

# FastAPI app
app = FastAPI(
    title="SRI Smart API Híbrida",
    description="API híbrida ultrarrápida: Selenium + aiohttp para consultas de cédulas y RUC ecuatorianos",
    version="3.0",
    lifespan=lifespan,
    docs_url=None,  # Deshabilitar docs automático
    redoc_url=None  # Deshabilitar redoc automático
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configurar archivos estáticos y templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Ruta para la interfaz personalizada
@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Ruta personalizada para /docs
@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html(request: Request):
    return templates.TemplateResponse("swagger-custom.html", {"request": request})

# Security
security = HTTPBearer(auto_error=False)

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Autenticación simple"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Token requerido")
    
    if credentials.credentials != "sri_hybrid_token_2024":
        raise HTTPException(status_code=401, detail="Token inválido")
    
    return credentials.credentials

# 🎯 ENDPOINTS PRINCIPALES

@app.post("/consultar")
@require_internal_access
@apply_rate_limit(limit=20, window=60)
async def consultar_hibrido_seguro(request: Request):
    """Endpoint securizado para consultas individuales"""
    try:
        body = await request.json()
        cedula = body.get('ruc') or body.get('cedula')
        
        if not cedula:
            raise HTTPException(status_code=400, detail="RUC o cédula requerida")
        
        # Usar la función compartida
        return await ejecutar_consulta_sri(
            cedula=cedula, 
            user_id=request.state.user_id, 
            is_public=False
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en endpoint seguro: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
async def consultar_fallback_interno(cedula: str, start_time: datetime):
    """Consulta usando fallbacks como respaldo"""
    try:
        if len(cedula) == 10:  # Cédula
            resultado_fallback = await fallback_manager.consultar_cedula_fallback(cedula)
        elif len(cedula) == 13:  # RUC
            resultado_fallback = await fallback_manager.consultar_ruc_publico(cedula)
        else:
            raise HTTPException(status_code=400, detail="Formato de identificación inválido")
        
        total_time = (datetime.now() - start_time).total_seconds()
        
        if resultado_fallback.get('success'):
            return {
                **resultado_fallback,
                "api_metadata": {
                    "version": "3.0_hybrid_secure",
                    "method": "fallback_backup",
                    "total_api_time": f"{total_time:.2f}s",
                    "timestamp": datetime.now().isoformat(),
                    "pool_status": "fallback_used"
                }
            }
        else:
            raise HTTPException(
                status_code=404,
                detail={
                    "message": "No se encontró información con ningún método",
                    "detalles": resultado_fallback,
                    "total_api_time": f"{total_time:.2f}s"
                }
            )
            
    except HTTPException:
        raise
    except Exception as e:
        total_time = (datetime.now() - start_time).total_seconds()
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Error en fallback",
                "error": str(e),
                "total_api_time": f"{total_time:.2f}s"
            }
        )

@app.post("/consultar_multiple")
@require_internal_access  
@apply_rate_limit(limit=5, window=60)
async def consultar_multiple_seguro(request: Request):
    """Endpoint securizado para consultas batch"""
    start_time = datetime.now()
    
    try:
        body = await request.json()
        cedulas = body.get('rucs') or body.get('cedulas')
        usar_fallback = body.get('usar_fallback', False)
        
        if not cedulas or not isinstance(cedulas, list):
            raise HTTPException(status_code=400, detail="Lista de RUCs/cédulas requerida")
        
        if len(cedulas) > 50:
            raise HTTPException(status_code=400, detail="Máximo 50 consultas por batch")
        
        # Validar cada cédula
        for cedula in cedulas:
            is_valid, error_msg = validate_ruc_format(str(cedula))
            if not is_valid:
                raise HTTPException(status_code=400, detail=f"RUC inválido: {cedula} - {error_msg}")
        
        logger.info(f"Batch autorizado: user_id={request.state.user_id}, cantidad={len(cedulas)}")
        
        # Tu lógica existente de batch aquí... (adaptada)
        if not usar_fallback and hybrid_pool:
            resultados = await hybrid_pool.consultar_concurrente(cedulas)
            metodo_usado = "hybrid_concurrent_secure"
        else:
            resultados = []
            for cedula in cedulas:
                try:
                    if len(str(cedula)) == 10:
                        resultado = await fallback_manager.consultar_cedula_fallback(str(cedula))
                    elif len(str(cedula)) == 13:
                        resultado = await fallback_manager.consultar_ruc_publico(str(cedula))
                    else:
                        resultado = {"error": "Formato inválido"}
                    resultados.append(resultado)
                except Exception as e:
                    resultados.append({"error": str(e), "cedula": cedula})
            metodo_usado = "fallback_sequential_secure"
        
        total_time = (datetime.now() - start_time).total_seconds()
        exitosos = sum(1 for r in resultados if r.get('success'))
        
        return {
            "success": True,
            "resumen": {
                "total_procesadas": len(cedulas),
                "exitosas": exitosos,
                "fallidas": len(cedulas) - exitosos,
                "tasa_exito": f"{(exitosos/len(cedulas))*100:.1f}%",
                "tiempo_total": f"{total_time:.2f}s",
                "promedio_por_consulta": f"{total_time/len(cedulas):.2f}s"
            },
            "resultados": resultados,
            "api_metadata": {
                "version": "3.0_hybrid_secure",
                "metodo_usado": metodo_usado,
                "timestamp": datetime.now().isoformat(),
                "user_id": request.state.user_id
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        total_time = (datetime.now() - start_time).total_seconds()
        logger.error(f"Error en batch seguro: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Error procesando batch",
                "error": str(e),
                "tiempo_transcurrido": f"{total_time:.2f}s"
            }
        )

# 🔍 ENDPOINTS DE MONITOREO

@app.get("/status")
async def get_system_status():
    """📊 Estado completo del sistema híbrido"""
    try:
        if hybrid_pool:
            pool_status = await hybrid_pool.get_pool_status()
        else:
            pool_status = {"error": "Pool híbrido no inicializado"}
        
        return {
            "sistema": "SRI Smart API v3.0 Híbrida",
            "pool_hibrido": pool_status,
            "fallbacks_disponibles": {
                "cedulas": "ecuadorlegalonline.com",
                "ruc": "API pública SRI"
            },
            "performance": {
                "hibrido_principal": "0.1-0.3s",
                "fallback": "2-3s",
                "concurrencia": "Múltiples sesiones simultáneas"
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo status: {e}")
        return {
            "status": "Error obteniendo información",
            "error": str(e)
        }

@app.get("/health")
async def health_check():
    """💓 Health check público"""
    try:
        if hybrid_pool:
            pool_status = await hybrid_pool.get_pool_status()
            sesiones_activas = pool_status.get('total_sessions', 0)
        else:
            sesiones_activas = 0
        
        return {
            "status": "healthy" if sesiones_activas > 0 else "degraded",
            "service": "SRI Smart API Híbrida",
            "version": "3.0",
            "sesiones_hibridas": sesiones_activas,
            "fallbacks": "operativos",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "status": "degraded",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.post("/validar_cedula") 
async def validar_cedula_endpoint(request: CedulaValidationRequest):
    """✅ Validación de cédula ecuatoriana - endpoint público"""
    try:
        resultado = validar_cedula_ecuatoriana_sync(request.cedula)
        return resultado
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error validando cédula: {str(e)}"
        )

# 🔧 ENDPOINTS DE ADMINISTRACIÓN

@app.post("/pool/refresh")
async def refresh_hybrid_pool(token: str = Depends(verify_token)):
    """🔄 Reinicializar pool híbrido"""
    try:
        global hybrid_pool
        
        if not hybrid_pool:
            logger.warning("⚠️ Pool estaba caído, creando nuevo pool...")
            hybrid_pool = SRIHybridPool(max_sessions=3)
            sesiones_activas = await hybrid_pool.initialize()
            return {
                "success": True,
                "message": f"Pool híbrido creado desde cero: {sesiones_activas}/3 sesiones",
                "timestamp": datetime.now().isoformat()
            }
        
        logger.info("🔄 Reiniciando pool híbrido...")
        
        # Cerrar pool actual
        await hybrid_pool.close_all()
        
        # Crear nuevo pool
        hybrid_pool = SRIHybridPool(max_sessions=3)
        sesiones_activas = await hybrid_pool.initialize()
        
        return {
            "success": True,
            "message": f"Pool híbrido reinicializado: {sesiones_activas}/3 sesiones",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error en refresh híbrido: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/debug/crash_hybrid")
async def crash_hybrid_for_testing(token: str = Depends(verify_token)):
    """🧪 ENDPOINT DE TESTING: Forzar crash del pool híbrido"""
    try:
        global hybrid_pool
        
        if hybrid_pool:
            logger.info("🧪 TESTING: Forzando crash del pool híbrido...")
            await hybrid_pool.close_all()
            hybrid_pool = None
            
            return {
                "success": True,
                "message": "Pool híbrido destruido para testing",
                "timestamp": datetime.now().isoformat(),
                "status": "crash_simulado"
            }
        else:
            return {
                "success": False,
                "message": "Pool híbrido ya estaba caído",
                "timestamp": datetime.now().isoformat(),
                "status": "ya_crashed"
            }
            
    except Exception as e:
        logger.error(f"Error en crash testing: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/pool/metrics")
async def get_pool_metrics(token: str = Depends(verify_token)):
    """📈 Métricas detalladas del pool híbrido"""
    try:
        if not hybrid_pool:
            return {"error": "Pool híbrido no disponible"}
        
        pool_status = await hybrid_pool.get_pool_status()
        
        return {
            "pool_metrics": pool_status,
            "capacidad_teorica": {
                "consultas_por_segundo": "3-10",
                "consultas_por_minuto": "300-600",
                "tiempo_respuesta": "0.1-0.3s"
            },
            "tecnologia": {
                "login": "Selenium WebDriver",
                "consultas": "aiohttp concurrente",
                "cookies": "Transferidas automáticamente"
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/status")
async def debug_status():
    return {
        "hybrid_pool_exists": hybrid_pool is not None,
        "fallback_manager_exists": fallback_manager is not None,
        "hybrid_sessions": len(hybrid_pool.sessions) if hybrid_pool else 0
    }

@app.post("/public")
@apply_rate_limit(limit=50, window=60)
async def consultar_publico(request: Request):
    try:
        body = await request.json()
        token = body.get('token')
        cedula = body.get('ruc') or body.get('cedula')
        
        # Obtener contexto del usuario desde Node.js
        user_context = request.headers.get('x-user-context')
        if user_context:
            import json
            user_data = json.loads(user_context)
            user_id = f"{user_data['user_email']}({user_data['token_name']})"
        else:
            user_id = "public_user"
        
        if not cedula:
            raise HTTPException(status_code=400, detail="RUC o cédula requerida")
        
        return await ejecutar_consulta_sri(
            cedula=cedula, 
            user_id=user_id,
            is_public=True
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en endpoint público: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def ejecutar_consulta_sri(cedula: str, user_id: str = "public", is_public: bool = False):
    """Función compartida para ejecutar consultas SRI"""
    start_time = datetime.now()
    
    try:
        # Validar formato
        is_valid, error_msg = validate_ruc_format(cedula)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)
        
        # Detectar patrones sospechosos
        is_suspicious, suspicious_msg = detect_suspicious_patterns(cedula)
        if is_suspicious:
            logger.warning(f"Patrón sospechoso detectado en {cedula}: {suspicious_msg}")
            raise HTTPException(status_code=400, detail="Entrada inválida detectada")
        
        # Log diferente según el tipo de acceso
        if is_public:
            logger.info(f"Consulta pública: ruc={cedula}")
        else:
            logger.info(f"Consulta autorizada: user_id={user_id}, ruc={cedula}")

        # Si no hay pool híbrido, ir directo a fallback
        if not hybrid_pool:
            logger.info(f"Pool híbrido no disponible para {cedula}, usando fallback directo...")
            return await consultar_fallback_interno(cedula, start_time)
        
        # Intentar con pool híbrido primero
        session = await hybrid_pool.get_available_session()
        
        if session:
            resultado = await session.consultar_contribuyente_rapido(cedula)
            
            if resultado.get('success'):
                total_time = (datetime.now() - start_time).total_seconds()
                
                return {
                    **resultado,
                    "api_metadata": {
                        "version": "3.0_hybrid_public" if is_public else "3.0_hybrid_secure",
                        "method": "selenium_aiohttp",
                        "total_api_time": f"{total_time:.2f}s",
                        "timestamp": datetime.now().isoformat(),
                        "pool_status": "hybrid_primary",
                        "access_type": "public" if is_public else "secure",
                        "user_id": user_id
                    }
                }
            else:
                # Si híbrido falla, usar fallback
                logger.info(f"Híbrido falló para {cedula}, usando fallback...")
                return await consultar_fallback_interno(cedula, start_time)
        else:
            # Si no hay sesiones disponibles, usar fallback
            logger.info(f"No hay sesiones híbridas disponibles para {cedula}, usando fallback...")
            return await consultar_fallback_interno(cedula, start_time)
            
    except HTTPException:
        raise
    except Exception as e:
        total_time = (datetime.now() - start_time).total_seconds()
        logger.error(f"Error en consulta {cedula}: {e}")
        
        # Intentar fallback como último recurso
        try:
            return await consultar_fallback_interno(cedula, start_time)
        except:
            raise HTTPException(
                status_code=500,
                detail={
                    "message": "Error en todos los métodos disponibles",
                    "error": str(e),
                    "total_api_time": f"{total_time:.2f}s"
                }
            )

# Punto de entrada
if __name__ == '__main__':
    import uvicorn
    
    logger.info("🚀 Iniciando SRI Smart API v3.0 Híbrida...")
    
    try:
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8000,
            reload=False,
            log_level="info"
        )
    except KeyboardInterrupt:
        logger.info("🛑 Interrupción manual detectada")
    except Exception as e:
        logger.error(f"❌ Error crítico: {e}")
    finally:
        logger.info("🔒 SRI Smart API Híbrida cerrada")