// TODO: Move this file to a shared library with the Stacks API

import { logger } from './logger';

const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

type ShutdownHandler = () => void | PromiseLike<void>;
type ShutdownConfig = {
  name: string;
  handler: ShutdownHandler;
  forceKillable: boolean;
  forceKillHandler?: ShutdownHandler;
};

const shutdownConfigs: ShutdownConfig[] = [];

let isShuttingDown = false;

/**
 * Set an execution time limit for a promise.
 * @param promise - The promise being capped to `timeoutMs` max execution time
 * @param timeoutMs - Timeout limit in milliseconds
 * @param wait - If we should wait another `timeoutMs` period for `promise` to resolve
 * @param waitHandler - If `wait` is `true`, this closure will be executed before waiting another `timeoutMs` cycle
 * @returns `true` if `promise` ended gracefully, `false` if timeout was reached
 */
export async function resolveOrTimeout(
  promise: Promise<void>,
  timeoutMs: number,
  wait: boolean = false,
  waitHandler?: () => void
) {
  let timer: NodeJS.Timeout;
  const result = await Promise.race([
    new Promise((resolve, reject) => {
      promise
        .then(() => resolve(true))
        .catch(error => reject(error))
        .finally(() => clearTimeout(timer));
    }),
    new Promise((resolve, _) => {
      timer = setInterval(() => {
        if (!wait) {
          clearTimeout(timer);
          resolve(false);
          return;
        }
        if (waitHandler) {
          waitHandler();
        }
      }, timeoutMs);
    }),
  ]);
  return result;
}

async function startShutdown() {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  const timeoutMs = parseInt(process.env['STACKS_SHUTDOWN_FORCE_KILL_TIMEOUT'] ?? '60') * 1000;
  let errorEncountered = false;
  for (const config of shutdownConfigs) {
    try {
      logger.info(`Closing ${config.name}...`);
      const gracefulShutdown = await resolveOrTimeout(
        Promise.resolve(config.handler()),
        timeoutMs,
        !config.forceKillable,
        () =>
          logger.error(
            `${config.name} is taking longer than expected to shutdown, possibly hanging indefinitely`
          )
      );
      if (!gracefulShutdown) {
        if (config.forceKillable && config.forceKillHandler) {
          await Promise.resolve(config.forceKillHandler());
        }
        logger.error(
          `${config.name} was force killed after taking longer than ${timeoutMs}ms to shutdown`
        );
      } else {
        logger.info(`${config.name} closed`);
      }
    } catch (error) {
      errorEncountered = true;
      logger.error(error, `Error running ${config.name} shutdown handler`);
    }
  }
  if (errorEncountered) {
    process.exit(1);
  } else {
    logger.info('App shutdown successful.');
    process.exit();
  }
}

let shutdownSignalsRegistered = false;
function registerShutdownSignals() {
  if (shutdownSignalsRegistered) {
    return;
  }
  shutdownSignalsRegistered = true;

  SHUTDOWN_SIGNALS.forEach(sig => {
    process.once(sig, () => {
      logger.info(`Shutting down... received signal: ${sig}`);
      void startShutdown();
    });
  });
  process.once('unhandledRejection', error => {
    logger.error(error, 'unhandledRejection');
    logger.error('Shutting down... received unhandledRejection.');
    void startShutdown();
  });
  process.once('uncaughtException', error => {
    logger.error(error, 'uncaughtException');
    logger.error('Shutting down... received uncaughtException.');
    void startShutdown();
  });
  process.once('beforeExit', () => {
    logger.error('Shutting down... received beforeExit.');
    void startShutdown();
  });
}

export function registerShutdownConfig(...configs: ShutdownConfig[]) {
  registerShutdownSignals();
  shutdownConfigs.push(...configs);
}
