# sri_fallback_manager.py
import aiohttp
import asyncio
import requests
from bs4 import BeautifulSoup
from typing import Dict, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class SRIFallbackManager:
    """Maneja métodos de fallback con timeouts estrictos"""
    
    def __init__(self):
        self.timeout = aiohttp.ClientTimeout(total=3, connect=1, sock_read=2)
        
    async def consultar_cedula_fallback(self, cedula: str) -> Dict:
        """Fallback para cédulas usando ecuadorlegalonline - 3s timeout"""
        start_time = datetime.now()
        
        try:
            logger.info(f"🔄 Fallback: Consultando cédula {cedula}")
            
            async with asyncio.timeout(3):  # 3 segundos máximo
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': 'https://www.ecuadorlegalonline.com/consultas/registro-civil/consultar-cedulas/',
                }
                
                data = {
                    'name': cedula,
                    'tipo': 'I'
                }
                
                async with aiohttp.ClientSession(timeout=self.timeout) as session:
                    async with session.post(
                        'https://www.ecuadorlegalonline.com/modulo/consultar-cedula.php',
                        data=data,
                        headers=headers
                    ) as response:
                        
                        if response.status != 200:
                            return {"error": f"Fallback HTTP {response.status}"}
                        
                        html = await response.text()
                
                soup = BeautifulSoup(html, 'html.parser')
                name_element = soup.find('td', {'id': 'name0'})
                
                duration = (datetime.now() - start_time).total_seconds()
                
                if name_element and name_element.find('a'):
                    nombre = name_element.find('a').get_text(strip=True)
                    logger.info(f"✅ Fallback: {cedula} encontrado en {duration:.2f}s")
                    
                    return {
                        "success": True,
                        "data": {
                            "razonSocial": nombre,
                            "cedula": cedula,
                            "direccion": "No disponible en fallback",
                            "telefono": "No disponible en fallback", 
                            "email": "No disponible en fallback",
                            "tipoIdentificacion": "Cédula",
                            "metodo": "fallback_ecuadorlegal",
                            "response_time": f"{duration:.2f}s"
                        }
                    }
                else:
                    logger.info(f"🔍 Fallback: {cedula} no encontrado en {duration:.2f}s")
                    return {"error": "No encontrado en fallback", "response_time": f"{duration:.2f}s"}
        
        except asyncio.TimeoutError:
            duration = (datetime.now() - start_time).total_seconds()
            logger.warning(f"⏰ Fallback: TIMEOUT {cedula} después de {duration:.2f}s")
            return {"error": "Timeout fallback 3s", "response_time": f"{duration:.2f}s"}
            
        except Exception as e:
            duration = (datetime.now() - start_time).total_seconds()
            logger.error(f"❌ Fallback: Error {cedula}: {e}")
            return {"error": f"Error fallback: {str(e)}", "response_time": f"{duration:.2f}s"}
    
    async def consultar_ruc_publico(self, ruc: str) -> Dict:
        """Consulta RUC usando API pública SRI - 3s timeout"""
        start_time = datetime.now()
        
        try:
            logger.info(f"🔄 API Pública: Consultando RUC {ruc}")
            
            async with asyncio.timeout(3):  # 3 segundos máximo
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
                
                url = f"https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?&ruc={ruc}"
                
                async with aiohttp.ClientSession(timeout=self.timeout) as session:
                    async with session.get(url, headers=headers) as response:
                        
                        if response.status == 204:
                            return {"error": "RUC no existe en registros SRI"}
                        
                        if response.status != 200:
                            return {"error": f"API Pública HTTP {response.status}"}
                        
                        data = await response.json()
                
                duration = (datetime.now() - start_time).total_seconds()
                
                if not data or not isinstance(data, list) or not data[0].get('razonSocial'):
                    return {"error": "RUC no encontrado en API pública", "response_time": f"{duration:.2f}s"}
                
                info = data[0]
                
                # Verificar estado
                if info.get('estadoContribuyenteRuc', '').upper() == 'SUSPENDIDO':
                    return {"error": "RUC suspendido por SRI", "response_time": f"{duration:.2f}s"}
                
                if info.get('motivoCancelacionSuspension'):
                    return {"error": f"RUC cancelado: {info['motivoCancelacionSuspension']}", "response_time": f"{duration:.2f}s"}
                
                # Obtener dirección (con timeout adicional de 2s)
                direccion = await self._get_ruc_direccion(ruc, session)
                
                duration = (datetime.now() - start_time).total_seconds()
                logger.info(f"✅ API Pública: {ruc} encontrado en {duration:.2f}s")
                
                return {
                    "success": True,
                    "data": {
                        "razonSocial": info.get('razonSocial', ''),
                        "cedula": ruc,
                        "direccion": direccion,
                        "telefono": "No disponible en API pública",
                        "email": "No disponible en API pública", 
                        "tipoIdentificacion": "RUC",
                        "actividadEconomica": info.get('actividadEconomicaPrincipal', ''),
                        "tipoContribuyente": info.get('tipoContribuyente', ''),
                        "regimen": info.get('regimen', ''),
                        "llevaContabilidad": info.get('obligadoLlevarContabilidad', ''),
                        "agenteRetencion": info.get('agenteRetencion', ''),
                        "metodo": "api_publica_sri",
                        "response_time": f"{duration:.2f}s"
                    }
                }
        
        except asyncio.TimeoutError:
            duration = (datetime.now() - start_time).total_seconds()
            logger.warning(f"⏰ API Pública: TIMEOUT {ruc} después de {duration:.2f}s")
            return {"error": "Timeout API pública 3s", "response_time": f"{duration:.2f}s"}
            
        except Exception as e:
            duration = (datetime.now() - start_time).total_seconds()
            logger.error(f"❌ API Pública: Error {ruc}: {e}")
            return {"error": f"Error API pública: {str(e)}", "response_time": f"{duration:.2f}s"}
    
    async def _get_ruc_direccion(self, ruc: str, session: aiohttp.ClientSession) -> str:
        """Obtiene dirección del establecimiento principal"""
        try:
            async with asyncio.timeout(2):  # 2s máximo para dirección
                est_url = f"https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Establecimiento/consultarPorNumeroRuc?numeroRuc={ruc}"
                
                async with session.get(est_url) as response:
                    if response.status == 200:
                        establecimientos = await response.json()
                        if isinstance(establecimientos, list):
                            for e in establecimientos:
                                if e.get('estado', '').upper() == 'ABIERTO' and e.get('matriz', '').upper() == 'SI':
                                    return e.get('direccionCompleta', 'No encontrado')
                
                return "No encontrado"
                
        except:
            return "No encontrado"
    
    def validar_cedula_ecuatoriana(self, cedula: str) -> bool:
        """Valida cédula ecuatoriana usando algoritmo oficial"""
        if len(cedula) != 10 or not cedula.isdigit():
            return False

        provincia = int(cedula[:2])
        if provincia < 1 or provincia > 24:
            return False

        digitos = list(map(int, cedula))
        verificador = digitos.pop()

        suma = 0
        for i, d in enumerate(digitos):
            if i % 2 == 0:
                k = d * 2
                if k > 9:
                    k -= 9
                suma += k
            else:
                suma += d

        decena = ((suma + 9) // 10) * 10
        return (decena - suma) % 10 == verificador

class SmartSRIManager:
    """Manager inteligente que combina pool principal + fallbacks"""
    
    def __init__(self, session_pool, fallback_manager):
        self.session_pool = session_pool
        self.fallback_manager = fallback_manager
    
    async def consultar_inteligente(self, cedula: str) -> Dict:
        """Consulta inteligente con fallback automático ultrarrápido"""
        start_time = datetime.now()
        
        # Validación previa para cédulas
        if len(cedula) == 10 and not self.fallback_manager.validar_cedula_ecuatoriana(cedula):
            return {"error": "Cédula inválida según algoritmo ecuatoriano"}
        
        # 🚀 PASO 1: Intentar método principal (3s timeout)
        logger.info(f"🎯 Consultando {cedula} - Método principal primero")
        
        session = await self.session_pool.get_available_session()
        if session:
            resultado_principal = await session.consultar_contribuyente(cedula)
            
            if resultado_principal.get('success'):
                total_time = (datetime.now() - start_time).total_seconds()
                logger.info(f"✅ {cedula} resuelto con método principal en {total_time:.2f}s")
                return resultado_principal
            else:
                logger.info(f"⚡ {cedula} falló método principal, saltando a fallback...")
        else:
            logger.info(f"🔄 {cedula} - No hay sesiones disponibles, usando fallback directo")
        
        # 🔄 PASO 2: Fallback automático e inmediato
        if len(cedula) == 10:  # Cédula
            resultado_fallback = await self.fallback_manager.consultar_cedula_fallback(cedula)
        elif len(cedula) == 13:  # RUC
            resultado_fallback = await self.fallback_manager.consultar_ruc_publico(cedula)
        else:
            return {"error": "Formato de identificación inválido"}
        
        total_time = (datetime.now() - start_time).total_seconds()
        
        if resultado_fallback.get('success'):
            logger.info(f"✅ {cedula} resuelto con fallback en {total_time:.2f}s")
            # Agregar tiempo total a los datos
            if 'data' in resultado_fallback:
                resultado_fallback['data']['total_response_time'] = f"{total_time:.2f}s"
            return resultado_fallback
        else:
            logger.warning(f"❌ {cedula} falló en todos los métodos en {total_time:.2f}s")
            return {
                "error": "No se pudo obtener información con ningún método",
                "detalles": {
                    "metodo_principal": "falló o timeout",
                    "metodo_fallback": resultado_fallback.get('error', 'falló'),
                    "total_response_time": f"{total_time:.2f}s"
                }
            }
    
    async def consultar_batch_inteligente(self, cedulas: list) -> list:
        """Consulta múltiple con distribución inteligente"""
        logger.info(f"📦 Consultando batch de {len(cedulas)} cédulas")
        
        # Ejecutar todas concurrentemente
        tasks = [self.consultar_inteligente(cedula) for cedula in cedulas]
        resultados = await asyncio.gather(*tasks)
        
        # Estadísticas
        exitosos = sum(1 for r in resultados if r.get('success'))
        principal_count = sum(1 for r in resultados if r.get('data', {}).get('metodo') == 'sri_principal')
        fallback_count = sum(1 for r in resultados if 'fallback' in str(r.get('data', {}).get('metodo', '')))
        
        logger.info(f"📊 Batch completado: {exitosos}/{len(cedulas)} exitosos")
        logger.info(f"📊 Métodos usados: {principal_count} principal, {fallback_count} fallback")
        
        return resultados
    
    async def get_system_status(self) -> Dict:
        """Estado completo del sistema"""
        pool_status = await self.session_pool.get_pool_status()
        
        return {
            "sistema": "SRI Smart Manager v2.0",
            "pool_principal": pool_status,
            "fallbacks_disponibles": {
                "cedulas": "ecuadorlegalonline.com",
                "ruc": "API pública SRI"
            },
            "timeouts": {
                "metodo_principal": "3s",
                "fallback": "3s", 
                "total_maximo": "6s"
            },
            "timestamp": datetime.now().isoformat()
        }

# Función de validación standalone
def validar_cedula_ecuatoriana_sync(cedula: str) -> Dict:
    """Validación de cédula sincrónica para endpoints públicos"""
    fallback = SRIFallbackManager()
    es_valida = fallback.validar_cedula_ecuatoriana(cedula)
    
    return {
        "cedula": cedula,
        "valida": es_valida,
        "mensaje": "Cédula válida" if es_valida else "Cédula inválida según algoritmo ecuatoriano"
    }

# Test del sistema completo
async def test_smart_system():
    from sri_session_manager import SRISessionPool
    
    # Inicializar componentes
    pool = SRISessionPool(max_sessions=3)
    await pool.initialize()
    
    fallback = SRIFallbackManager()
    smart_manager = SmartSRIManager(pool, fallback)
    
    # Test consulta individual
    print("🧪 Test consulta individual...")
    resultado = await smart_manager.consultar_inteligente("1726386236")
    print("Resultado:", resultado)
    
    # Test batch
    print("\n🧪 Test batch concurrente...")
    cedulas_test = ["1726386236", "0987654321", "1234567890"]
    resultados = await smart_manager.consultar_batch_inteligente(cedulas_test)
    
    for i, resultado in enumerate(resultados):
        print(f"Resultado {i+1}:", resultado)
    
    # Status del sistema
    print("\n📊 Estado del sistema:")
    status = await smart_manager.get_system_status()
    print(status)
    
    await pool.close_all()

if __name__ == "__main__":
    asyncio.run(test_smart_system())