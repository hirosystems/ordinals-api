export function timeout(ms: number, abortController?: AbortController): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      resolve();
    }, ms);
    abortController?.signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new Error(`Timeout aborted`));
      },
      { once: true }
    );
  });
}

export interface Stopwatch {
  /** Milliseconds since stopwatch was created. */
  getElapsed: () => number;
  /** Seconds since stopwatch was created. */
  getElapsedSeconds: () => number;
  getElapsedAndRestart: () => number;
  restart(): void;
}

export function stopwatch(): Stopwatch {
  let start = process.hrtime.bigint();
  const result: Stopwatch = {
    getElapsedSeconds: () => {
      const elapsedMs = result.getElapsed();
      return elapsedMs / 1000;
    },
    getElapsed: () => {
      const end = process.hrtime.bigint();
      return Number((end - start) / 1_000_000n);
    },
    getElapsedAndRestart: () => {
      const end = process.hrtime.bigint();
      const result = Number((end - start) / 1_000_000n);
      start = process.hrtime.bigint();
      return result;
    },
    restart: () => {
      start = process.hrtime.bigint();
    },
  };
  return result;
}
