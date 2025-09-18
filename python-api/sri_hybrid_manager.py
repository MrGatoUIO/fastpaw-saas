# sri_hybrid_manager.py - Selenium login + aiohttp consultas
import asyncio
import aiohttp
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import time
from datetime import datetime
import logging
from typing import Dict, Optional, List

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SRIHybridSession:
    """Sesión híbrida: Selenium para login, aiohttp para consultas"""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.driver = None
        self.aiohttp_session = None
        self.cookies = None
        self.view_state = None
        self.is_authenticated = False
        self.is_busy = False
        
        # URLs
        self.login_url = "https://facturadorsri.sri.gob.ec/portal-facturadorsri-internet/pages/inicio.html"
        self.factura_url = "https://facturadorsri.sri.gob.ec/portal-facturadorsri-internet/pages/comprobantes/factura/Factura.html"
        
        # Credenciales
        self.ruc = "1726386236001"
        self.password = "Bronzinelpro06@"
    
    def init_selenium_driver(self):
        """Inicializar driver de Selenium optimizado"""
        logger.info(f"🚀 {self.session_id}: Iniciando Chrome...")
        
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--disable-web-security")
        chrome_options.add_argument("--disable-features=VizDisplayCompositor")
        chrome_options.add_argument("--disable-extensions")
        chrome_options.add_argument("--disable-plugins")
        chrome_options.add_argument("--disable-images")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        
        self.driver = webdriver.Chrome(options=chrome_options)
        self.driver.set_script_timeout(30)
        self.driver.set_page_load_timeout(30)
        
        logger.info(f"✅ {self.session_id}: Chrome iniciado")
        return True
    
    def selenium_login(self) -> bool:
        """Login usando Selenium - maneja toda la complejidad"""
        try:
            if not self.driver:
                self.init_selenium_driver()
            
            logger.info(f"🔑 {self.session_id}: Iniciando login con Selenium...")
            
            # 1. Cargar página de login
            self.driver.get(self.login_url)
            time.sleep(2)  # Dejar que cargue completamente
            
            wait = WebDriverWait(self.driver, 15)
            
            # 2. Encontrar y llenar campos
            ruc_field = wait.until(EC.presence_of_element_located((By.NAME, "loginForm:nombreusuario")))
            pass_field = self.driver.find_element(By.NAME, "loginForm:passwordInput")
            
            # 3. Llenar campos con delays humanos
            ruc_field.clear()
            time.sleep(0.5)
            ruc_field.send_keys(self.ruc)
            time.sleep(0.5)
            
            pass_field.clear()
            time.sleep(0.5)
            pass_field.send_keys(self.password)
            time.sleep(1)
            
            # 4. Buscar botón de login dinámicamente
            login_buttons = self.driver.find_elements(By.CSS_SELECTOR, "button[type='submit']")
            if not login_buttons:
                login_buttons = self.driver.find_elements(By.CSS_SELECTOR, "input[type='submit']")
            
            if login_buttons:
                login_button = login_buttons[0]
                logger.info(f"🔘 {self.session_id}: Botón encontrado: {login_button.get_attribute('name')}")
                
                # 5. Click y esperar
                login_button.click()
                time.sleep(3)
                
                # 6. Verificar si el login fue exitoso
                current_url = self.driver.current_url
                logger.info(f"📍 {self.session_id}: URL después de login: {current_url}")
                
                # 7. Intentar navegar a página de facturación
                logger.info(f"🏠 {self.session_id}: Navegando a facturación...")
                self.driver.get(self.factura_url)
                time.sleep(3)
                
                # 8. Verificar que estamos en la página correcta
                try:
                    wait.until(EC.presence_of_element_located((By.ID, "form:busquedaCompradorComp:ruc")))
                    logger.info(f"✅ {self.session_id}: Campo de búsqueda encontrado - login exitoso")
                    
                    # 9. Extraer cookies y ViewState para aiohttp
                    self.extract_session_data()
                    
                    self.is_authenticated = True
                    return True
                    
                except Exception as e:
                    logger.error(f"❌ {self.session_id}: No se encontró campo de búsqueda: {e}")
                    return False
            else:
                logger.error(f"❌ {self.session_id}: No se encontró botón de login")
                return False
                
        except Exception as e:
            logger.error(f"❌ {self.session_id}: Error en login Selenium: {e}")
            return False
    
    def extract_session_data(self):
        """Extraer cookies y ViewState del driver para aiohttp"""
        try:
            # Extraer cookies
            selenium_cookies = self.driver.get_cookies()
            self.cookies = {}
            
            for cookie in selenium_cookies:
                self.cookies[cookie['name']] = cookie['value']
            
            logger.info(f"🍪 {self.session_id}: Cookies extraídas: {len(self.cookies)}")
            
            # Extraer ViewState
            try:
                viewstate_element = self.driver.find_element(By.NAME, "javax.faces.ViewState")
                self.view_state = viewstate_element.get_attribute("value")
                logger.info(f"🔑 {self.session_id}: ViewState extraído: {self.view_state[:30]}...")
            except:
                logger.warning(f"⚠️ {self.session_id}: No se pudo extraer ViewState")
            
        except Exception as e:
            logger.error(f"❌ {self.session_id}: Error extrayendo datos de sesión: {e}")
    
    async def create_aiohttp_session(self):
        """Crear sesión aiohttp con cookies de Selenium"""
        if not self.cookies:
            logger.error(f"❌ {self.session_id}: No hay cookies para aiohttp")
            return False
        
        try:
            # Headers realistas
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
            
            # Crear cookie jar con las cookies de Selenium
            cookie_jar = aiohttp.CookieJar()
            for name, value in self.cookies.items():
                cookie_jar.update_cookies({name: value})
            
            # Timeout rápido para consultas
            timeout = aiohttp.ClientTimeout(total=10, connect=3, sock_read=5)
            
            self.aiohttp_session = aiohttp.ClientSession(
                headers=headers,
                cookie_jar=cookie_jar,
                timeout=timeout
            )
            
            logger.info(f"⚡ {self.session_id}: Sesión aiohttp creada con cookies de Selenium")
            return True
            
        except Exception as e:
            logger.error(f"❌ {self.session_id}: Error creando sesión aiohttp: {e}")
            return False
    
    async def consultar_contribuyente_rapido(self, cedula: str) -> Dict:
        """Consulta ultrarrápida usando aiohttp con sesión autenticada"""
        if not self.is_authenticated or not self.aiohttp_session:
            return {"error": "Sesión no autenticada"}
        
        if self.is_busy:
            return {"error": "Sesión ocupada"}
        
        self.is_busy = True
        start_time = datetime.now()
        
        try:
            logger.info(f"⚡ {self.session_id}: Consulta rápida {cedula}")
            
            # Actualizar ViewState si es necesario
            if not self.view_state:
                await self.refresh_viewstate()
            
            # Datos del AJAX
            ajax_data = {
                'javax.faces.partial.ajax': 'true',
                'javax.faces.source': 'form:busquedaCompradorComp:ruc',
                'javax.faces.partial.execute': 'form:busquedaCompradorComp:ruc form:busquedaCompradorComp:cmbTipoIdentificacion',
                'javax.faces.partial.render': 'form:busquedaCompradorComp:panelComprador form:busquedaCompradorComp:compradorRazonSocial',
                'javax.faces.behavior.event': 'valueChange',
                'javax.faces.partial.event': 'change',
                'form': 'form',
                'form:busquedaCompradorComp:ruc': cedula,
                'javax.faces.ViewState': self.view_state
            }
            
            ajax_headers = {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'faces-request': 'partial/ajax',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': self.factura_url
            }
            
            # Petición AJAX ultrarrápida
            async with self.aiohttp_session.post(
                self.factura_url,
                data=ajax_data,
                headers=ajax_headers
            ) as response:
                
                if response.status != 200:
                    return {"error": f"Status HTTP: {response.status}"}
                
                xml_response = await response.text()
                
                # Extraer datos (reutilizar lógica existente)
                datos = self.extract_data_from_xml(xml_response, cedula)
                
                duration = (datetime.now() - start_time).total_seconds()
                
                if datos and datos.get('razonSocial') != 'No encontrado':
                    logger.info(f"✅ {self.session_id}: {cedula} encontrado en {duration:.2f}s")
                    return {
                        "success": True,
                        "data": {
                            **datos,
                            "response_time": f"{duration:.2f}s",
                            "session_id": self.session_id,
                            "method": "hybrid_aiohttp"
                        }
                    }
                else:
                    return {"error": "No se encontraron datos", "response_time": f"{duration:.2f}s"}
        
        except Exception as e:
            duration = (datetime.now() - start_time).total_seconds()
            logger.error(f"❌ {self.session_id}: Error consulta {cedula}: {e}")
            return {"error": f"Error: {str(e)}", "response_time": f"{duration:.2f}s"}
        
        finally:
            self.is_busy = False
    
    async def refresh_viewstate(self):
        """Refrescar ViewState usando aiohttp"""
        try:
            async with self.aiohttp_session.get(self.factura_url) as response:
                if response.status == 200:
                    html = await response.text()
                    
                    import re
                    view_state_match = re.search(r'name="javax\.faces\.ViewState" value="([^"]*)"', html)
                    if view_state_match:
                        self.view_state = view_state_match.group(1)
                        logger.info(f"🔄 {self.session_id}: ViewState actualizado")
                        return True
            
            return False
        except:
            return False
    
    def extract_data_from_xml(self, xml_response: str, cedula: str) -> Dict:
        """Extraer datos del XML response (reutilizar lógica existente)"""
        try:
            import re
            
            razon_social_match = re.search(r'id="form:busquedaCompradorComp:compradorRazonSocial"[^>]*value="([^"]*)"', xml_response)
            direccion_match = re.search(r'id="form:busquedaCompradorComp:compradorDireccion"[^>]*value="([^"]*)"', xml_response)
            telefono_match = re.search(r'id="form:busquedaCompradorComp:compradorTelefono"[^>]*value="([^"]*)"', xml_response)
            email_match = re.search(r'id="form:busquedaCompradorComp:compradorEmail"[^>]*value="([^"]*)"', xml_response)
            tipo_id_match = re.search(r'selected="selected">([^<]+)</option>', xml_response)
            
            if not razon_social_match or not razon_social_match.group(1).strip():
                return None
            
            return {
                'cedula': cedula,
                'razonSocial': razon_social_match.group(1).strip(),
                'direccion': direccion_match.group(1).strip() if direccion_match else 'No encontrado',
                'telefono': telefono_match.group(1).strip() if telefono_match else 'No encontrado',
                'email': email_match.group(1).strip() if email_match else 'No encontrado',
                'tipoIdentificacion': tipo_id_match.group(1).strip() if tipo_id_match else 'No encontrado'
            }
            
        except Exception as e:
            logger.error(f"Error extrayendo datos: {e}")
            return None
    
    async def close(self):
        """Cerrar sesión híbrida"""
        if self.aiohttp_session:
            await self.aiohttp_session.close()
        
        if self.driver:
            self.driver.quit()
        
        logger.info(f"🔒 {self.session_id}: Sesión cerrada")

class SRIHybridPool:
    """Pool de sesiones híbridas"""
    
    def __init__(self, max_sessions: int = 3):
        self.max_sessions = max_sessions
        self.sessions: List[SRIHybridSession] = []
        self.current_session = 0
        self.lock = asyncio.Lock()
    
    async def initialize(self) -> int:
        """Inicializar pool híbrido"""
        logger.info(f"🚀 Inicializando pool híbrido de {self.max_sessions} sesiones...")
        logger.info("📋 Proceso: Selenium login → aiohttp consultas")
        
        # Inicializar sesiones secuencialmente para evitar problemas
        for i in range(self.max_sessions):
            try:
                session = SRIHybridSession(f"HYBRID-{i+1}")
                
                # Login con Selenium
                if session.selenium_login():
                    # Crear sesión aiohttp
                    if await session.create_aiohttp_session():
                        self.sessions.append(session)
                        logger.info(f"✅ Sesión híbrida {i+1} lista")
                    else:
                        await session.close()
                        logger.error(f"❌ Falló aiohttp en sesión {i+1}")
                else:
                    await session.close()
                    logger.error(f"❌ Falló login Selenium en sesión {i+1}")
                
                # Delay entre inicializaciones
                if i < self.max_sessions - 1:
                    time.sleep(2)
                    
            except Exception as e:
                logger.error(f"❌ Error en sesión {i+1}: {e}")
        
        logger.info(f"📊 Pool híbrido: {len(self.sessions)}/{self.max_sessions} sesiones listas")
        return len(self.sessions)
    
    async def get_available_session(self) -> Optional[SRIHybridSession]:
        """Obtener sesión disponible"""
        async with self.lock:
            if not self.sessions:
                return None
            
            attempts = 0
            while attempts < len(self.sessions):
                session = self.sessions[self.current_session]
                self.current_session = (self.current_session + 1) % len(self.sessions)
                
                if not session.is_busy and session.is_authenticated:
                    return session
                
                attempts += 1
            
            return None
    
    async def consultar_concurrente(self, cedulas: List[str]) -> List[Dict]:
        """Consultas concurrentes ultrarrápidas"""
        async def consultar_una(cedula: str) -> Dict:
            session = await self.get_available_session()
            if not session:
                return {"error": "No hay sesiones disponibles", "cedula": cedula}
            
            return await session.consultar_contribuyente_rapido(cedula)
        
        # Ejecutar todas concurrentemente
        tasks = [consultar_una(cedula) for cedula in cedulas]
        return await asyncio.gather(*tasks)
    
    async def get_pool_status(self) -> Dict:
        """Estado del pool híbrido"""
        active_sessions = len(self.sessions)
        busy_sessions = sum(1 for s in self.sessions if s.is_busy)
        
        return {
            "type": "hybrid_pool",
            "total_sessions": active_sessions,
            "busy_sessions": busy_sessions,
            "available_sessions": active_sessions - busy_sessions,
            "authenticated_sessions": sum(1 for s in self.sessions if s.is_authenticated)
        }
    
    async def close_all(self):
        """Cerrar todas las sesiones"""
        tasks = [session.close() for session in self.sessions]
        await asyncio.gather(*tasks, return_exceptions=True)
        self.sessions.clear()
        logger.info("🔒 Pool híbrido cerrado")

# Test del sistema híbrido
async def test_hybrid_system():
    pool = SRIHybridPool(max_sessions=2)
    
    # Inicializar
    sesiones_activas = await pool.initialize()
    
    if sesiones_activas > 0:
        print(f"✅ Pool híbrido listo: {sesiones_activas} sesiones")
        
        # Test consulta individual
        session = await pool.get_available_session()
        if session:
            resultado = await session.consultar_contribuyente_rapido("1726386236")
            print("Resultado individual:", resultado)
        
        # Test batch concurrente
        cedulas = ["1726386236", "0987654321", "1234567890"]
        resultados = await pool.consultar_concurrente(cedulas)
        
        print(f"\nResultados batch ({len(cedulas)} cédulas):")
        for resultado in resultados:
            print(resultado)
    
    await pool.close_all()

if __name__ == "__main__":
    asyncio.run(test_hybrid_system())