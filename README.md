# ♿ Mondoñedo Accesible - Guía Inclusiva e Roteiros (OSM)

Aplicación web aberta e lixeira para mapear e percorrer puntos de interese con criterios de **accesibilidade universal** na vila histórica de **Mondoñedo** (Galiza).

---

## 🔒 Modo de Edición e Seguridade

A aplicación inclúe un **modo de edición integrado** que permite:
- 📍 **Engadir novos puntos de interese** premendo directamente sobre o mapa.
- ✏️ **Editar descricións, pavimento, pendentes, zonas e accesibilidade** dos lugares existentes.
- 🗑️ **Eliminar puntos obsoletos**.
- 💾 **Gardar os cambios directamente no ficheiro GeoJSON** do servidor a través dunha API REST.

### Como activar ou desactivar o Modo Edición no Docker Compose:

No ficheiro `docker-compose.yml`, modifique a variable de contorno `ENABLE_EDIT_MODE`:

```yaml
    environment:
      # 🟢 Activar para editar / engadir novos puntos:
      - ENABLE_EDIT_MODE=true

      # 🔴 Desactivar en produción para máxima seguridade (só lectura):
      # - ENABLE_EDIT_MODE=false
```

Cando `ENABLE_EDIT_MODE=false`:
1. A interface de edición ocúltase automaticamente na web.
2. A API do servidor rexeita calquera petición de gardado con **HTTP 403 Forbidden**.
3. Os datos e mapas quedan protexidos contra calquera modificación non autorizada.

---

## 🚀 Como Executar con Docker Compose

1. Acceder ao directorio do proxecto:
   ```bash
   cd mondonhedo-acessivel
   ```

2. Levantar ou reiniciar o servizo:
   ```bash
   docker compose up -d
   ```

3. Abrir no navegador:
   ```text
   http://localhost:90
   ```

Para deter o servizo:
```bash
docker compose down
```

---

## 📂 Estrutura de Ficheiros

```text
mondonhedo-acessivel/
├── docker-compose.yml       # Orquestración Docker (Python Alpine lixeiro)
├── server.py                # Servidor HTTP con API de control de edición e seguridade
├── README.md
└── public/
    ├── index.html           # Interface da aplicación e modal de edición
    ├── style.css            # Estilos, deseño responsivo e alto contraste
    ├── app.js               # Lóxica Leaflet, filtros e motor de roteiros OSM
    └── data/
        ├── pois.geojson            # Puntos de interese e datos de accesibilidade
        └── itinerario_ruta.geojson # Traçado das etapas do itinerario oficial
```
