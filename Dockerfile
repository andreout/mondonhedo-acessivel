FROM python:3.11-alpine

WORKDIR /app

# Desactivar buffering para visualización instantánea de logs en Dokploy
ENV PYTHONUNBUFFERED=1
ENV PORT=80
ENV ENABLE_EDIT_MODE=false

# Copiar ficheiros da aplicación
COPY server.py ./
COPY public/ ./public/

EXPOSE 80
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/healthz || exit 1

CMD ["python3", "server.py"]
