FROM python:3.11-alpine

WORKDIR /app

# Desactivar buffering para visualización instantánea de logs en Dokploy
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV ENABLE_EDIT_MODE=false

# Copiar ficheiros da aplicación
COPY server.py ./
COPY public/ ./public/

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=3s --retries=3 \
  CMD python3 -c "import urllib.request, os; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/healthz', timeout=2)" || exit 1

CMD ["python3", "server.py"]
