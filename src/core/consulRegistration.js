/**
 * Consul Service Registration — Self-registration + health check with Consul.
 *
 * On startup: registers this service with Consul's agent API.
 * On shutdown: deregisters so Consul immediately marks it as gone.
 *
 * Only active when CONSUL_URL is set and PLATFORM_MODE=direct.
 * Dapr mode handles registration natively.
 */

const CONSUL_URL = process.env.CONSUL_URL || '';

let registeredServiceId = '';

/**
 * Register this service with Consul.
 * @param {string} name - Service name (e.g. 'review-service')
 * @param {number} port - Port the service is listening on
 * @param {string} [host='localhost'] - Host address
 */
export async function register(name, port, host = 'localhost') {
  if (!CONSUL_URL) return;

  const address = host === '0.0.0.0' ? 'localhost' : host;
  registeredServiceId = `${name}-${address}-${port}`;

  const registration = {
    ID: registeredServiceId,
    Name: name,
    Address: address,
    Port: port,
    Check: {
      HTTP: `http://${address}:${port}/health`,
      Interval: '10s',
      Timeout: '5s',
      DeregisterCriticalServiceAfter: '30s',
    },
  };

  try {
    const res = await fetch(`${CONSUL_URL}/v1/agent/service/register`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registration),
    });

    if (res.ok) {
      console.log(`[Consul] Registered ${name} (${registeredServiceId}) at ${address}:${port}`);
    } else {
      console.warn(`[Consul] Registration failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.warn(`[Consul] Registration failed (Consul unavailable): ${err.message}`);
  }
}

/**
 * Deregister this service from Consul.
 */
export async function deregister() {
  if (!CONSUL_URL || !registeredServiceId) return;

  try {
    const res = await fetch(`${CONSUL_URL}/v1/agent/service/deregister/${registeredServiceId}`, {
      method: 'PUT',
    });

    if (res.ok) {
      console.log(`[Consul] Deregistered ${registeredServiceId}`);
    }
  } catch {
    // Best-effort — service is shutting down anyway
  }
}

export default { register, deregister };
