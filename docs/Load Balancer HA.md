# Paso 4-8: Load Balancer y Alta Disponibilidad

## Resumen

Se implementó un sistema de alta disponibilidad con NGINX como load balancer, detección automática de instancias no saludables, y failover transparente.

## Arquitectura

```
                    ┌─────────────┐
                    │   Cliente   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    NGINX    │
                    │  (port 80)  │
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────▼──────┐┌──────▼──────┐┌──────▼──────┐
     │   API-1     ││   API-2     ││  Frontend   │
     │ (port 3000) ││ (port 3000) ││ (port 8080) │
     └──────┬──────┘└──────┬──────┘└─────────────┘
            │              │
            └──────┬───────┘
                   │
            ┌──────▼──────┐
            │    Redis    │
            │ (port 6379) │
            └─────────────┘
```

## Componentes Implementados

### 1. NGINX Load Balancer (`nginx/nginx.conf`)

```nginx
upstream api_backend {
    server api-1:3000 max_fails=3 fail_timeout=30s;
    server api-2:3000 max_fails=3 fail_timeout=30s;
}

location /api {
    proxy_pass http://api_backend;
    proxy_next_upstream error timeout http_500 http_502 http_503 http_504;
    proxy_next_upstream_tries 2;
}
```

**Características:**
- Balanceo round-robin entre 2 instancias
- Failover automático en errores 5xx
- Reintento en la siguiente instancia disponible

### 2. Health Check con Umbral de Memoria (`api/server.js`)

```javascript
const MEMORY_LIMIT_MB = 512;
const MEMORY_THRESHOLD_PERCENT = 80;

app.get('/api/health', async (req, res) => {
  const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const isHealthy = rssMB < MEMORY_THRESHOLD_MB;

  if (isHealthy) {
    res.json({ status: 'OK', ... });
  } else {
    res.status(503).json({ status: 'UNHEALTHY', ... });
  }
});
```

**Comportamiento:**
- Memoria < 80%: Retorna 200 OK
- Memoria >= 80%: Retorna 503 UNHEALTHY
- NGINX detecta el 503 y redirige al nodo saludable

### 3. Stress Test para Demo

```javascript
// POST /api/stress - Asigna ~400MB (80% del límite)
app.post('/api/stress', (req, res) => {
  for (let i = 0; i < 8; i++) {
    memoryHog.push(Buffer.alloc(50 * 1024 * 1024, 'x'));
  }
});

// POST /api/stress/clear - Libera memoria
app.post('/api/stress/clear', (req, res) => {
  memoryHog = [];
});
```

## Pruebas de Alta Disponibilidad

### Escenario: Una instancia con alta memoria

1. **Activar stress en Instancia 1:**
   ```bash
   curl -X POST http://localhost/api/stress
   ```

2. **Verificar que NGINX redirige a Instancia 2:**
   ```bash
   for i in {1..5}; do
     curl -s http://localhost/api/health | jq -r '.instance + " - " + .status'
   done
   ```

   **Resultado esperado:**
   ```
   2 - OK
   2 - OK
   2 - OK
   2 - OK
   2 - OK
   ```

3. **Verificar que la aplicación sigue funcionando:**
   ```bash
   # Leer tareas
   curl -s http://localhost/api/todos | jq

   # Crear tarea
   curl -s -X POST http://localhost/api/todos \
     -H "Content-Type: application/json" \
     -d '{"texto": "Tarea durante failover"}' | jq
   ```

4. **Limpiar stress:**
   ```bash
   curl -X POST http://localhost/api/stress/clear
   ```

## Servicios Docker Compose

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| nginx | 80 | Load balancer y reverse proxy |
| api-1 | - | Instancia API 1 (512MB límite) |
| api-2 | - | Instancia API 2 (512MB límite) |
| frontend | - | Servidor web estático |
| redis | - | Base de datos en memoria |
| prometheus | 9090 | Recolección de métricas |
| grafana | 3001 | Visualización (admin/admin) |
| cadvisor | 8081 | Métricas de contenedores |
| redis-exporter | - | Exportador Redis para Prometheus |

## Problema Encontrado: Botón "Limpiar Memoria"

### Descripción del Problema

Durante las pruebas, se descubrió un comportamiento interesante con el botón "Limpiar Memoria":

1. El usuario estaba conectado a Instancia 2 (round-robin inicial)
2. "Activar Stress" fue enviado a Instancia 1 (siguiente en round-robin)
3. Instancia 1 quedó con memoria alta (94%) y empezó a retornar 503
4. NGINX detectó el 503 y redirigió todo el tráfico a Instancia 2
5. Al presionar "Limpiar Memoria", la request también fue a Instancia 2 (porque Instancia 1 está marcada como unhealthy)
6. Instancia 2 liberó 0 chunks (nunca tuvo stress)
7. Instancia 1 seguía con el stress activo

### Evidencia en Logs

```json
// Instancia 1 retornando 503 (unhealthy)
{"level":40,"instance":"1","rssMB":480,"memoryPercent":94,"msg":"Health check: memoria alta, marcando como unhealthy"}
{"level":30,"instance":"1","statusCode":503,"msg":"request completed"}

// NGINX redirige a Instancia 2
{"level":30,"instance":"2","statusCode":200,"msg":"request completed"}
```

### Análisis

Este comportamiento es **correcto desde el punto de vista del load balancer**:
- El nodo unhealthy está completamente aislado del tráfico
- Ninguna request llega al nodo enfermo, incluyendo requests de "reparación"
- El load balancer protege al sistema de enviar tráfico a un nodo que no puede manejarlo

### Solución Implementada

Se removió el botón "Limpiar Memoria" del frontend porque:
1. No puede alcanzar la instancia que realmente tiene el stress
2. Confunde al usuario al mostrar "0 chunks liberados"
3. En producción real, la recuperación sería via reinicio del contenedor

**Para recuperar la instancia afectada:**

```bash
# Opción 1: Reiniciar el contenedor
docker-compose restart api-1

# Opción 2: Llamar directamente al contenedor (bypass load balancer)
docker exec todo_api_1 wget -q -O- --post-data='' http://localhost:3000/api/stress/clear
```

### Lección Aprendida

Este es un ejemplo real de cómo un load balancer con failover automático puede tener efectos secundarios no obvios. En arquitecturas distribuidas:

- Los nodos unhealthy quedan completamente aislados
- Las operaciones de mantenimiento deben tener un canal de comunicación directo (management plane)
- El aislamiento es una característica, no un bug - protege al sistema

## Resultado

- **Alta Disponibilidad:** Si una instancia falla, el tráfico se redirige automáticamente
- **Detección Proactiva:** El health check detecta memoria alta ANTES de que el contenedor sea matado
- **Transparencia:** El usuario no percibe la falla, la aplicación sigue funcionando
- **Aislamiento Total:** El nodo enfermo no recibe ningún tráfico, ni siquiera requests de recuperación
- **Observabilidad:** Grafana muestra el estado de cada instancia en tiempo real
