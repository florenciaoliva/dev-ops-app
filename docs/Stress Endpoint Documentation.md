# Fase 1: Endpoint de Stress Test

## Problema Encontrado

Al implementar el endpoint `/api/stress` para simular alta carga de memoria, detectamos que el reporte de memoria era incorrecto.

### Síntoma

Después de asignar 1000MB de memoria con `Buffer.alloc()`, el endpoint mostraba solo ~10MB de uso:

```json
{
  "status": "Memory stress activated",
  "allocatedMB": 1000,
  "heapUsedMB": 10
}
```

### Causa Raíz

El problema estaba en usar `process.memoryUsage().heapUsed` para medir la memoria.

En Node.js, `Buffer.alloc()` asigna memoria **fuera del heap de V8** (en memoria nativa del sistema operativo). El heap de V8 solo almacena una pequeña referencia al Buffer, no los datos reales.

```
┌─────────────────────────────────────────┐
│           Proceso Node.js               │
├─────────────────────────────────────────┤
│  V8 Heap (heapUsed)                     │
│  ├── Variables JS                       │
│  ├── Objetos                            │
│  └── Referencia a Buffer (puntero) ─────┼──┐
├─────────────────────────────────────────┤  │
│  Memoria Nativa                         │  │
│  └── Buffer.alloc() datos reales ◄──────┼──┘
└─────────────────────────────────────────┘
```

### Solución

Cambiamos de `heapUsed` a `rss` (Resident Set Size):

| Métrica | Qué mide |
|---------|----------|
| `heapUsed` | Solo memoria del heap V8 |
| `heapTotal` | Heap V8 total asignado |
| `external` | Memoria para objetos C++ (Buffers) |
| `rss` | **Memoria total del proceso** (heap + nativo + código + stack) |

### Código Corregido

```javascript
// Antes (incorrecto)
const usedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

// Después (correcto)
const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
```

### Resultado

Ahora el reporte de memoria es preciso:

```json
{
  "status": "Memory stress activated",
  "allocatedMB": 1000,
  "rssMB": 1062
}
```

## Endpoints Implementados

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/stress` | Asigna ~1GB de memoria en chunks de 50MB |
| POST | `/api/stress/clear` | Libera la memoria asignada |
| GET | `/api/health` | Incluye info de instancia y memoria (rssMB, stressChunks) |

## Variables de Entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `INSTANCE_ID` | `1` | Identificador de la instancia (para load balancing) |

## Pruebas

```bash
# Estado inicial (~60MB)
curl http://localhost:3000/api/health | jq

# Activar stress (~1060MB)
curl -X POST http://localhost:3000/api/stress | jq

# Verificar memoria alta
curl http://localhost:3000/api/health | jq

# Limpiar memoria
curl -X POST http://localhost:3000/api/stress/clear | jq
```

## Nota sobre Liberación de Memoria

Después de llamar a `/api/stress/clear`, el RSS puede permanecer alto temporalmente. Esto es comportamiento normal porque:

1. Node.js no devuelve memoria al SO inmediatamente
2. El garbage collector de V8 es "lazy"
3. El SO puede mantener páginas asignadas para reutilización

Para el demo de HA, esto no es problema porque usaremos **límites de memoria en Docker** que matarán el contenedor cuando exceda el límite.
