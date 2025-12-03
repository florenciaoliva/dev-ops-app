# Fase 2: OpenTelemetry y Logging Estructurado

## Resumen

En esta fase agregamos observabilidad a la API mediante:
1. **Pino**: Logger estructurado en formato JSON
2. **OpenTelemetry**: Instrumentación automática y exportación de métricas

---

## Problema a Resolver

Los logs con `console.log` tienen limitaciones:
- No tienen estructura (texto plano)
- No incluyen metadatos automáticos
- No tienen trace IDs para correlacionar requests
- Difícil de parsear y analizar

---

## Solución Implementada

### 1. Pino Logger

Reemplazamos todos los `console.log` y `console.error` por un logger estructurado.

**Configuración:**
```javascript
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { instance: INSTANCE_ID, service: 'todo-api' },
});
```

**Salida JSON estructurada:**
```json
{
  "level": 30,
  "time": 1764540342777,
  "instance": "1",
  "service": "todo-api",
  "trace_id": "16619b73fbd94859d0707c7be0054197",
  "span_id": "6ee036a1c12c3e6d",
  "taskId": "1764540342777",
  "texto": "Test tarea",
  "msg": "Tarea creada"
}
```

**Beneficios:**
- Cada log incluye `instance` y `service` automáticamente
- OpenTelemetry inyecta `trace_id` y `span_id` para correlación
- Formato JSON fácil de parsear por herramientas como Loki, ELK, etc.

### 2. Middleware de Request Logging

Agregamos un middleware que loguea cada request completado:

```javascript
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: Date.now() - start,
    }, 'request completed');
  });
  next();
});
```

**Ejemplo de salida:**
```json
{
  "method": "GET",
  "path": "/api/health",
  "statusCode": 200,
  "duration": 8,
  "msg": "request completed"
}
```

### 3. OpenTelemetry SDK

**Archivo `tracing.js`:**
```javascript
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

const prometheusExporter = new PrometheusExporter({
  port: 9464,
  endpoint: '/metrics',
});

const sdk = new NodeSDK({
  serviceName: `todo-api-${INSTANCE_ID}`,
  metricReader: prometheusExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();
```

**Características:**
- **Auto-instrumentación**: Instrumenta Express, HTTP, Redis automáticamente
- **Prometheus Exporter**: Expone métricas en formato Prometheus en `:9464/metrics`
- **Trace Context**: Inyecta trace_id y span_id en los logs de Pino

---

## Métricas Disponibles

El endpoint `/metrics` en puerto 9464 expone:

| Métrica | Tipo | Descripción |
|---------|------|-------------|
| `target_info` | gauge | Metadata del servicio (nombre, versión SDK, PID) |
| `http_client_duration` | histogram | Duración de requests HTTP salientes |
| `http_server_duration` | histogram | Duración de requests HTTP entrantes |
| `db_client_connections` | gauge | Conexiones a base de datos (Redis) |

**Ejemplo de salida:**
```
# HELP target_info Target metadata
# TYPE target_info gauge
target_info{service_name="todo-api-1",...} 1

# HELP http_client_duration Measures the duration of outbound HTTP requests.
# TYPE http_client_duration histogram
http_client_duration_bucket{http_method="POST",le="10"} 1
```

---

## Dependencias Agregadas

```json
{
  "pino": "^8.16.0",
  "@opentelemetry/api": "^1.7.0",
  "@opentelemetry/sdk-node": "^0.45.0",
  "@opentelemetry/auto-instrumentations-node": "^0.40.0",
  "@opentelemetry/exporter-prometheus": "^0.45.0"
}
```

---

## Cambios en package.json

El script de inicio ahora precarga el tracing:

```json
{
  "scripts": {
    "start": "node -r ./tracing.js server.js",
    "dev": "nodemon -r ./tracing.js server.js"
  }
}
```

El flag `-r ./tracing.js` carga el módulo de tracing **antes** que la aplicación, permitiendo que OpenTelemetry instrumente todos los módulos correctamente.

---

## Cambios en docker-compose.yml

Agregamos el puerto 9464 para exponer las métricas:

```yaml
api:
  ports:
    - "3000:3000"
    - "9464:9464"
```

---

## Niveles de Log

Pino usa niveles numéricos:

| Nivel | Número | Uso |
|-------|--------|-----|
| trace | 10 | Debug muy detallado |
| debug | 20 | Debug |
| info | 30 | Información general |
| warn | 40 | Advertencias |
| error | 50 | Errores |
| fatal | 60 | Errores críticos |

Configurable via `LOG_LEVEL` environment variable.

---

## Pruebas

```bash
# Ver logs estructurados
docker-compose up

# Verificar métricas
curl http://localhost:9464/metrics

# Hacer requests y ver trace IDs en logs
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"texto":"Test"}'
```

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                      API Container                       │
│                                                         │
│  ┌─────────────┐     ┌──────────────────────────────┐  │
│  │ tracing.js  │────►│     OpenTelemetry SDK        │  │
│  │ (precarga)  │     │  - Auto-instrumentation      │  │
│  └─────────────┘     │  - Prometheus Exporter :9464 │  │
│                      └──────────────────────────────┘  │
│         │                         │                     │
│         ▼                         ▼                     │
│  ┌─────────────┐     ┌──────────────────────────────┐  │
│  │ server.js   │     │         Pino Logger          │  │
│  │  (Express)  │────►│  - JSON estructurado         │  │
│  │   :3000     │     │  - trace_id/span_id inject   │  │
│  └─────────────┘     └──────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
         │                         │
         ▼                         ▼
    API Requests              stdout (JSON logs)
    :3000                     + Metrics :9464
```
