# TP2 Implementation Plan: Orquestación y Observabilidad

> DevOps UTN FRRe 2025 - Implementation Guide

## Overview

This plan extends the existing TP1 ToDo application with:
1. **Observability**: Metrics, logs, and traces using OpenTelemetry + Prometheus + Grafana
2. **Orchestration**: Load balancing with NGINX + multiple API instances

---

## Current Project State (TP1)

### What Already Exists

| Component | Status | Details |
|-----------|--------|---------|
| API | ✅ Complete | Express server with CRUD endpoints (`api/server.js`) |
| Frontend | ✅ Complete | Static SPA (`frontend/public/`) |
| Redis | ✅ Upstash | Cloud Redis - **will keep using Upstash** |
| Docker Compose | ✅ Exists | Dev + Prod configurations |
| CI/CD | ✅ Complete | GitHub Actions → Docker Hub → Render |
| Health Endpoint | ✅ Exists | `GET /api/health` |

### Current File Structure
```
dev-ops-app-tp1/
├── api/
│   ├── server.js           # Express API (uses @upstash/redis)
│   ├── package.json        # Dependencies: express, @upstash/redis, cors
│   ├── Dockerfile
│   └── .env                # REDIS_URL, REDIS_TOKEN (Upstash)
├── frontend/
│   ├── server.js           # Static file server
│   ├── package.json
│   ├── Dockerfile
│   └── public/
│       ├── index.html      # Todo UI
│       └── app.js          # Client JS (⚠️ hardcoded API URL)
├── redis/
│   └── Dockerfile          # Not used (using Upstash)
├── docker-compose.yml      # Dev config
├── docker-compose.prod.yml # Prod config
└── .github/workflows/ci-cd.yml
```

### Known Issues to Fix
1. **`frontend/public/app.js`**: Hardcoded API URL to Render.com - needs to use relative `/api` for NGINX
2. **docker-compose.yml**: Single API instance - needs 2 instances for load balancing

---

## Scoring Reference (Rúbrica)

| Component | Points | Description | Our Approach |
|-----------|--------|-------------|--------------|
| OpenTelemetry Data | 25 | Structured logs + metrics + traces | Full implementation |
| Grafana Dashboards | 25 | Container & app metrics visualization | API containers + app metrics |
| Orchestration | 20 | Load balancing, multiple instances | NGINX + 2 API instances |
| High Availability | 20 | Auto-recovery when memory > 80% | NGINX failover to healthy instance |
| Colloquium | 10 | Presentation | Demo script included |

---

## Architecture

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    OBSERVABILITY                         │
                    │  ┌──────────┐    ┌────────────┐    ┌─────────┐          │
                    │  │Prometheus│◄───│  cAdvisor  │    │ Grafana │          │
                    │  │  :9090   │    │   :8081    │    │  :3002  │          │
                    │  └────┬─────┘    └────────────┘    └────┬────┘          │
                    │       │                                  │               │
                    │       └──────────────────────────────────┘               │
                    └─────────────────────────────────────────────────────────┘
                                          ▲
                                          │ scrape metrics
┌──────────┐      ┌─────────────┐    ┌────┴────────────────────────────────────┐
│ Browser  │─────►│   NGINX     │───►│              APPLICATION                │
│          │      │ Load Balancer│    │  ┌─────────┐  ┌─────────┐              │
└──────────┘      │    :80      │    │  │ API #1  │  │ API #2  │   ┌────────┐ │
                  └─────────────┘    │  │  :3000  │  │  :3000  │   │Upstash │ │
                        │            │  └─────────┘  └─────────┘   │ Redis  │ │
                        │            │         │           │       │(cloud) │ │
                        │            │         └─────┬─────┘       └────────┘ │
                  ┌─────▼─────┐      │               │                  ▲     │
                  │ Frontend  │      │               └──────────────────┘     │
                  │   :8080   │      └────────────────────────────────────────┘
                  └───────────┘

Note: Redis is Upstash (cloud) - no local Redis container metrics in cAdvisor
```

---

## Implementation Tasks

### PART 0: Fix Existing Code

#### 0.1 Update Frontend API URL

**File**: `frontend/public/app.js`

Change from hardcoded URL to relative path for NGINX routing:
```javascript
// BEFORE (line 1)
const API_URL = "https://todo-api-latest-gpya.onrender.com/api";

// AFTER
const API_URL = "/api";
```

#### 0.2 Add Stress Test Endpoint

**File**: `api/server.js`

Add memory stress endpoint for HA demonstration:
```javascript
// Memory stress test for HA demo
let memoryHog = [];

app.post('/api/stress', (req, res) => {
  const instanceId = process.env.INSTANCE_ID || 'unknown';
  const allocateMB = 50;
  try {
    for (let i = 0; i < 20; i++) {
      memoryHog.push(Buffer.alloc(allocateMB * 1024 * 1024));
    }
    res.json({
      status: 'Memory allocated',
      instance: instanceId,
      chunks: memoryHog.length,
      totalMB: memoryHog.length * allocateMB
    });
  } catch (e) {
    res.status(500).json({ error: 'Memory allocation failed', instance: instanceId });
  }
});

app.post('/api/stress/clear', (req, res) => {
  const instanceId = process.env.INSTANCE_ID || 'unknown';
  memoryHog = [];
  if (global.gc) global.gc();
  res.json({ status: 'Memory cleared', instance: instanceId });
});

// Add instance ID to health endpoint
app.get('/api/health', async (req, res) => {
  const instanceId = process.env.INSTANCE_ID || 'unknown';
  // ... existing health check logic ...
  res.json({ status: 'ok', instance: instanceId, /* ... */ });
});
```

#### 0.3 Add Stress Test Button to Frontend

**File**: `frontend/public/index.html`

Add stress test controls to the UI.

---

### PART 1: Observability

#### 1.1 OpenTelemetry Integration (Metrics + Logs + Traces)

**New dependencies** - Add to `api/package.json`:
```json
{
  "@opentelemetry/api": "^1.7.0",
  "@opentelemetry/sdk-node": "^0.45.0",
  "@opentelemetry/auto-instrumentations-node": "^0.40.0",
  "@opentelemetry/exporter-prometheus": "^0.45.0",
  "@opentelemetry/sdk-trace-node": "^1.18.0",
  "@opentelemetry/exporter-trace-otlp-http": "^0.45.0",
  "pino": "^8.16.0",
  "pino-pretty": "^10.2.0"
}
```

**New file**: `api/tracing.js`
- Initialize OpenTelemetry SDK before app starts
- Configure auto-instrumentation for Express
- Export metrics in Prometheus format on `/metrics` endpoint
- Setup trace exporter

**Modify**: `api/server.js`
- Import tracing at the top: `require('./tracing')`
- Replace console.log with Pino structured logging
- Add custom metrics:
  - `todos_total` - Gauge for total task count
  - `http_requests_total` - Counter for requests by method/path/status
  - `http_request_duration_seconds` - Histogram for response times

#### 1.2 Container Metrics (cAdvisor)

**New service in docker-compose**:
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
  networks:
    - todo-network
```

**Provides**: CPU usage, memory usage, network I/O for API and Frontend containers.

> **Note**: Redis metrics NOT available (using Upstash cloud, not local container)

#### 1.3 Prometheus Configuration

**New file**: `observability/prometheus.yml`
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'api'
    static_configs:
      - targets: ['api-1:3000', 'api-2:3000']
    metrics_path: '/metrics'

  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']
```

**New service in docker-compose**:
```yaml
prometheus:
  image: prom/prometheus:latest
  container_name: prometheus
  ports:
    - "9090:9090"
  volumes:
    - ./observability/prometheus.yml:/etc/prometheus/prometheus.yml
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
  networks:
    - todo-network
```

#### 1.4 Grafana Dashboards

**New files**:
- `observability/grafana/provisioning/datasources/datasource.yml`
- `observability/grafana/provisioning/dashboards/dashboard.yml`
- `observability/grafana/provisioning/dashboards/todo-dashboard.json`

**Dashboard panels required**:
1. **Container CPU Usage** - Graph showing CPU % for api-1, api-2, frontend
2. **Container Memory Usage** - Graph showing memory for api-1, api-2, frontend
3. **Total Tasks** - Single stat from `todos_total` metric
4. **HTTP Requests/sec** - Graph from `http_requests_total` rate
5. **Response Time (p50/p95/p99)** - Graph from `http_request_duration_seconds` histogram

**New service in docker-compose**:
```yaml
grafana:
  image: grafana/grafana:latest
  container_name: grafana
  ports:
    - "3002:3000"  # Changed from 3001 to avoid conflicts
  volumes:
    - ./observability/grafana/provisioning:/etc/grafana/provisioning
  environment:
    - GF_SECURITY_ADMIN_USER=admin
    - GF_SECURITY_ADMIN_PASSWORD=admin
    - GF_USERS_ALLOW_SIGN_UP=false
  depends_on:
    - prometheus
  networks:
    - todo-network
```

---

### PART 2: Orchestration (NGINX Load Balancer)

#### 2.1 Multiple API Instances

**Modify docker-compose.yml** - Replace single `api` service with two instances:
```yaml
api-1:
  build: ./api
  container_name: todo-api-1
  environment:
    - INSTANCE_ID=1
    - PORT=3000
    - REDIS_URL=${REDIS_URL}
    - REDIS_TOKEN=${REDIS_TOKEN}
  deploy:
    resources:
      limits:
        memory: 256M  # Limit for HA demo
  healthcheck:
    test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/health"]
    interval: 10s
    timeout: 5s
    retries: 3
    start_period: 10s
  networks:
    - todo-network

api-2:
  build: ./api
  container_name: todo-api-2
  environment:
    - INSTANCE_ID=2
    - PORT=3000
    - REDIS_URL=${REDIS_URL}
    - REDIS_TOKEN=${REDIS_TOKEN}
  deploy:
    resources:
      limits:
        memory: 256M
  healthcheck:
    test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/health"]
    interval: 10s
    timeout: 5s
    retries: 3
    start_period: 10s
  networks:
    - todo-network
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
    server_name localhost;

    # API requests - load balanced
    location /api {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;

        # Failover - route to healthy instance on errors
        proxy_next_upstream error timeout http_500 http_502 http_503 http_504;
        proxy_next_upstream_tries 2;
    }

    # Metrics endpoint - load balanced
    location /metrics {
        proxy_pass http://api_backend;
    }

    # Frontend - single instance
    location / {
        proxy_pass http://frontend:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**New service in docker-compose**:
```yaml
nginx:
  image: nginx:alpine
  container_name: nginx-lb
  ports:
    - "80:80"
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
  depends_on:
    - api-1
    - api-2
    - frontend
  networks:
    - todo-network
```

---

## New File Structure (After TP2)

```
dev-ops-app-tp1/
├── api/
│   ├── server.js           # MODIFIED: + stress endpoint + metrics + pino logging
│   ├── tracing.js          # NEW: OpenTelemetry setup
│   ├── package.json        # MODIFIED: + OTel + pino dependencies
│   ├── Dockerfile          # MODIFIED: add wget for healthcheck
│   └── .env
├── frontend/
│   ├── server.js
│   ├── package.json
│   ├── Dockerfile
│   └── public/
│       ├── index.html      # MODIFIED: + stress test buttons
│       └── app.js          # MODIFIED: relative API URL + stress functions
├── nginx/
│   └── nginx.conf          # NEW: Load balancer config
├── observability/
│   ├── prometheus.yml      # NEW: Scrape config
│   └── grafana/
│       └── provisioning/
│           ├── datasources/
│           │   └── datasource.yml    # NEW: Prometheus datasource
│           └── dashboards/
│               ├── dashboard.yml     # NEW: Dashboard provisioning
│               └── todo-dashboard.json  # NEW: Main dashboard
├── docker-compose.yml      # MODIFIED: all new services
└── docker-compose.prod.yml # Keep for Render deployment
```

---

## Docker Compose Services Summary

| Service | Port | Purpose |
|---------|------|---------|
| nginx | 80 | Load balancer (main entry point) |
| frontend | 8080 (internal) | Web UI |
| api-1 | 3000 (internal) | API instance 1 |
| api-2 | 3000 (internal) | API instance 2 |
| prometheus | 9090 | Metrics collection |
| grafana | 3002 | Visualization dashboards |
| cadvisor | 8081 | Container metrics |

> **Note**: No local Redis - using Upstash cloud

---

## Implementation Checklist

### Phase 1: Code Modifications
- [ ] Update `frontend/public/app.js` - change API_URL to `/api`
- [ ] Add stress test endpoints to `api/server.js`
- [ ] Add stress test buttons to `frontend/public/index.html`
- [ ] Add INSTANCE_ID to health endpoint response

### Phase 2: Observability Setup
- [ ] Add OpenTelemetry dependencies to `api/package.json`
- [ ] Create `api/tracing.js` with OTel configuration
- [ ] Add Pino logging to `api/server.js`
- [ ] Add custom metrics (todos_total, http_requests_total, http_request_duration)
- [ ] Create `observability/prometheus.yml`
- [ ] Create Grafana provisioning files (datasource + dashboard)

### Phase 3: Orchestration
- [ ] Create `nginx/nginx.conf`
- [ ] Update `docker-compose.yml` with all services:
  - [ ] api-1 with memory limit + healthcheck
  - [ ] api-2 with memory limit + healthcheck
  - [ ] nginx
  - [ ] prometheus
  - [ ] grafana
  - [ ] cadvisor
- [ ] Update `api/Dockerfile` to include wget for healthcheck

### Phase 4: Testing
- [ ] Start all services: `docker-compose up --build`
- [ ] Verify app works via http://localhost
- [ ] Verify Prometheus scrapes targets: http://localhost:9090/targets
- [ ] Verify Grafana dashboards: http://localhost:3002
- [ ] Test HA: trigger stress on api-1, verify app still works via api-2

---

## Demo Script for Colloquium

### 1. Start the Environment
```bash
docker-compose up --build
```

### 2. Show Application Working
- Open http://localhost (via NGINX)
- Create, complete, and delete some tasks
- Show that data persists (Upstash Redis)

### 3. Show Load Balancing
- Open browser DevTools → Network tab
- Make several API requests
- Show requests going to different instances (check response headers or logs)

### 4. Show Observability
- Open http://localhost:9090 (Prometheus)
  - Show targets are UP
  - Query `http_requests_total`
  - Query `container_memory_usage_bytes`
- Open http://localhost:3002 (Grafana, admin/admin)
  - Show container CPU/Memory dashboard
  - Show application metrics dashboard

### 5. Demonstrate High Availability
- In Grafana, watch api-1 memory graph
- Click "Stress Test API-1" button in the app
- Show memory spike in Grafana
- Show that the application continues working (NGINX routes to api-2)
- Click "Clear Memory" to recover api-1

### 6. Show Structured Logs
```bash
docker logs todo-api-1 | head -20
```
- Show JSON structured log format with trace IDs

---

## Quick Start Commands

```bash
# Start all services
docker-compose up --build

# Access points
open http://localhost         # App (via NGINX)
open http://localhost:9090    # Prometheus
open http://localhost:3002    # Grafana (admin/admin)
open http://localhost:8081    # cAdvisor

# Test stress endpoint
curl -X POST http://localhost/api/stress
curl -X POST http://localhost/api/stress/clear

# Check API health
curl http://localhost/api/health

# View logs
docker logs -f todo-api-1
docker logs -f todo-api-2

# Stop all
docker-compose down
```

---

## Environment Variables

Create `.env` file in project root for docker-compose:
```env
REDIS_URL=https://daring-gnu-13089.upstash.io
REDIS_TOKEN=ATMhAAIncDJkYjBlMWUzMDNiYzk0Yzg4OTNhNDA5Yzk4YWY3MDRhY3AyMTMwODk
```

---

## Troubleshooting

### Prometheus can't scrape API
- Check API exposes `/metrics` endpoint
- Verify network connectivity: `docker exec prometheus wget -qO- http://api-1:3000/metrics`

### Grafana shows no data
- Verify Prometheus datasource is configured
- Check time range in Grafana (last 5 minutes)
- Verify Prometheus has data: query in Prometheus UI first

### NGINX returns 502
- Check API containers are running: `docker ps`
- Check API health: `docker exec nginx wget -qO- http://api-1:3000/api/health`
- View NGINX logs: `docker logs nginx-lb`

### Stress test doesn't increase memory
- Increase allocation chunks in the endpoint
- Check container memory limit is set (256M)
