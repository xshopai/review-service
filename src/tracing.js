/**
 * Zipkin OpenTelemetry instrumentation for Node.js services
 *
 * This module initializes OpenTelemetry with Zipkin exporter for distributed tracing.
 * It should be imported at the very beginning of the application, before any other imports.
 */

import process from 'process';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';

const serviceName = process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'unknown-service';
const zipkinEndpoint = process.env.OTEL_EXPORTER_ZIPKIN_ENDPOINT;

let sdk = null;

function initializeTracing() {
  if (!zipkinEndpoint) {
    console.log('⚠️  Zipkin tracing not configured - OTEL_EXPORTER_ZIPKIN_ENDPOINT not set');
    return false;
  }

  try {
    const zipkinExporter = new ZipkinExporter({
      url: zipkinEndpoint,
      serviceName: serviceName,
    });

    sdk = new NodeSDK({
      serviceName: serviceName,
      traceExporter: zipkinExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Enable HTTP instrumentation
          '@opentelemetry/instrumentation-http': { enabled: true },
          // Enable Express instrumentation
          '@opentelemetry/instrumentation-express': { enabled: true },
          // Enable MongoDB instrumentation if used
          '@opentelemetry/instrumentation-mongodb': { enabled: true },
          // Disable DNS (too noisy)
          '@opentelemetry/instrumentation-dns': { enabled: false },
          // Disable net (too noisy)
          '@opentelemetry/instrumentation-net': { enabled: false },
        }),
      ],
    });

    sdk.start();
    console.log(`✅ Zipkin tracing initialized for ${serviceName} → ${zipkinEndpoint}`);

    // Graceful shutdown
    process.on('SIGTERM', () => {
      sdk
        .shutdown()
        .then(() => console.log('Tracing terminated'))
        .catch((error) => console.log('Error terminating tracing', error))
        .finally(() => process.exit(0));
    });

    return true;
  } catch (error) {
    console.error(`❌ Failed to initialize Zipkin tracing: ${error.message}`);
    return false;
  }
}

// Initialize tracing
const tracingEnabled = initializeTracing();

export { tracingEnabled, sdk };
