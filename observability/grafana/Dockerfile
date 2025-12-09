FROM grafana/grafana:latest

# Provisioning de datasources y dashboards
COPY provisioning /etc/grafana/provisioning

# Configuración básica de admin y signup
ENV GF_SECURITY_ADMIN_USER=admin
ENV GF_SECURITY_ADMIN_PASSWORD=admin
ENV GF_USERS_ALLOW_SIGN_UP=false

# Puerto por defecto de Grafana
EXPOSE 3000
