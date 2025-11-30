const express = require("express");
const { Redis } = require("@upstash/redis");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const INSTANCE_ID = process.env.INSTANCE_ID || "1";

// Memory stress test storage
let memoryHog = [];

app.use(cors());
app.use(express.json());

let redisClient;

async function conectarRedis() {
  try {
    redisClient = new Redis({
      url: REDIS_URL,
      token: process.env.REDIS_TOKEN,
    });

    console.log("✅ Conectado a Redis exitosamente");
  } catch (error) {
    console.error("❌ Error al conectar con Redis:", error);
  }
}

// GET /api/todos - Obtener todas las tareas
app.get("/api/todos", async (req, res) => {
  try {
    const todos = await redisClient.get("todos");
    const lista = Array.isArray(todos)
      ? todos
      : todos
      ? todos // si es string, parsearlo
      : [];
    res.json(lista);
  } catch (error) {
    console.error("Error al obtener tareas:", error);
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

    res.status(201).json(nuevaTarea);
  } catch (error) {
    console.error("Error al crear tarea:", error);
    res.status(500).json({ error: "Error al crear la tarea" });
  }
});

// PUT /api/todos/:id - Actualizar tarea (marcar como completada/pendiente)
app.put("/api/todos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { completada } = req.body;

    const todos = await redisClient.get("todos");
    const tareasActuales = todos ? todos : [];

    const indice = tareasActuales.findIndex((tarea) => tarea.id === id);

    if (indice === -1) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    tareasActuales[indice].completada = completada;
    await redisClient.set("todos", JSON.stringify(tareasActuales));

    res.json(tareasActuales[indice]);
  } catch (error) {
    console.error("Error al actualizar tarea:", error);
    res.status(500).json({ error: "Error al actualizar la tarea" });
  }
});

// DELETE /api/todos/:id - Eliminar tarea
app.delete("/api/todos/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const todos = await redisClient.get("todos");
    const tareasActuales = todos ? todos : [];

    const indice = tareasActuales.findIndex((tarea) => tarea.id === id);

    if (indice === -1) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    const tareaEliminada = tareasActuales.splice(indice, 1)[0];
    await redisClient.set("todos", JSON.stringify(tareasActuales));

    res.json({ mensaje: "Tarea eliminada exitosamente", tarea: tareaEliminada });
  } catch (error) {
    console.error("Error al eliminar tarea:", error);
    res.status(500).json({ error: "Error al eliminar la tarea" });
  }
});

// POST /api/stress - Asignar memoria para simular alta carga
app.post("/api/stress", (req, res) => {
  const allocateMB = 50; // Chunks de 50MB
  const chunks = 20; // Total: ~1GB

  console.log(`[Instancia ${INSTANCE_ID}] Iniciando stress test de memoria...`);

  try {
    for (let i = 0; i < chunks; i++) {
      memoryHog.push(Buffer.alloc(allocateMB * 1024 * 1024, "x"));
    }

    const mem = process.memoryUsage();
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    console.log(
      `[Instancia ${INSTANCE_ID}] Memoria asignada: ${
        memoryHog.length * allocateMB
      }MB, RSS: ${rssMB}MB`
    );

    res.json({
      status: "Stress de memoria activado",
      instance: INSTANCE_ID,
      chunksAllocated: memoryHog.length,
      allocatedMB: memoryHog.length * allocateMB,
      rssMB: rssMB,
    });
  } catch (e) {
    console.error(`[Instancia ${INSTANCE_ID}] Error al asignar memoria:`, e.message);
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

  console.log(`[Instancia ${INSTANCE_ID}] Memoria liberada. Chunks anteriores: ${previousChunks}`);

  res.json({
    status: "Memoria liberada",
    instance: INSTANCE_ID,
    previousChunks: previousChunks,
    rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});

// GET /api/health - Endpoint para verificar el estado de la API y Redis
app.get("/api/health", async (req, res) => {
  const mem = process.memoryUsage();
  const rssMB = Math.round(mem.rss / 1024 / 1024);

  try {
    await redisClient.ping();
    res.json({
      status: "OK",
      instance: INSTANCE_ID,
      api: "Funcionando",
      redis: "Conectado",
      memory: {
        rssMB,
        stressChunks: memoryHog.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      instance: INSTANCE_ID,
      api: "Funcionando",
      redis: "Desconectado",
      memory: {
        rssMB,
        stressChunks: memoryHog.length,
      },
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Inicializar servidor
async function iniciarServidor() {
  await conectarRedis();

  app.listen(PORT, () => {
    console.log(`🚀 Servidor API corriendo en puerto ${PORT}`);
    console.log(`📡 Conectado a Redis en: ${REDIS_URL}`);
  });
}

iniciarServidor();
