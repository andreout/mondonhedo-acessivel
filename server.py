import http.server
import socketserver
import os
import json
import sys

PORT = int(os.environ.get("PORT", 8000))
ENABLE_EDIT_MODE = os.environ.get("ENABLE_EDIT_MODE", "false").lower() in ("true", "1", "yes")

PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
DATA_DIR = os.path.join(PUBLIC_DIR, "data")

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def do_GET(self):
        # Endpoint de configuración pública
        if self.path == "/api/config":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            config_data = {
                "edit_mode": ENABLE_EDIT_MODE,
                "version": "1.2.0"
            }
            self.wfile.write(json.dumps(config_data).encode("utf-8"))
            return
        
        return super().do_GET()

    def do_POST(self):
        if not ENABLE_EDIT_MODE:
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
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": f"JSON inválido: {str(e)}"}).encode("utf-8"))
            return

        if self.path == "/api/save-pois":
            target_file = os.path.join(DATA_DIR, "pois.geojson")
            try:
                # Validar que é GeoJSON correcto
                if payload.get("type") != "FeatureCollection" or "features" not in payload:
                    raise ValueError("Formato GeoJSON non válido. Debe ser FeatureCollection.")

                with open(target_file, "w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)

                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": "POIs gardados correctamente no ficheiro."}).encode("utf-8"))
            except Exception as e:
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

                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": "Roteiro gardado correctamente."}).encode("utf-8"))
            except Exception as e:
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

                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": "POIs de OSM actualizados e gardados correctamente."}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

if __name__ == "__main__":
    print(f"==================================================")
    print(f"🚀 Mondoñedo Accesible Server")
    print(f"📍 Porto: {PORT}")
    print(f"🔒 Modo de Edición: {'ACTIVADO ✏️' if ENABLE_EDIT_MODE else 'DESACTIVADO (Só Lectura) 🔒'}")
    print(f"==================================================")
    
    with socketserver.ThreadingTCPServer(("", PORT), CustomHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detido.")
            sys.exit(0)
