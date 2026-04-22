const createReasoningWorker = (): Worker =>
  new Worker(new URL('../workers/reasoningWorker.ts', import.meta.url), { type: 'module' });

export default createReasoningWorker;
