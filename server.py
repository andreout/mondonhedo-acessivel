import http.server
import socketserver
import os
import json
import sys
import time
import traceback
from datetime import datetime

# Garantir que o stdout/stderr do Python non use buffer para ver logs inmediatamente no Dokploy/Docker
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

PORT = int(os.environ.get("PORT", 80))
ENABLE_EDIT_MODE = os.environ.get("ENABLE_EDIT_MODE", "false").lower() in ("true", "1", "yes")

PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
DATA_DIR = os.path.join(PUBLIC_DIR, "data")
START_TIME = time.time()

def log(level, message):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now}] [{level.upper()}] {message}", flush=True)

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def log_message(self, format, *args):
        # Sobrescribir o log estándar para que apareza formatado con timestamp e headers de proxy
        client_ip = self.headers.get("X-Forwarded-For", self.client_address[0])
        host = self.headers.get("Host", "unknown-host")
        log("HTTP", f"{client_ip} ({host}) - {format % args}")

    def log_error(self, format, *args):
        client_ip = self.headers.get("X-Forwarded-For", self.client_address[0])
        log("ERROR", f"{client_ip} - {format % args}")

    def do_GET(self):
        # 1. Healthcheck para Dokploy / Traefik / Coolify / Uptime monitors
        if self.path in ("/healthz", "/api/health", "/ping"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            uptime_sec = round(time.time() - START_TIME, 2)
            res = {
                "status": "healthy",
                "service": "mondonhedo-acessivel",
                "uptime_seconds": uptime_sec,
                "edit_mode": ENABLE_EDIT_MODE,
                "port": PORT,
                "timestamp": datetime.now().isoformat()
            }
            self.wfile.write(json.dumps(res, indent=2).encode("utf-8"))
            log("INFO", f"Healthcheck OK dende {self.headers.get('X-Forwarded-For', self.client_address[0])}")
            return

        # 2. Endpoint de configuración pública
        if self.path == "/api/config":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            config_data = {
                "edit_mode": ENABLE_EDIT_MODE,
                "version": "1.3.0",
                "server_time": datetime.now().isoformat()
            }
            self.wfile.write(json.dumps(config_data).encode("utf-8"))
            log("INFO", f"Configuración servida (edit_mode={ENABLE_EDIT_MODE}) a {self.headers.get('X-Forwarded-For', self.client_address[0])}")
            return
        
        return super().do_GET()

    def do_POST(self):
        client_ip = self.headers.get("X-Forwarded-For", self.client_address[0])
        log("POST", f"Recibida petición POST en {self.path} dende {client_ip}")

        if not ENABLE_EDIT_MODE:
            log("WARN", f"Intento de gardar bloqueado (Modo Edición desactivado) en {self.path}")
            self.send_response(403)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            response = {
                "success": False,
                "error": "O modo de edición está desactivado por seguridade no servidor."
            }
            self.wfile.write(json.dumps(response).encode("utf-8"))
            return

        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)

        try:
            payload = json.loads(post_data.decode("utf-8"))
        except Exception as e:
            log("ERROR", f"Erro decodificando JSON en {self.path}: {str(e)}")
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": f"JSON inválido: {str(e)}"}).encode("utf-8"))
            return

        if self.path == "/api/save-pois":
            target_file = os.path.join(DATA_DIR, "pois.geojson")
            try:
                if payload.get("type") != "FeatureCollection" or "features" not in payload:
                    raise ValueError("Formato GeoJSON non válido. Debe ser FeatureCollection.")

                with open(target_file, "w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)

                count = len(payload.get("features", []))
                log("SUCCESS", f"Gardados {count} POIs oficiais en {target_file}")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": f"POIs gardados correctamente ({count} elementos)."}).encode("utf-8"))
            except Exception as e:
                log("ERROR", f"Fallo ao gardar POIs: {str(e)}\n{traceback.format_exc()}")
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        if self.path == "/api/save-routes":
            target_file = os.path.join(DATA_DIR, "itinerario_ruta.geojson")
            try:
                with open(target_file, "w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)

                count = len(payload.get("features", []))
                log("SUCCESS", f"Gardados {count} treitos de roteiro en {target_file}")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": f"Roteiro gardado correctamente ({count} treitos)."}).encode("utf-8"))
            except Exception as e:
                log("ERROR", f"Fallo ao gardar Roteiro: {str(e)}\n{traceback.format_exc()}")
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        if self.path == "/api/save-osm-pois":
            target_file = os.path.join(DATA_DIR, "osm_pois.geojson")
            try:
                if payload.get("type") != "FeatureCollection" or "features" not in payload:
                    raise ValueError("Formato GeoJSON non válido para POIs de OSM.")

                with open(target_file, "w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)

                count = len(payload.get("features", []))
                log("SUCCESS", f"Gardados {count} postos de OSM en {target_file}")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": f"POIs de OSM actualizados ({count} postos)."}).encode("utf-8"))
            except Exception as e:
                log("ERROR", f"Fallo ao gardar POIs de OSM: {str(e)}\n{traceback.format_exc()}")
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        log("WARN", f"Ruta POST non atopada: {self.path}")
        self.send_response(404)
        self.end_headers()

if __name__ == "__main__":
    log("INIT", "==================================================")
    log("INIT", "🚀 Mondoñedo Accesible - Servidor Web & API")
    log("INIT", f"📍 Escoitando en: 0.0.0.0:{PORT}")
    log("INIT", f"📁 Directorio Público: {PUBLIC_DIR}")
    log("INIT", f"🔒 Modo de Edición: {'ACTIVADO ✏️' if ENABLE_EDIT_MODE else 'DESACTIVADO (Só Lectura) 🔒'}")
    log("INIT", "==================================================")
    
    # Permitir reuso rápido do socket se o servidor reinicia
    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), CustomHandler) as httpd:
            log("READY", f"Servidor preparado e agardando peticións en 0.0.0.0:{PORT}")
            httpd.serve_forever()
    except KeyboardInterrupt:
        log("SHUTDOWN", "Servidor detido polo usuario.")
        sys.exit(0)
    except Exception as e:
        log("FATAL", f"Erro crítico no servidor: {str(e)}\n{traceback.format_exc()}")
        sys.exit(1)

