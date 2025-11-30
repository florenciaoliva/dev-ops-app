# TP2 Implementation Plan: Orquestación y Observabilidad

> DevOps UTN FRRe 2025 - Minimal Implementation Guide

## Overview

This plan extends the existing TP1 ToDo application with:
1. **Observability**: Metrics, logs, and traces using OpenTelemetry + Prometheus + Grafana
2. **Orchestration**: Load balancing with NGINX (Option 2 - simpler than Kubernetes)

---

## Scoring Reference (Rúbrica)

| Component | Points | Description |
|-----------|--------|-------------|
| OpenTelemetry Data | 25 | Structured logs + metrics + traces |
| Grafana Dashboards | 25 | Container & app metrics visualization |
| Orchestration | 20 | Load balancing, multiple instances |
| High Availability | 20 | Auto-recovery when memory > 80% |
| Colloquium | 10 | Presentation |

---

## Architecture

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    OBSERVABILITY                         │
                    │  ┌──────────┐    ┌────────────┐    ┌─────────┐          │
                    │  │ Prometheus│◄───│  cAdvisor  │    │ Grafana │          │
                    │  │  :9090   │    │   :8081    │    │  :3001  │          │
                    │  └────┬─────┘    └────────────┘    └────┬────┘          │
                    │       │                                  │               │
                    │       └──────────────────────────────────┘               │
                    └─────────────────────────────────────────────────────────┘
                                          ▲
                                          │ scrape metrics
┌──────────┐      ┌─────────────┐    ┌────┴────────────────────────────────────┐
│ Browser  │─────►│   NGINX     │───►│              APPLICATION                │
│          │      │ Load Balancer│    │  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
└──────────┘      │    :80      │    │  │ API #1  │  │ API #2  │  │  Redis  │ │
                  └─────────────┘    │  │  :3000  │  │  :3001  │  │  :6379  │ │
                        │            │  └─────────┘  └─────────┘  └─────────┘ │
                        │            └────────────────────────────────────────┘
                        │
                  ┌─────▼─────┐
                  │ Frontend  │
                  │   :8080   │
                  └───────────┘
```

---

## Implementation Tasks

### PART 0: Application Modification (Functional Requirement)

**Add a "stress test" endpoint to generate memory load**

File: `api/server.js`

```javascript
// New endpoint: POST /api/stress
// Allocates memory until ~100% usage to simulate failure
let memoryHog = [];

app.post('/api/stress', (req, res) => {
  const allocateMB = 50; // Allocate 50MB chunks
  try {
    for (let i = 0; i < 20; i++) {
      memoryHog.push(Buffer.alloc(allocateMB * 1024 * 1024));
    }
    res.json({ status: 'Memory allocated', chunks: memoryHog.length });
  } catch (e) {
    res.status(500).json({ error: 'Memory allocation failed' });
  }
});

app.post('/api/stress/clear', (req, res) => {
  memoryHog = [];
  global.gc && global.gc();
  res.json({ status: 'Memory cleared' });
});
```

File: `frontend/public/index.html` - Add stress test button

---

### PART 1: Observability

#### 1.1 OpenTelemetry Integration (Logs + Traces)

**New dependencies for API** (`api/package.json`):
```json
{
  "@opentelemetry/api": "^1.7.0",
  "@opentelemetry/sdk-node": "^0.45.0",
  "@opentelemetry/auto-instrumentations-node": "^0.40.0",
  "@opentelemetry/exporter-prometheus": "^0.45.0",
  "pino": "^8.16.0"
}
```

**New file**: `api/tracing.js`
- Initialize OpenTelemetry SDK
- Configure auto-instrumentation for Express and Redis
- Export metrics to Prometheus format

**Modify**: `api/server.js`
- Add structured logging with Pino
- Add custom metrics:
  - `todos_total` - Total tasks count
  - `http_requests_total` - Request counter
  - `http_request_duration_seconds` - Response time histogram

#### 1.2 Container Metrics (cAdvisor)

**New service in docker-compose**: `cadvisor`
```yaml
cadvisor:
  image: gcr.io/cadvisor/cadvisor:latest
  container_name: cadvisor
  ports:
    - "8081:8080"
  volumes:
    - /:/rootfs:ro
    - /var/run:/var/run:ro
    - /sys:/sys:ro
    - /var/lib/docker/:/var/lib/docker:ro
```

Provides: CPU usage, memory usage, network I/O per container

#### 1.3 Prometheus Configuration

**New file**: `observability/prometheus.yml`
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'api'
    static_configs:
      - targets: ['api-1:3000', 'api-2:3000']

  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']
```

**New service in docker-compose**: `prometheus`
```yaml
prometheus:
  image: prom/prometheus:latest
  container_name: prometheus
  ports:
    - "9090:9090"
  volumes:
    - ./observability/prometheus.yml:/etc/prometheus/prometheus.yml
```

#### 1.4 Grafana Dashboards

**New file**: `observability/grafana/provisioning/dashboards/todo-dashboard.json`

Dashboard panels (minimum required):
1. **Container CPU Usage** - Graph showing CPU % per container
2. **Container Memory Usage** - Graph showing memory per container
3. **Total Tasks** - Single stat showing current todo count
4. **HTTP Requests/sec** - Graph showing request rate
5. **Response Time** - Graph showing p50/p95/p99 latencies

**New service in docker-compose**: `grafana`
```yaml
grafana:
  image: grafana/grafana:latest
  container_name: grafana
  ports:
    - "3001:3000"
  volumes:
    - ./observability/grafana:/etc/grafana/provisioning
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
```

---

### PART 2: Orchestration (Option 2 - NGINX Load Balancer)

#### 2.1 Multiple API Instances

Modify `docker-compose.yml` to run 2 API instances:
```yaml
api-1:
  build: ./api
  container_name: todo-api-1
  environment:
    - INSTANCE_ID=1
  deploy:
    resources:
      limits:
        memory: 256M  # Limit memory for HA demo

api-2:
  build: ./api
  container_name: todo-api-2
  environment:
    - INSTANCE_ID=2
  deploy:
    resources:
      limits:
        memory: 256M
```

#### 2.2 NGINX Load Balancer

**New file**: `nginx/nginx.conf`
```nginx
upstream api_backend {
    server api-1:3000;
    server api-2:3000;
}

server {
    listen 80;

    location /api {
        proxy_pass http://api_backend;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;

        # Health check - remove unhealthy servers
        proxy_next_upstream error timeout http_500 http_502 http_503;
    }

    location / {
        proxy_pass http://frontend:8080;
    }
}
```

**New service in docker-compose**: `nginx`
```yaml
nginx:
  image: nginx:alpine
  container_name: nginx-lb
  ports:
    - "80:80"
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
  depends_on:
    - api-1
    - api-2
    - frontend
```

#### 2.3 Health Check Configuration

Add health checks to API containers:
```yaml
api-1:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
    interval: 10s
    timeout: 5s
    retries: 3
    start_period: 10s
```

---

## New File Structure

```
dev-ops-app/
├── api/
│   ├── server.js          # Modified: add metrics + stress endpoint
│   ├── tracing.js          # NEW: OpenTelemetry setup
│   └── package.json        # Modified: add OTel dependencies
├── frontend/
│   └── public/
│       ├── index.html      # Modified: add stress test button
│       └── app.js          # Modified: add stress test function
├── nginx/
│   └── nginx.conf          # NEW: Load balancer config
├── observability/
│   ├── prometheus.yml      # NEW: Prometheus config
│   └── grafana/
│       └── provisioning/
│           ├── datasources/
│           │   └── datasource.yml    # NEW: Prometheus datasource
│           └── dashboards/
│               ├── dashboard.yml     # NEW: Dashboard provisioning
│               └── todo-dashboard.json  # NEW: Main dashboard
├── docker-compose.yml      # Modified: add all new services
└── docker-compose.prod.yml # Modified: production config
```

---

## Docker Compose Services Summary

| Service | Port | Purpose |
|---------|------|---------|
| nginx | 80 | Load balancer (entry point) |
| frontend | 8080 | Web UI |
| api-1 | 3000 | API instance 1 |
| api-2 | 3001 | API instance 2 |
| redis | 6379 | Data store |
| prometheus | 9090 | Metrics collection |
| grafana | 3001 | Visualization |
| cadvisor | 8081 | Container metrics |

---

## Demo Script for Colloquium

1. **Start the environment**
   ```bash
   docker-compose up --build
   ```

2. **Show the application working**
   - Open http://localhost (via NGINX)
   - Create/complete/delete some tasks

3. **Show Grafana dashboards**
   - Open http://localhost:3001
   - Show container metrics (CPU/Memory)
   - Show application metrics (requests, tasks)

4. **Demonstrate High Availability**
   - Click "Stress Test" button targeting api-1
   - Show in Grafana that api-1 memory spikes to 100%
   - Show that the application continues working (via api-2)
   - NGINX automatically routes to healthy instance

5. **Show logs and traces**
   - Show structured JSON logs from containers
   - Show traces in Prometheus/Grafana

---

## Implementation Order (Recommended)

1. [ ] Add stress test endpoint to API
2. [ ] Add OpenTelemetry + Pino logging to API
3. [ ] Add Prometheus metrics endpoint to API
4. [ ] Create nginx configuration
5. [ ] Create prometheus.yml configuration
6. [ ] Create Grafana provisioning files
7. [ ] Update docker-compose.yml with all services
8. [ ] Add stress test button to frontend
9. [ ] Test complete flow
10. [ ] Document and prepare demo

---

## Minimum Viable Implementation

For the **simplest possible implementation** that meets requirements:

### Must Have:
- [x] Stress test endpoint (memory allocation)
- [x] 2 API instances behind NGINX
- [x] Prometheus scraping container metrics from cAdvisor
- [x] Prometheus scraping basic metrics from API (at least request count)
- [x] Grafana with 1 dashboard showing CPU/Memory + request count
- [x] Health checks on API containers

### Nice to Have (for extra points):
- [ ] Full OpenTelemetry tracing
- [ ] Structured logging with correlation IDs
- [ ] Response time histograms
- [ ] Multiple Grafana panels with alerts

---

## Quick Start Commands

```bash
# Development
docker-compose up --build

# Access points
open http://localhost         # App (via NGINX)
open http://localhost:9090    # Prometheus
open http://localhost:3001    # Grafana (admin/admin)
open http://localhost:8081    # cAdvisor

# Trigger stress test
curl -X POST http://localhost/api/stress

# Clear stress test memory
curl -X POST http://localhost/api/stress/clear
```
