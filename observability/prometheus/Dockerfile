FROM prom/prometheus:latest

# Copia la configuración de Prometheus
COPY prometheus.yml /etc/prometheus/prometheus.yml

# Puerto de Prometheus
EXPOSE 9090

# Usa el entrypoint por defecto y solo define los argumentos necesarios
CMD ["--config.file=/etc/prometheus/prometheus.yml","--storage.tsdb.path=/prometheus","--web.enable-lifecycle"]
