/**
 * Server Bootstrap
 * Loads environment variables BEFORE importing app modules
 * This prevents module initialization race conditions with dotenv
 */

import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import validateConfig from './validators/config.validator.js';

async function startServer() {
  try {
    // Initialize tracing FIRST (must be dynamic import after dotenv.config due to ES module hoisting)
    await import('./tracing.js');

    // Validate configuration (blocking - must pass)
    validateConfig();

    // Start the application (imports app.js after env vars are loaded)
    await import('./app.js');
  } catch (error) {
    console.error('❌ Failed to start review service:', error.message);
    process.exit(1);
  }
}

startServer();
