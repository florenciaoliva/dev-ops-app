# Fase 3: Metricas Custom de Prometheus

## Resumen

En esta fase agregamos metricas personalizadas de la aplicacion que complementan las metricas automaticas de OpenTelemetry.

---

## Metricas Implementadas

### 1. `todos_created_total` (Counter)

**Tipo:** Contador acumulativo

**Descripcion:** Cuenta el total de tareas creadas desde que inicio la aplicacion. Este valor solo aumenta, nunca disminuye.

**Uso:** Se incrementa cada vez que se crea una tarea via `POST /api/todos`.

```javascript
todosCounter.add(1);
```

**Ejemplo de salida:**
```
# HELP todos_created_total Total de tareas creadas
# TYPE todos_created_total counter
todos_created_total 2
```

---

### 2. `todos_current_total` (Gauge)

**Tipo:** Gauge observable

**Descripcion:** Muestra la cantidad actual de tareas en la base de datos. Este valor puede subir o bajar.

**Uso:** Se actualiza automaticamente al:
- Obtener tareas (`GET /api/todos`)
- Crear tarea (`POST /api/todos`)
- Eliminar tarea (`DELETE /api/todos/:id`)

```javascript
todosGauge.addCallback((result) => {
  result.observe(currentTodosCount, { instance: INSTANCE_ID });
});
```

**Ejemplo de salida:**
```
# HELP todos_current_total Cantidad actual de tareas
# TYPE todos_current_total gauge
todos_current_total{instance="1"} 2
```

---

### 3. `app_memory_rss_bytes` (Gauge)

**Tipo:** Gauge observable

**Descripcion:** Memoria RSS (Resident Set Size) usada por el proceso Node.js en bytes.

**Uso:** Se lee automaticamente en cada scrape de Prometheus usando `process.memoryUsage().rss`.

```javascript
memoryGauge.addCallback((result) => {
  result.observe(process.memoryUsage().rss, { instance: INSTANCE_ID });
});
```

**Ejemplo de salida:**
```
# HELP app_memory_rss_bytes Memoria RSS usada por la aplicacion
# TYPE app_memory_rss_bytes gauge
app_memory_rss_bytes{instance="1"} 85016576
```

**Valores tipicos:**
- Normal: ~80-100MB
- Bajo stress: ~1.1GB

---

### 4. `app_stress_chunks` (Gauge)

**Tipo:** Gauge observable

**Descripcion:** Cantidad de chunks de 50MB asignados por el stress test.

**Uso:** Permite monitorear cuando el stress test esta activo.

```javascript
stressChunksGauge.addCallback((result) => {
  result.observe(memoryHog.length, { instance: INSTANCE_ID });
});
```

**Ejemplo de salida:**
```
# HELP app_stress_chunks Chunks de memoria asignados por stress test
# TYPE app_stress_chunks gauge
app_stress_chunks{instance="1"} 20
```

**Valores:**
- 0: Sin stress
- 20: Stress activo (~1GB asignado)

---

## Tipos de Metricas en Prometheus

| Tipo | Descripcion | Cuando usar |
|------|-------------|-------------|
| **Counter** | Solo incrementa | Eventos acumulativos (requests, errores, tareas creadas) |
| **Gauge** | Sube y baja | Valores actuales (memoria, conexiones, items en cola) |
| **Histogram** | Distribucion de valores | Latencias, tamanos de respuesta |
| **Summary** | Similar a histogram | Percentiles calculados en cliente |

---

## Arquitectura de Metricas

```
┌─────────────────────────────────────────────────────────┐
│                    tracing.js                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │           OpenTelemetry Meter                    │   │
│  │  - todosCounter (counter)                        │   │
│  │  - todosGauge (observable gauge)                 │   │
│  │  - memoryGauge (observable gauge)                │   │
│  │  - stressChunksGauge (observable gauge)          │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │         Prometheus Exporter :9464                │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    server.js                            │
│                                                         │
│  POST /api/todos ──► todosCounter.add(1)               │
│                 ──► currentTodosCount++                 │
│                                                         │
│  GET /api/todos ──► currentTodosCount = todos.length   │
│                                                         │
│  DELETE /api/todos ──► currentTodosCount--             │
│                                                         │
│  Observable Callbacks (cada scrape):                    │
│  - todosGauge → currentTodosCount                      │
│  - memoryGauge → process.memoryUsage().rss             │
│  - stressChunksGauge → memoryHog.length                │
└─────────────────────────────────────────────────────────┘
```

---

## Diferencia entre Counter y Gauge

### Counter (todos_created_total)
- Solo aumenta
- Se resetea cuando la app reinicia
- Util para calcular tasas: `rate(todos_created_total[5m])`

### Gauge (todos_current_total)
- Sube y baja
- Refleja el estado actual
- Util para alertas: `todos_current_total > 100`

---

## Labels (Etiquetas)

Todas las metricas incluyen el label `instance` para identificar la instancia de API:

```
todos_current_total{instance="1"} 2
todos_current_total{instance="2"} 5
```

Esto sera util cuando tengamos multiples instancias con load balancing.

---

## Pruebas

```bash
# Ver metricas custom
curl -s http://localhost:9464/metrics | grep -E "todos_|app_"

# Crear tareas y verificar contador
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"texto":"Test"}'

# Verificar que todos_created_total incremento
curl -s http://localhost:9464/metrics | grep todos_created_total

# Activar stress test
curl -X POST http://localhost:3000/api/stress

# Verificar memoria y chunks
curl -s http://localhost:9464/metrics | grep app_
```

---

## Queries utiles para Grafana

```promql
# Tasa de creacion de tareas por minuto
rate(todos_created_total[1m]) * 60

# Cantidad actual de tareas
todos_current_total

# Memoria en MB
app_memory_rss_bytes / 1024 / 1024

# Alerta: stress test activo
app_stress_chunks > 0

# Alerta: memoria alta (>500MB)
app_memory_rss_bytes > 500000000
```
