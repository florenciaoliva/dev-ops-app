const express = require("express");
const { Redis } = require("@upstash/redis");
const cors = require("cors");
const pino = require("pino");
require("dotenv").config();

// Importar metricas custom desde tracing.js
const { todosCounter, todosGauge, memoryGauge, stressChunksGauge, prometheusExporter } = require("./tracing");

const app = express();
const PORT = process.env.PORT || 3000;
// Redis Upstash (hardcodeado por requerimiento)
const REDIS_URL = "https://daring-gnu-13089.upstash.io";
const REDIS_TOKEN = "AahXAAIncDIxNjg5ZDVhOTMxOTU0NDZiOTY4MTdhNGJiMjY4OTYyZnAyNDMwOTU";
const INSTANCE_ID = process.env.INSTANCE_ID || "1";

// Logger estructurado
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { instance: INSTANCE_ID, service: "todo-api" },
});

// Memory stress test storage
let memoryHog = [];

// Variable para almacenar el conteo actual de tareas (para metricas)
let currentTodosCount = 0;

app.use(cors());
app.use(express.json());

// Exponer métricas para Prometheus en el mismo puerto de la app
app.get("/metrics", prometheusExporter.getMetricsRequestHandler());

// Middleware de logging de requests
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info(
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: Date.now() - start,
      },
      "request completed"
    );
  });
  next();
});

let redisClient;

async function conectarRedis() {
  try {
    redisClient = new Redis({
      url: REDIS_URL,
      token: REDIS_TOKEN,
    });

    // Upstash Redis connects automatically on first request
    logger.info({ redisUrl: REDIS_URL }, "Cliente Redis inicializado");
  } catch (error) {
    logger.error({ err: error }, "Error al inicializar cliente Redis");
  }
}

// GET /api/todos - Obtener todas las tareas
app.get("/api/todos", async (req, res) => {
  try {
    const todos = await redisClient.get("todos");
    if (todos) {
      // Upstash puede devolver array ya parseado o string
      const lista = Array.isArray(todos) ? todos : JSON.parse(todos);
      currentTodosCount = lista.length;
      res.json(lista);
    } else {
      currentTodosCount = 0;
      res.json([]);
    }
  } catch (error) {
    logger.error({ err: error }, "Error al obtener tareas");
    res.status(500).json({ error: "Error al obtener las tareas" });
  }
});

// POST /api/todos - Crear nueva tarea
app.post("/api/todos", async (req, res) => {
  try {
    const { texto } = req.body;

    if (!texto) {
      return res.status(400).json({ error: "El texto de la tarea es requerido" });
    }

    const todos = await redisClient.get("todos");
    //const tareasActuales = todos ? JSON.parse(todos) : [];
    const tareasActuales = Array.isArray(todos)
      ? todos
      : todos
      ? JSON.parse(todos) // si es string, parsearlo
      : [];
    const nuevaTarea = {
      id: Date.now().toString(),
      texto: texto,
      completada: false,
      fechaCreacion: new Date().toISOString(),
    };

    tareasActuales.push(nuevaTarea);
    await redisClient.set("todos", JSON.stringify(tareasActuales));

    // Actualizar metricas
    todosCounter.add(1);
    currentTodosCount = tareasActuales.length;

    logger.info({ taskId: nuevaTarea.id, texto }, "Tarea creada");
    res.status(201).json(nuevaTarea);
  } catch (error) {
    logger.error({ err: error }, "Error al crear tarea");
    res.status(500).json({ error: "Error al crear la tarea" });
  }
});

// PUT /api/todos/:id - Actualizar tarea (marcar como completada/pendiente)
app.put("/api/todos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { completada } = req.body;

    const todos = await redisClient.get("todos");
    const tareasActuales = Array.isArray(todos) ? todos : todos ? JSON.parse(todos) : [];

    const indice = tareasActuales.findIndex((tarea) => tarea.id === id);

    if (indice === -1) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    tareasActuales[indice].completada = completada;
    await redisClient.set("todos", JSON.stringify(tareasActuales));

    logger.info({ taskId: id, completada }, "Tarea actualizada");
    res.json(tareasActuales[indice]);
  } catch (error) {
    logger.error({ err: error, taskId: id }, "Error al actualizar tarea");
    res.status(500).json({ error: "Error al actualizar la tarea" });
  }
});

// DELETE /api/todos/:id - Eliminar tarea
app.delete("/api/todos/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const todos = await redisClient.get("todos");
    const tareasActuales = Array.isArray(todos) ? todos : todos ? JSON.parse(todos) : [];

    const indice = tareasActuales.findIndex((tarea) => tarea.id === id);

    if (indice === -1) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    const tareaEliminada = tareasActuales.splice(indice, 1)[0];
    await redisClient.set("todos", JSON.stringify(tareasActuales));

    // Actualizar metrica
    currentTodosCount = tareasActuales.length;

    logger.info({ taskId: id }, "Tarea eliminada");
    res.json({ mensaje: "Tarea eliminada exitosamente", tarea: tareaEliminada });
  } catch (error) {
    logger.error({ err: error, taskId: id }, "Error al eliminar tarea");
    res.status(500).json({ error: "Error al eliminar la tarea" });
  }
});

// POST /api/stress - Asignar memoria para simular alta carga (80% del limite)
app.post("/api/stress", (req, res) => {
  const allocateMB = 50; // Chunks de 50MB
  const chunks = 8; // Total: ~400MB (80% de 512MB limite)

  logger.warn("Iniciando stress test de memoria");

  try {
    for (let i = 0; i < chunks; i++) {
      memoryHog.push(Buffer.alloc(allocateMB * 1024 * 1024, "x"));
    }

    const mem = process.memoryUsage();
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    logger.warn({ allocatedMB: memoryHog.length * allocateMB, rssMB }, "Memoria asignada");

    res.json({
      status: "Stress de memoria activado",
      instance: INSTANCE_ID,
      chunksAllocated: memoryHog.length,
      allocatedMB: memoryHog.length * allocateMB,
      rssMB: rssMB,
    });
  } catch (e) {
    logger.error({ err: e }, "Error al asignar memoria");
    res.status(500).json({
      error: "Error al asignar memoria",
      instance: INSTANCE_ID,
      message: e.message,
    });
  }
});

// POST /api/stress/clear - Liberar memoria asignada
app.post("/api/stress/clear", (req, res) => {
  const previousChunks = memoryHog.length;
  memoryHog = [];

  if (global.gc) {
    global.gc();
  }

  logger.info({ previousChunks }, "Memoria liberada");

  res.json({
    status: "Memoria liberada",
    instance: INSTANCE_ID,
    previousChunks: previousChunks,
    rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});

// GET /api/health - Endpoint para verificar el estado de la API y Redis
// Retorna 503 si memoria > 80% del limite (410MB de 512MB)
const MEMORY_LIMIT_MB = 512;
const MEMORY_THRESHOLD_PERCENT = 80;
const MEMORY_THRESHOLD_MB = (MEMORY_LIMIT_MB * MEMORY_THRESHOLD_PERCENT) / 100;

app.get("/api/health", async (req, res) => {
  const mem = process.memoryUsage();
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const memoryPercent = Math.round((rssMB / MEMORY_LIMIT_MB) * 100);
  const isHealthy = rssMB < MEMORY_THRESHOLD_MB;

  try {
    await redisClient.ping();

    const response = {
      status: isHealthy ? "OK" : "UNHEALTHY",
      instance: INSTANCE_ID,
      api: "Funcionando",
      redis: "Conectado",
      memory: {
        rssMB,
        limitMB: MEMORY_LIMIT_MB,
        percent: memoryPercent,
        threshold: MEMORY_THRESHOLD_PERCENT,
        stressChunks: memoryHog.length,
      },
      timestamp: new Date().toISOString(),
    };

    if (isHealthy) {
      res.json(response);
    } else {
      logger.warn({ rssMB, memoryPercent }, "Health check: memoria alta, marcando como unhealthy");
      res.status(503).json(response);
    }
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      instance: INSTANCE_ID,
      api: "Funcionando",
      redis: "Desconectado",
      memory: {
        rssMB,
        limitMB: MEMORY_LIMIT_MB,
        percent: memoryPercent,
        stressChunks: memoryHog.length,
      },
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Registrar callbacks para metricas observables
todosGauge.addCallback((result) => {
  result.observe(currentTodosCount, { instance: INSTANCE_ID });
});

memoryGauge.addCallback((result) => {
  result.observe(process.memoryUsage().rss, { instance: INSTANCE_ID });
});

stressChunksGauge.addCallback((result) => {
  result.observe(memoryHog.length, { instance: INSTANCE_ID });
});

// Inicializar servidor
async function iniciarServidor() {
  await conectarRedis();

  // Cargar conteo inicial de tareas
  try {
    const todos = await redisClient.get("todos");
    // Upstash puede devolver array ya parseado o string
    const lista = Array.isArray(todos) ? todos : todos ? JSON.parse(todos) : [];
    currentTodosCount = lista.length;
    logger.info({ currentTodosCount }, "Conteo inicial de tareas cargado");
  } catch (e) {
    logger.error({ err: e }, "Error al cargar conteo inicial");
  }

  app.listen(PORT, () => {
    logger.info({ port: PORT, redisUrl: REDIS_URL }, "Servidor API iniciado");
  });
}

iniciarServidor();
