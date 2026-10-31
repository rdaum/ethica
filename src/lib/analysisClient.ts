import { PassageAnalysis } from '../types';

export type AnalysisRequest =
  | { type: 'loadGraph'; requestId: number; n3Content: string }
  | { type: 'analyze'; requestId: number; elementId: string };

export type AnalysisResponse =
  | { type: 'graphLoaded'; requestId: number }
  | { type: 'analysis'; requestId: number; result: PassageAnalysis }
  | { type: 'error'; requestId: number; message: string };

type Pending = { resolve: (value: never) => void; reject: (error: Error) => void };

/**
 * Owns the analysis worker: starts it on demand, gives it the graph once, and starts
 * over after a crash or a failed fetch so that the next request can succeed.
 */
export const createAnalysisClient = (createWorker: () => Worker, fetchGraph: () => Promise<string>) => {
  const pending = new Map<number, Pending>();
  let worker: Worker | null = null;
  let graphReady: Promise<void> | null = null;
  let requestCounter = 0;

  const failAll = (error: Error) => {
    pending.forEach(({ reject }) => reject(error));
    pending.clear();
  };

  const reset = () => {
    worker?.terminate();
    worker = null;
    graphReady = null;
  };

  const request = <T,>(message: Omit<Extract<AnalysisRequest, { type: 'loadGraph' }>, 'requestId'> | Omit<Extract<AnalysisRequest, { type: 'analyze' }>, 'requestId'>) =>
    new Promise<T>((resolve, reject) => {
      if (!worker) {
        reject(new Error('The analysis worker is not running.'));
        return;
      }

      requestCounter += 1;
      pending.set(requestCounter, { resolve: resolve as Pending['resolve'], reject });
      worker.postMessage({ ...message, requestId: requestCounter });
    });

  const startWorker = (): Worker => {
    const started = createWorker();

    started.onmessage = (event: MessageEvent<AnalysisResponse>) => {
      const message = event.data;
      const entry = pending.get(message.requestId);
      pending.delete(message.requestId);

      if (message.type === 'error') {
        entry?.reject(new Error(message.message));
      } else if (message.type === 'analysis') {
        (entry?.resolve as ((value: PassageAnalysis) => void) | undefined)?.(message.result);
      } else {
        (entry?.resolve as ((value: void) => void) | undefined)?.();
      }
    };

    started.onerror = event => {
      reset();
      failAll(new Error(event.message || 'The analysis worker crashed.'));
    };

    return started;
  };

  const ensureGraph = (): Promise<void> => {
    if (!graphReady) {
      const ready = (async () => {
        const n3Content = await fetchGraph();

        if (!worker) {
          worker = startWorker();
        }

        await request<void>({ type: 'loadGraph', n3Content });
      })();

      graphReady = ready;

      ready.catch(() => {
        if (graphReady === ready) {
          reset();
        }
      });
    }

    return graphReady;
  };

  return {
    preload: () => {
      ensureGraph().catch(() => {
        // The failure is reported when a passage is actually analyzed, which also retries.
      });
    },
    analyze: async (elementId: string): Promise<PassageAnalysis> => {
      await ensureGraph();
      return request<PassageAnalysis>({ type: 'analyze', elementId });
    },
    dispose: () => {
      reset();
      pending.clear();
    }
  };
};

export type AnalysisClient = ReturnType<typeof createAnalysisClient>;
