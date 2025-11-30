// API URL - usa ruta relativa para pasar por NGINX load balancer
const API_URL = "/api";

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
  statusDiv.innerHTML = '<p style="color: orange;">Activando stress test...</p>';

  try {
    const respuesta = await fetch(`${API_URL}/stress`, {
      method: "POST",
    });
    const resultado = await respuesta.json();

    statusDiv.innerHTML = `
            <div style="border: 1px solid #ff6b6b; padding: 10px; margin: 10px 0; background-color: #ffe0e0;">
                <p><strong>Estado:</strong> ${resultado.status}</p>
                <p><strong>Instancia afectada:</strong> ${resultado.instance}</p>
                <p><strong>Memoria asignada:</strong> ${resultado.allocatedMB} MB</p>
                <p><strong>RSS actual:</strong> ${resultado.rssMB} MB</p>
                <p style="color: red;">STRESS ACTIVO - El load balancer deberia redirigir trafico</p>
            </div>
        `;
  } catch (error) {
    console.error("Error al activar stress:", error);
    statusDiv.innerHTML = '<p style="color: red;">Error al activar stress test</p>';
  }
}

// Event listener para Enter en el input
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("nuevaTarea").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      agregarTarea();
    }
  });

  // Cargar tareas al inicio
  cargarTareas();
});
