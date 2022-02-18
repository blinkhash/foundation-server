/*
 *
 * Statistics (Updated)
 *
 */

const utils = require('./utils');
const Algorithms = require('foundation-stratum').algorithms;

////////////////////////////////////////////////////////////////////////////////

// Main Statistics Function
const PoolStatistics = function (logger, client, poolConfig, portalConfig) {

  const _this = this;
  process.setMaxListeners(0);

  this.pool = poolConfig.name;
  this.client = client;
  this.poolConfig = poolConfig;
  this.portalConfig = portalConfig;
  this.forkId = process.env.forkId;

  const logSystem = 'Pool';
  const logComponent = poolConfig.name;
  const logSubCat = `Thread ${ parseInt(_this.forkId) + 1 }`;

  // Current Statistics Intervals
  _this.hashrateInterval = _this.poolConfig.statistics.hashrateInterval || 20;
  _this.historicalInterval = _this.poolConfig.statistics.historicalInterval || 1800;
  _this.refreshInterval = _this.poolConfig.statistics.refreshInterval || 20;
  _this.paymentsInterval = _this.poolConfig.statistics.paymentsInterval || 20;

  // Current Statistics Windows
  _this.hashrateWindow = _this.poolConfig.statistics.hashrateWindow || 300;
  _this.historicalWindow = _this.poolConfig.statistics.historicalWindow || 86400;
  _this.paymentsWindow = _this.poolConfig.statistics.paymentsWindow || 604800;

  // Calculate Historical Information
  this.calculateHistoricalInfo = function(results, blockType) {

    const commands = [];
    const dateNow = Date.now();
    const algorithm = _this.poolConfig.primary.coin.algorithms.mining;
    const multiplier = Math.pow(2, 32) / Algorithms[algorithm].multiplier;

    // Build Historical Output
    const output = {
      time: dateNow,
      hashrate: {
        shared: utils.processIdentifiedWork(results[1], multiplier, _this.hashrateWindow),
        solo: utils.processIdentifiedWork(results[2], multiplier, _this.hashrateWindow),
      },
      network: {
        difficulty: parseFloat((results[0] || {}).difficulty || 0),
        hashrate: parseFloat((results[0] || {}).hashrate || 0),
      },
      status: {
        miners: utils.combineMiners(results[1], results[2]),
        workers: utils.combineWorkers(results[1], results[2]),
      },
    };

    // Handle Historical Updates
    commands.push(['zadd', `${ _this.pool }:statistics:${ blockType }:historical`, dateNow / 1000 | 0, JSON.stringify(output)]);
    return commands;
  };

  // Handle Hashrate Information in Redis
  this.handleHashrateInfo = function(blockType, callback) {
    const commands = [];
    const windowTime = (((Date.now() / 1000) - _this.hashrateWindow) | 0).toString();
    commands.push(['zremrangebyscore', `${ _this.pool }:rounds:${ blockType }:current:shared:hashrate`, 0, `(${ windowTime }`]);
    commands.push(['zremrangebyscore', `${ _this.pool }:rounds:${ blockType }:current:solo:hashrate`, 0, `(${ windowTime }`]);
    callback(commands);
  };

  // Get Historical Information from Redis
  this.handleHistoricalInfo = function(blockType, callback, handler) {
    const windowTime = (((Date.now() / 1000) - _this.hashrateWindow) | 0).toString();
    const windowHistorical = (((Date.now() / 1000) - _this.historicalWindow) | 0).toString();
    const historicalLookups = [
      ['hgetall', `${ _this.pool }:statistics:${ blockType }:network`],
      ['zrangebyscore', `${ _this.pool }:rounds:${ blockType }:current:shared:hashrate`, windowTime, '+inf'],
      ['zrangebyscore', `${ _this.pool }:rounds:${ blockType }:current:solo:hashrate`, windowTime, '+inf'],
      ['zremrangebyscore', `${ _this.pool }:rounds:${ blockType }:current:shared:hashrate`, 0, `(${ windowHistorical }`]];
    _this.executeCommands(historicalLookups, (results) => {
      const commands = _this.calculateHistoricalInfo(results, blockType);
      callback(commands);
    }, handler);
  };

  // Get Mining Statistics from Daemon
  this.handleMiningInfo = function(daemon, blockType, callback, handler) {
    const commands = [];
    daemon.cmd('getmininginfo', [], (result) => {
      if (result[0].error) {
        logger.error('Statistics', _this.pool, `Error with statistics daemon: ${ JSON.stringify(result[0].error) }`);
        handler(result[0].error);
      } else {
        const data = result[0].response;
        commands.push(['hset', `${ _this.pool }:statistics:${ blockType }:network`, 'difficulty', data.difficulty]);
        commands.push(['hset', `${ _this.pool }:statistics:${ blockType }:network`, 'hashrate', data.networkhashps]);
        commands.push(['hset', `${ _this.pool }:statistics:${ blockType }:network`, 'height', data.blocks]);
        callback(commands);
      }
    });
  };

  // Handle Payments Information in Redis
  this.handlePaymentsInfo = function(blockType, callback) {
    const commands = [];
    const windowPayments = (((Date.now() / 1000) - _this.paymentsWindow) | 0).toString();
    commands.push(['zremrangebyscore', `${ _this.pool }:payments:${ blockType }:records`, 0, `(${ windowPayments }`]);
    callback(commands);
  };

  // Execute Redis Commands
  /* istanbul ignore next */
  this.executeCommands = function(commands, callback, handler) {
    _this.client.multi(commands).exec((error, results) => {
      if (error) {
        logger.error(logSystem, logComponent, logSubCat, `Error with redis statistics processing ${ JSON.stringify(error) }`);
        handler(error);
      } else {
        callback(results);
      }
    });
  };

  // Start Interval Initialization
  /* istanbul ignore next */
  this.handleIntervals = function(daemon, blockType) {

    // Handle Hashrate Data Interval
    setInterval(() => {
      _this.handleHashrateInfo(blockType, (results) => {
        _this.executeCommands(results, () => {
          if (_this.poolConfig.debug) {
            logger.debug('Statistics', _this.pool, `Finished updating hashrate statistics for ${ blockType } configuration.`);
          }
        }, () => {});
      });
    }, _this.hashrateInterval * 1000);

    // Handle Historical Data Interval
    setInterval(() => {
      _this.handleHistoricalInfo(blockType, (results) => {
        _this.executeCommands(results, () => {
          if (_this.poolConfig.debug) {
            logger.debug('Statistics', _this.pool, `Finished updating historical statistics for ${ blockType } configuration.`);
          }
        }, () => {});
      }, () => {});
    }, _this.historicalInterval * 1000);

    // Handle Mining Info Interval
    setInterval(() => {
      _this.handleMiningInfo(daemon, blockType, (results) => {
        _this.executeCommands(results, () => {
          if (_this.poolConfig.debug) {
            logger.debug('Statistics', _this.pool, `Finished updating network statistics for ${ blockType } configuration.`);
          }
        }, () => {});
      }, () => {});
    }, _this.refreshInterval * 1000);

    // Handle Payment Info Interval
    setInterval(() => {
      _this.handlePaymentsInfo(blockType, (results) => {
        _this.executeCommands(results, () => {
          if (_this.poolConfig.debug) {
            logger.debug('Statistics', _this.pool, `Finished updating payments statistics for ${ blockType } configuration.`);
          }
        }, () => {});
      }, () => {});
    }, _this.paymentsInterval * 1000);
  };

  // Start Interval Initialization
  /* istanbul ignore next */
  this.setupStatistics = function(poolStratum) {
    if (poolStratum.primary.daemon) {
      _this.handleIntervals(poolStratum.primary.daemon, 'primary');
      if (_this.poolConfig.auxiliary && _this.poolConfig.auxiliary.enabled && poolStratum.auxiliary.daemon) {
        _this.handleIntervals(poolStratum.auxiliary.daemon, 'auxiliary');
      }
    }
  };
};

module.exports = PoolStatistics;
