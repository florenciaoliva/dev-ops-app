const API_URL = "/api"
async function cargarTareas() {
    try {
        console.log("prueba RENDER")
        const respuesta = await fetch(`${API_URL}/todos`);
        const tareas = await respuesta.json();

        const listaTareas = document.getElementById('listaTareas');

        if (tareas.length === 0) {
            listaTareas.innerHTML = '<p>No hay tareas. ¡Agrega una nueva!</p>';
            return;
        }

        listaTareas.innerHTML = tareas.map(tarea => `
            <div class="tarea ${tarea.completada ? 'completada' : ''}">
                <p><strong>Tarea:</strong> ${tarea.texto}</p>
                <p><strong>Estado:</strong> ${tarea.completada ? 'Completada' : 'Pendiente'}</p>
                <p><strong>Creada:</strong> ${new Date(tarea.fechaCreacion).toLocaleString('es-ES')}</p>
                <button onclick="cambiarEstado('${tarea.id}', ${!tarea.completada})">
                    ${tarea.completada ? 'Marcar Pendiente' : 'Marcar Completada'}
                </button>
                <button onclick="eliminarTarea('${tarea.id}')">Eliminar</button>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error al cargar tareas:', error);
        document.getElementById('listaTareas').innerHTML =
            '<p style="color: red;">❌ Error al conectar con la API</p>';
    }
}

async function agregarTarea() {
    const input = document.getElementById('nuevaTarea');
    const texto = input.value.trim();

    if (!texto) {
        alert('Por favor, escribe una tarea');
        return;
    }

    try {
        const respuesta = await fetch(`${API_URL}/todos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ texto })
        });

        if (respuesta.ok) {
            input.value = '';
            cargarTareas();
        } else {
            alert('Error al agregar la tarea');
        }

    } catch (error) {
        console.error('Error al agregar tarea:', error);
        alert('Error de conexión al agregar la tarea');
    }
}

async function cambiarEstado(id, completada) {
    try {
        const respuesta = await fetch(`${API_URL}/todos/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ completada })
        });

        if (respuesta.ok) {
            cargarTareas();
        } else {
            alert('Error al actualizar la tarea');
        }

    } catch (error) {
        console.error('Error al cambiar estado:', error);
        alert('Error de conexión al actualizar la tarea');
    }
}

async function eliminarTarea(id) {
    if (!confirm('¿Estás seguro de eliminar esta tarea?')) {
        return;
    }

    try {
        const respuesta = await fetch(`${API_URL}/todos/${id}`, {
            method: 'DELETE'
        });

        if (respuesta.ok) {
            cargarTareas();
        } else {
            alert('Error al eliminar la tarea');
        }

    } catch (error) {
        console.error('Error al eliminar tarea:', error);
        alert('Error de conexión al eliminar la tarea');
    }
}

async function verificarEstado() {
    try {
        const respuesta = await fetch(`${API_URL}/health`);
        const estado = await respuesta.json();

        document.getElementById('estadoSistema').innerHTML = `
            <div style="border: 1px solid #ccc; padding: 10px; margin: 10px 0;">
                <p><strong>Estado API:</strong> ${estado.api}</p>
                <p><strong>Estado Redis:</strong> ${estado.redis}</p>
                <p><strong>Última verificación:</strong> ${new Date(estado.timestamp).toLocaleString('es-ES')}</p>
                <p style="color: green;">✅ Sistema funcionando correctamente</p>
            </div>
        `;

    } catch (error) {
        console.error('Error al verificar estado:', error);
        document.getElementById('estadoSistema').innerHTML =
            '<p style="color: red;">❌ Error al conectar con la API</p>';
    }
}

// Event listener para Enter en el input
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nuevaTarea').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            agregarTarea();
        }
    });

    // Cargar tareas al inicio
    cargarTareas();
});