const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { metrics } = require('@opentelemetry/api');

const INSTANCE_ID = process.env.INSTANCE_ID || '1';

// Prometheus exporter - expone metricas en puerto 9464
const prometheusExporter = new PrometheusExporter({
  port: 9464,
  endpoint: '/metrics',
});

// Inicializar OpenTelemetry SDK
const sdk = new NodeSDK({
  serviceName: `todo-api-${INSTANCE_ID}`,
  metricReader: prometheusExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Desactivar instrumentacion de filesystem (muy verbose)
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

// Crear meter para metricas custom de la aplicacion
const meter = metrics.getMeter('todo-api', '1.0.0');

// Metricas custom
const todosCounter = meter.createCounter('todos_created_total', {
  description: 'Total de tareas creadas',
});

const todosGauge = meter.createObservableGauge('todos_current_total', {
  description: 'Cantidad actual de tareas',
});

const memoryGauge = meter.createObservableGauge('app_memory_rss_bytes', {
  description: 'Memoria RSS usada por la aplicacion',
});

const stressChunksGauge = meter.createObservableGauge('app_stress_chunks', {
  description: 'Chunks de memoria asignados por stress test',
});

// Exportar para uso en server.js
module.exports = {
  meter,
  todosCounter,
  todosGauge,
  memoryGauge,
  stressChunksGauge,
  INSTANCE_ID,
};

console.log(`[Instancia ${INSTANCE_ID}] OpenTelemetry inicializado. Metricas en :9464/metrics`);

// Shutdown graceful
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry SDK cerrado'))
    .catch((err) => console.error('Error cerrando SDK', err))
    .finally(() => process.exit(0));
});
