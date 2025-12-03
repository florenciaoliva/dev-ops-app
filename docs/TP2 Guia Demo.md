# TP2: Guía de Demostración

## Orquestación y Observabilidad - UTN FRRe 2025

---

## Inicio Rápido

```bash
# Levantar todos los servicios
docker-compose up -d --build

# Verificar que todos estén corriendo
docker-compose ps
```

## URLs de Acceso

| Servicio | URL | Credenciales |
|----------|-----|--------------|
| Aplicación | http://localhost | - |
| Grafana | http://localhost:3001 | admin / admin |
| Prometheus | http://localhost:9090 | - |
| cAdvisor | http://localhost:8081 | - |

---

## Demo Parte 1: Observabilidad

### 1.1 Logs Estructurados (Pino)

```bash
# Ver logs de API-1 en formato JSON
docker logs todo_api_1 --tail 10
```

**Resultado esperado:**
```json
{"level":30,"time":1732923456789,"instance":"1","service":"todo-api","method":"GET","path":"/api/todos","statusCode":200,"duration":5,"msg":"request completed"}
```

### 1.2 Métricas de Aplicación

```bash
# Métricas custom de la API
curl -s http://localhost:9464/metrics | grep -E "^(todos_|app_)"
```

**Métricas disponibles:**
- `todos_created_total` - Tareas creadas
- `todos_current_total` - Tareas actuales
- `app_memory_rss_bytes` - Memoria RSS
- `app_stress_chunks` - Chunks de stress asignados

### 1.3 Métricas de Contenedores (cAdvisor)

Acceder a http://localhost:8081 para ver:
- CPU por contenedor
- Memoria por contenedor
- Network I/O
- Filesystem

### 1.4 Visualización en Grafana

1. Acceder a http://localhost:3001
2. Login: admin / admin
3. Ir a Dashboards → ToDo App Dashboard
4. Ver paneles:
   - Tareas Creadas
   - Tareas Actuales
   - Memoria por Instancia
   - Chunks de Stress

---

## Demo Parte 2: Alta Disponibilidad

### 2.1 Estado Normal

```bash
# Verificar ambas instancias saludables
for i in {1..6}; do
  curl -s http://localhost/api/health | jq -r '"Instancia " + .instance + ": " + .status + " (" + (.memory.percent|tostring) + "% mem)"'
  sleep 0.5
done
```

**Resultado esperado (alternando):**
```
Instancia 1: OK (15% mem)
Instancia 2: OK (16% mem)
Instancia 1: OK (15% mem)
...
```

### 2.2 Activar Stress Test

**Opción A - Desde el frontend:**
1. Ir a http://localhost
2. Click en "Activar Stress Test"
3. Ver el estado de memoria aumentar

**Opción B - Desde terminal:**
```bash
curl -X POST http://localhost/api/stress | jq
```

### 2.3 Verificar Failover

```bash
# Ahora todas las requests van a Instancia 2
for i in {1..5}; do
  curl -s http://localhost/api/health | jq -r '"Instancia " + .instance + ": " + .status'
done
```

**Resultado esperado:**
```
Instancia 2: OK
Instancia 2: OK
Instancia 2: OK
Instancia 2: OK
Instancia 2: OK
```

### 2.4 Verificar que la App Sigue Funcionando

```bash
# La aplicación sigue operativa a través de la instancia saludable
curl -s http://localhost/api/todos | jq

# Crear nueva tarea durante el failover
curl -s -X POST http://localhost/api/todos \
  -H "Content-Type: application/json" \
  -d '{"texto": "Tarea creada durante failover"}' | jq
```

### 2.5 Recuperación

**Importante:** No se puede limpiar el stress via el frontend porque el load balancer redirige todas las requests a la instancia saludable (Instancia 2), y la request de "limpiar" nunca llega a Instancia 1.

```bash
# Reiniciar la instancia afectada
docker-compose restart api-1
```

Verificar en Grafana que la memoria baja y ambas instancias vuelven a recibir tráfico.

**Nota:** Este comportamiento demuestra el aislamiento total del nodo unhealthy - ver documentación en `docs/04-load-balancer-ha.md` para más detalles.

---

## Arquitectura Implementada

```
┌─────────────────────────────────────────────────────────────┐
│                         NGINX (80)                          │
│                      Load Balancer                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │   API-1   │   │   API-2   │   │ Frontend  │
    │  (512MB)  │   │  (512MB)  │   │  (8080)   │
    └─────┬─────┘   └─────┬─────┘   └───────────┘
          │               │
          └───────┬───────┘
                  │
            ┌─────▼─────┐
            │   Redis   │
            └───────────┘

┌─────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY STACK                       │
├─────────────┬─────────────┬─────────────┬───────────────────┤
│ Prometheus  │   Grafana   │  cAdvisor   │  Redis Exporter   │
│   (9090)    │   (3001)    │   (8081)    │                   │
└─────────────┴─────────────┴─────────────┴───────────────────┘
```

---

## Requisitos TP2 Cumplidos

### Parte 1 - Observabilidad

| Requisito | Implementación |
|-----------|----------------|
| Logs estructurados | Pino con formato JSON |
| Traces | OpenTelemetry SDK |
| Métricas de contenedores | cAdvisor |
| Métricas de aplicación | Custom metrics (todos, memoria) |
| Visualización | Grafana con dashboard provisionado |

### Parte 2 - Orquestación (Opción 2: NGINX)

| Requisito | Implementación |
|-----------|----------------|
| Load balancer | NGINX upstream |
| 2 instancias API | api-1, api-2 en Docker Compose |
| Detectar fallas (memoria > 80%) | Health check retorna 503 |
| Remover nodo no saludable | proxy_next_upstream en NGINX |

---

## Comandos Útiles

```bash
# Ver todos los contenedores
docker-compose ps

# Ver logs de un servicio
docker logs todo_api_1 -f

# Reiniciar un servicio
docker-compose restart api-1

# Detener todo
docker-compose down

# Detener y eliminar volúmenes
docker-compose down -v
```
