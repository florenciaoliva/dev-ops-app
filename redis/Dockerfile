# redis/Dockerfile
FROM redis:7-alpine

# Copia una configuración personalizada si deseas habilitar contraseña u otras opciones
# COPY redis.conf /usr/local/etc/redis/redis.conf

# Exponer el puerto por defecto
EXPOSE 6379

# Comando de arranque (sin config file utiliza valores por defecto)
CMD ["redis-server", "--appendonly", "yes"]
