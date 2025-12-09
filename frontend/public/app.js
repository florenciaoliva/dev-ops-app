// API URL - en Render el frontend va directo al backend publicado
const API_URL = "https://todo-api-latest-gpya.onrender.com/api";

// Almacena la última instancia vista en "Verificar Conexión"
let currentInstance = null;

// Estado del wizard de demo HA
let demoState = {
  step: 0,
  initialInstance: null,
  stressedInstance: null
};

async function cargarTareas() {
  try {
    const respuesta = await fetch(`${API_URL}/todos`);
    const tareas = await respuesta.json();

    const listaTareas = document.getElementById("listaTareas");

    if (tareas.length === 0) {
      listaTareas.innerHTML = "<p>No hay tareas. ¡Agrega una nueva!</p>";
      return;
    }

    listaTareas.innerHTML = tareas
      .map(
        (tarea) => `
            <div class="tarea ${tarea.completada ? "completada" : ""}">
                <p><strong>Tarea:</strong> ${tarea.texto}</p>
                <p><strong>Estado:</strong> ${tarea.completada ? "Completada" : "Pendiente"}</p>
                <p><strong>Creada:</strong> ${new Date(tarea.fechaCreacion).toLocaleString(
                  "es-ES"
                )}</p>
                <button onclick="cambiarEstado('${tarea.id}', ${!tarea.completada})">
                    ${tarea.completada ? "Marcar Pendiente" : "Marcar Completada"}
                </button>
                <button onclick="eliminarTarea('${tarea.id}')">Eliminar</button>
            </div>
        `
      )
      .join("");
  } catch (error) {
    console.error("Error al cargar tareas:", error);
    document.getElementById("listaTareas").innerHTML =
      '<p style="color: red;">❌ Error al conectar con la API</p>';
  }
}

async function agregarTarea() {
  const input = document.getElementById("nuevaTarea");
  const texto = input.value.trim();

  if (!texto) {
    alert("Por favor, escribe una tarea");
    return;
  }

  try {
    const respuesta = await fetch(`${API_URL}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ texto }),
    });

    if (respuesta.ok) {
      input.value = "";
      cargarTareas();
    } else {
      alert("Error al agregar la tarea");
    }
  } catch (error) {
    console.error("Error al agregar tarea:", error);
    alert("Error de conexión al agregar la tarea");
  }
}

async function cambiarEstado(id, completada) {
  try {
    const respuesta = await fetch(`${API_URL}/todos/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ completada }),
    });

    if (respuesta.ok) {
      cargarTareas();
    } else {
      alert("Error al actualizar la tarea");
    }
  } catch (error) {
    console.error("Error al cambiar estado:", error);
    alert("Error de conexión al actualizar la tarea");
  }
}

async function eliminarTarea(id) {
  if (!confirm("¿Estás seguro de eliminar esta tarea?")) {
    return;
  }

  try {
    const respuesta = await fetch(`${API_URL}/todos/${id}`, {
      method: "DELETE",
    });

    if (respuesta.ok) {
      cargarTareas();
    } else {
      alert("Error al eliminar la tarea");
    }
  } catch (error) {
    console.error("Error al eliminar tarea:", error);
    alert("Error de conexión al eliminar la tarea");
  }
}

async function verificarEstado() {
  try {
    const respuesta = await fetch(`${API_URL}/health`);
    const estado = await respuesta.json();

    // Guardar la instancia actual para el stress test
    currentInstance = estado.instance;

    const isHealthy = estado.status === "OK";
    const statusColor = isHealthy ? "green" : "red";
    const memoryColor = estado.memory.percent >= 80 ? "red" : "green";

    document.getElementById("estadoSistema").innerHTML = `
            <div style="border: 1px solid ${statusColor}; padding: 10px; margin: 10px 0; background-color: ${
      isHealthy ? "#f0fff0" : "#fff0f0"
    };">
                <p><strong>Estado:</strong> <span style="color: ${statusColor};">${
      estado.status
    }</span></p>
                <p><strong>Instancia:</strong> ${estado.instance}</p>
                <p><strong>Estado Redis:</strong> ${estado.redis}</p>
                <p><strong>Memoria:</strong> <span style="color: ${memoryColor};">${
      estado.memory.rssMB
    } MB / ${estado.memory.limitMB} MB (${estado.memory.percent}%)</span></p>
                <p><strong>Umbral:</strong> ${estado.memory.threshold}%</p>
                <p><strong>Stress Chunks:</strong> ${estado.memory.stressChunks}</p>
                <p><strong>Verificacion:</strong> ${new Date(estado.timestamp).toLocaleString(
                  "es-ES"
                )}</p>
                ${
                  isHealthy
                    ? '<p style="color: green;">Instancia saludable</p>'
                    : '<p style="color: red;">INSTANCIA NO SALUDABLE - NGINX redirigira trafico</p>'
                }
            </div>
        `;
  } catch (error) {
    console.error("Error al verificar estado:", error);
    document.getElementById("estadoSistema").innerHTML =
      '<p style="color: red;">Error al conectar con la API</p>';
  }
}

async function activarStress() {
  const statusDiv = document.getElementById("stressStatus");

  // Verificar que primero se haya hecho clic en "Verificar Conexión"
  if (!currentInstance) {
    statusDiv.innerHTML = `
      <div style="border: 1px solid orange; padding: 10px; margin: 10px 0; background-color: #fff3e0;">
          <p style="color: orange; font-weight: bold;">Primero haz clic en "Verificar Conexión API/Redis"</p>
          <p>Esto detectará la instancia actual para aplicar el stress test correctamente.</p>
      </div>
    `;
    return;
  }

  const targetInstance = currentInstance;
  statusDiv.innerHTML = `<p style="color: orange;">Activando stress en instancia ${targetInstance}...</p>`;

  try {
    // Intentar activar stress en la misma instancia (máximo 5 intentos)
    let resultado = null;
    let intentos = 0;
    const maxIntentos = 5;

    while (intentos < maxIntentos) {
      intentos++;
      try {
        const respuesta = await fetch(`${API_URL}/stress`, {
          method: "POST",
        });

        if (!respuesta.ok) {
          // Si hay error HTTP, esperar y reintentar
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        resultado = await respuesta.json();

        // Si el stress se activó en la instancia objetivo, terminamos
        if (resultado.instance === targetInstance) {
          break;
        }

        // Si no, limpiamos el stress de la otra instancia y reintentamos
        try {
          await fetch(`${API_URL}/stress/clear`, { method: "POST" });
        } catch (e) {
          // Ignorar errores de clear
        }
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        // Error de red, esperar y reintentar
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (resultado && resultado.instance === targetInstance) {
      statusDiv.innerHTML = `
        <div style="border: 1px solid #ff6b6b; padding: 10px; margin: 10px 0; background-color: #ffe0e0;">
            <p><strong>Estado:</strong> ${resultado.status}</p>
            <p><strong>Instancia afectada:</strong> ${resultado.instance}</p>
            <p><strong>Memoria asignada:</strong> ${resultado.allocatedMB} MB</p>
            <p><strong>RSS actual:</strong> ${resultado.rssMB} MB</p>
            <p style="color: red; font-weight: bold;">STRESS ACTIVO en instancia ${resultado.instance}</p>
            <p style="color: blue;">Haz clic en "Verificar Conexión" para ver el failover a la otra instancia</p>
        </div>
      `;
    } else if (resultado) {
      statusDiv.innerHTML = `
        <div style="border: 1px solid orange; padding: 10px; margin: 10px 0; background-color: #fff3e0;">
            <p>No se pudo activar stress en la instancia ${targetInstance} después de ${maxIntentos} intentos.</p>
            <p>Se activó en instancia ${resultado.instance} en su lugar.</p>
            <p style="color: blue;">Haz clic en "Verificar Conexión" para ver el estado actual.</p>
        </div>
      `;
    } else {
      statusDiv.innerHTML = `
        <div style="border: 1px solid red; padding: 10px; margin: 10px 0; background-color: #ffe0e0;">
            <p>Error al activar stress después de ${maxIntentos} intentos.</p>
            <p>Intenta hacer clic en "Verificar Conexión" primero.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error al activar stress:", error);
    statusDiv.innerHTML = '<p style="color: red;">Error al activar stress test</p>';
  }
}

// ==================== DEMO HA - WIZARD ====================

async function stepDetectarInstancia() {
  const resultDiv = document.getElementById("step1Result");
  resultDiv.innerHTML = '<p style="color: orange;">Detectando...</p>';

  try {
    const respuesta = await fetch(`${API_URL}/health`);
    const estado = await respuesta.json();

    demoState.initialInstance = estado.instance;
    demoState.step = 1;

    resultDiv.innerHTML = `
      <div style="margin-top: 10px; padding: 8px; background-color: #e8f5e9; border-radius: 4px;">
        <p style="margin: 0; color: #2e7d32;">
          ✅ Conectado a <strong>Instancia ${estado.instance}</strong>
        </p>
        <p style="margin: 5px 0 0 0; font-size: 11px; color: #666;">
          Memoria: ${estado.memory.rssMB} MB (${estado.memory.percent}%)
        </p>
      </div>
    `;

    // Habilitar paso 2
    document.getElementById("step2").style.opacity = "1";
    document.getElementById("btnStep2").disabled = false;

  } catch (error) {
    resultDiv.innerHTML = '<p style="color: red;">Error al detectar instancia</p>';
  }
}

async function stepActivarStress() {
  if (demoState.step < 1) {
    alert("Primero completa el Paso 1");
    return;
  }

  const resultDiv = document.getElementById("step2Result");
  const targetInstance = demoState.initialInstance;

  resultDiv.innerHTML = `<p style="color: orange;">Activando stress en instancia ${targetInstance}...</p>`;

  try {
    let resultado = null;
    let intentos = 0;
    const maxIntentos = 5;

    while (intentos < maxIntentos) {
      intentos++;
      try {
        const respuesta = await fetch(`${API_URL}/stress`, { method: "POST" });

        if (!respuesta.ok) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        resultado = await respuesta.json();

        if (resultado.instance === targetInstance) {
          break;
        }

        try {
          await fetch(`${API_URL}/stress/clear`, { method: "POST" });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (resultado && resultado.instance === targetInstance) {
      demoState.stressedInstance = resultado.instance;
      demoState.step = 2;

      resultDiv.innerHTML = `
        <div style="margin-top: 10px; padding: 8px; background-color: #ffebee; border-radius: 4px;">
          <p style="margin: 0; color: #c62828;">
            🔥 <strong>STRESS ACTIVO</strong> en Instancia ${resultado.instance}
          </p>
          <p style="margin: 5px 0 0 0; font-size: 11px; color: #666;">
            Memoria: ${resultado.rssMB} MB (${resultado.allocatedMB} MB asignados)
          </p>
          <p style="margin: 5px 0 0 0; font-size: 11px; color: #1976d2;">
            → La instancia ahora retorna 503 (unhealthy)
          </p>
        </div>
      `;

      // Habilitar paso 3
      document.getElementById("step3").style.opacity = "1";
      document.getElementById("btnStep3").disabled = false;

    } else {
      resultDiv.innerHTML = `
        <div style="margin-top: 10px; padding: 8px; background-color: #fff3e0; border-radius: 4px;">
          <p style="color: orange;">No se pudo activar en instancia ${targetInstance}. Intenta de nuevo.</p>
        </div>
      `;
    }

  } catch (error) {
    resultDiv.innerHTML = '<p style="color: red;">Error al activar stress</p>';
  }
}

async function stepVerificarFailover() {
  if (demoState.step < 2) {
    alert("Primero completa el Paso 2");
    return;
  }

  const resultDiv = document.getElementById("step3Result");
  resultDiv.innerHTML = '<p style="color: orange;">Verificando failover...</p>';

  try {
    const respuesta = await fetch(`${API_URL}/health`);
    const estado = await respuesta.json();

    const isFailover = estado.instance !== demoState.stressedInstance;

    if (isFailover) {
      resultDiv.innerHTML = `
        <div style="margin-top: 10px; padding: 8px; background-color: #e3f2fd; border-radius: 4px;">
          <p style="margin: 0; color: #1565c0;">
            🎉 <strong>FAILOVER EXITOSO!</strong>
          </p>
          <p style="margin: 5px 0 0 0; color: #2e7d32;">
            Ahora conectado a <strong>Instancia ${estado.instance}</strong>
          </p>
          <p style="margin: 5px 0 0 0; font-size: 11px; color: #666;">
            El load balancer redirigió el tráfico automáticamente.
          </p>
        </div>
      `;
      demoState.step = 3;
    } else {
      resultDiv.innerHTML = `
        <div style="margin-top: 10px; padding: 8px; background-color: #fff3e0; border-radius: 4px;">
          <p style="color: orange;">
            Aún en Instancia ${estado.instance}. Espera unos segundos e intenta de nuevo.
          </p>
        </div>
      `;
    }

  } catch (error) {
    resultDiv.innerHTML = '<p style="color: red;">Error al verificar</p>';
  }
}

function resetDemo() {
  // Limpiar stress de ambas instancias
  fetch(`${API_URL}/stress/clear`, { method: "POST" }).catch(() => {});
  fetch(`${API_URL}/stress/clear`, { method: "POST" }).catch(() => {});

  // Resetear estado
  demoState = { step: 0, initialInstance: null, stressedInstance: null };

  // Limpiar UI
  document.getElementById("step1Result").innerHTML = "";
  document.getElementById("step2Result").innerHTML = "";
  document.getElementById("step3Result").innerHTML = "";

  // Deshabilitar pasos 2 y 3
  document.getElementById("step2").style.opacity = "0.5";
  document.getElementById("step3").style.opacity = "0.5";
  document.getElementById("btnStep2").disabled = true;
  document.getElementById("btnStep3").disabled = true;
}

// ==================== EVENT LISTENERS ====================

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("nuevaTarea").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      agregarTarea();
    }
  });

  // Cargar tareas al inicio
  cargarTareas();
});
