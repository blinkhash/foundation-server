/*
 *
 * Example (Main)
 *
 */

const config = {};

// Stratum Server identification
config.identifier = '';

// Logger Configuration
config.logger = {};
config.logger.logColors = true;
config.logger.logLevel = 'debug';

// Clustering Configuration
config.clustering = {};
config.clustering.enabled = true;
config.clustering.forks = 'auto';

// TLS Configuration
config.tls = {};
config.tls.ca = '';
config.tls.key = '';
config.tls.cert = '';

// Redis Configuration
config.redis = {};
config.redis.host = '127.0.0.1';
config.redis.port = 6379;
config.redis.password = '';
config.redis.tls = false;

// Server Configuration
config.server = {};
config.server.host = '127.0.0.1';
config.server.port = 3001;

// Export Configuration
module.exports = config;
