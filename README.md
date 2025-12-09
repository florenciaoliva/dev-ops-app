# 📋 ToDo App - Aplicación Contenerizada con Redis

> **Trabajo Práctico 1** - DevOps UTN FRRe 2025

Una aplicación web completa para gestión de tareas que demuestra la integración de contenedores Docker, API REST y Redis como base de datos en memoria.

## 🚀 Inicio Rápido

```bash
# Clonar el repositorio
git clone <URL_DEL_REPOSITORIO>
cd dev-ops-app

# Ejecutar con Docker Compose
docker-compose up --build

# Acceder a la aplicación
open http://localhost:8080
```

## 🏗️ Tecnologías

- **Frontend**: HTML5,     CSS3, JavaScript (Vanilla)
- **Backend**: Node.js, Express.js
- **Base de Datos**: Redis (in-memory)
- **Contenedores**: Docker, Docker Compose
- **CI/CD**: GitHub Actions
- **Registry**: Docker Hub

## 📱 Funcionalidades

- ✅ Crear, leer, actualizar y eliminar tareas
- ✅ Marcar tareas como completadas/pendientes
- ✅ Persistencia de datos en Redis
- ✅ Interface web responsive
- ✅ API REST documentada
- ✅ Monitoreo de salud del sistema
- ✅ Despliegue automatizado

## 📖 Documentación

Para la guía completa de instalación y configuración, consulta:
**[📚 setup.md](./setup.md)**

## 🧪 Testing Local

```bash
# Verificar API
curl http://localhost:3000/api/health

# Crear tarea de prueba
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"texto":"Tarea de prueba"}'
```

## 🐳 Docker

```bash
# Desarrollo
docker-compose up --build

# Producción
docker-compose -f docker-compose.prod.yml up -d
```

## 📊 Arquitectura

```
Frontend (8080) → API (3000) → Redis (6379)
```

---

**Desarrollado para UTN FRRe - DevOps 2025** 🎓