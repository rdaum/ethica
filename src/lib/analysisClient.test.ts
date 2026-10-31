import { vi } from 'vitest';
import { AnalysisRequest, createAnalysisClient } from './analysisClient';
import { ReasoningAnalysis } from '../types';

const result: ReasoningAnalysis = { reasoning: [], transitiveChains: [], weightAnalysis: null };

class ScriptedWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminated = false;
  received: AnalysisRequest[] = [];

  postMessage(message: AnalysisRequest) {
    this.received.push(message);
    queueMicrotask(() => {
      const data =
        message.type === 'loadGraph'
          ? { type: 'graphLoaded', requestId: message.requestId }
          : { type: 'analysis', requestId: message.requestId, result };
      this.onmessage?.({ data });
    });
  }

  terminate() {
    this.terminated = true;
  }
}

const setup = (fetchGraph = vi.fn(async () => 'graph')) => {
  const workers: ScriptedWorker[] = [];
  const createWorker = vi.fn(() => {
    const worker = new ScriptedWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  });

  return { client: createAnalysisClient(createWorker, fetchGraph), workers, fetchGraph };
};

describe('createAnalysisClient', () => {
  test('loads the graph only once across analyses', async () => {
    const { client, workers, fetchGraph } = setup();

    await client.analyze('I.def.1');
    await client.analyze('II.def.1');

    expect(fetchGraph).toHaveBeenCalledTimes(1);
    expect(workers).toHaveLength(1);
    expect(workers[0].received.map(message => message.type)).toEqual(['loadGraph', 'analyze', 'analyze']);
  });

  test('preload does not report a failure, and the next analysis retries', async () => {
    const fetchGraph = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('graph');
    const { client } = setup(fetchGraph);

    client.preload();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve));

    await expect(client.analyze('I.def.1')).resolves.toEqual(result);
    expect(fetchGraph).toHaveBeenCalledTimes(2);
  });

  test('a failed graph fetch rejects, and a retry succeeds', async () => {
    const fetchGraph = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('graph');
    const { client } = setup(fetchGraph);

    await expect(client.analyze('I.def.1')).rejects.toThrow('offline');
    await expect(client.analyze('I.def.1')).resolves.toEqual(result);
  });

  test('a worker crash rejects pending work and the next request starts a new worker', async () => {
    const { client, workers } = setup();
    await client.analyze('I.def.1');

    const first = workers[0];
    first.postMessage = () => {};
    const pending = client.analyze('I.def.2');
    await Promise.resolve();
    await Promise.resolve();
    first.onerror?.({ message: 'boom' });

    await expect(pending).rejects.toThrow('boom');
    expect(first.terminated).toBe(true);

    await expect(client.analyze('I.def.3')).resolves.toEqual(result);
    expect(workers).toHaveLength(2);
  });

  test('a worker error for one request leaves the worker running', async () => {
    const { client, workers } = setup();
    await client.analyze('I.def.1');

    const worker = workers[0];
    const original = worker.postMessage.bind(worker);
    worker.postMessage = message => {
      queueMicrotask(() => worker.onmessage?.({ data: { type: 'error', requestId: message.requestId, message: 'bad id' } }));
    };

    await expect(client.analyze('nope')).rejects.toThrow('bad id');
    worker.postMessage = original;
    await expect(client.analyze('I.def.2')).resolves.toEqual(result);
    expect(workers).toHaveLength(1);
  });
});
