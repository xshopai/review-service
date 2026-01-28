/**
 * Dapr Secret Management Service
 * Provides secret management using Dapr's secret store building block.
 */

import { DaprClient } from '@dapr/dapr';
import { logger } from '../core/logger.js';
import config from '../core/config.js';

class DaprSecretManager {
  constructor() {
    this.environment = config.env;
    this.daprHost = process.env.DAPR_HOST || '127.0.0.1';
    this.daprPort = process.env.DAPR_HTTP_PORT || '3500';

    this.secretStoreName = 'secretstore';

    this.client = new DaprClient({
      daprHost: this.daprHost,
      daprPort: this.daprPort,
    });

    logger.info('Secret manager initialized', {
      event: 'secret_manager_init',
      daprEnabled: true,
      environment: this.environment,
      secretStore: this.secretStoreName,
    });
  }

  /**
   * Get a secret value from Dapr secret store
   * @param {string} secretName - Name of the secret to retrieve
   * @returns {Promise<string>} Secret value
   */
  async getSecret(secretName) {
    try {
      const response = await this.client.secret.get(this.secretStoreName, secretName);

      // Handle different response types
      if (response && typeof response === 'object') {
        // Response is typically an object like { secretName: 'value' }
        const value = response[secretName];
        if (value !== undefined && value !== null) {
          logger.debug('Retrieved secret from Dapr', {
            event: 'secret_retrieved',
            secretName,
            source: 'dapr',
            store: this.secretStoreName,
          });
          return String(value);
        }

        // If not found by key, try getting first value
        const values = Object.values(response);
        if (values.length > 0 && values[0] !== undefined) {
          logger.debug('Retrieved secret from Dapr (first value)', {
            event: 'secret_retrieved',
            secretName,
            source: 'dapr',
            store: this.secretStoreName,
          });
          return String(values[0]);
        }
      }

      throw new Error(`Secret '${secretName}' not found in Dapr store`);
    } catch (error) {
      logger.error(`Failed to get secret from Dapr: ${error.message}`, {
        event: 'secret_retrieval_error',
        secretName,
        error: error.message,
        store: this.secretStoreName,
      });
      throw error;
    }
  }

  /**
   * Get database configuration from secrets or environment variables
   * @returns {Promise<Object>} Database connection parameters
   */
  async getDatabaseConfig() {
    const [host, port, username, password, database, authSource] = await Promise.all([
      this.getSecret('MONGODB_HOST'),
      this.getSecret('MONGODB_PORT'),
      this.getSecret('MONGO_INITDB_ROOT_USERNAME'),
      this.getSecret('MONGO_INITDB_ROOT_PASSWORD'),
      this.getSecret('MONGO_INITDB_DATABASE'),
      this.getSecret('MONGODB_AUTH_SOURCE'),
    ]);

    return {
      host: host || '127.0.0.1',
      port: parseInt(port || '27017', 10),
      username: username || null,
      password: password || null,
      database: database || 'xshopai_reviews',
      authSource: authSource || 'admin',
    };
  }

  /**
   * Get JWT configuration from Dapr secrets and environment
   * Only JWT_SECRET is truly secret - algorithm and expiration are just config
   * @returns {Promise<Object>} JWT configuration parameters
   */
  async getJwtConfig() {
    const secret = await this.getSecret('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET not found in Dapr secret store');
    }

    // Algorithm and expiration from environment variables (not secrets)
    const algorithm = process.env.JWT_ALGORITHM || 'HS256';
    const expiration = parseInt(process.env.JWT_EXPIRATION || '3600', 10);
    const issuer = process.env.JWT_ISSUER || 'auth-service';
    const audience = process.env.JWT_AUDIENCE || 'xshopai-platform';

    return {
      secret,
      algorithm,
      expiration,
      issuer,
      audience,
    };
  }
}

// Global instance
export const secretManager = new DaprSecretManager();

// Helper functions for easy access
export const getDatabaseConfig = () => secretManager.getDatabaseConfig();
export const getJwtConfig = () => secretManager.getJwtConfig();
