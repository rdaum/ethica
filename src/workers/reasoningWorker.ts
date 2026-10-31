import { analyzeElement, loadGraph } from '../lib/analysis';
import { AnalysisRequest, AnalysisResponse } from '../lib/analysisClient';

const send = (message: AnalysisResponse) => postMessage(message);

globalThis.onmessage = async (event: MessageEvent<AnalysisRequest>) => {
  const message = event.data;

  try {
    if (message.type === 'loadGraph') {
      await loadGraph(message.n3Content);
      send({ type: 'graphLoaded', requestId: message.requestId });
      return;
    }

    send({ type: 'analysis', requestId: message.requestId, result: analyzeElement(message.elementId) });
  } catch (error) {
    send({
      type: 'error',
      requestId: message.requestId,
      message: error instanceof Error ? error.message : 'Unknown worker error'
    });
  }
};

export {};
