import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import createReasoningWorker from './lib/createReasoningWorker';
import App from './App';
import { ReasoningAnalysis } from './types';

vi.mock('./lib/createReasoningWorker', () => ({
  __esModule: true,
  default: vi.fn()
}));

const mockCreateReasoningWorker = vi.mocked(createReasoningWorker);

class FakeWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor(
    private readonly config: {
      analyses?: Record<string, ReasoningAnalysis>;
      loadDelayMs?: number;
      analysisDelayMs?: number;
    } = {}
  ) {}

  postMessage(message: WorkerRequest) {
    if (message.type === 'loadPart') {
      window.setTimeout(() => {
        this.onmessage?.({
          data: {
            type: 'partLoaded',
            requestId: message.requestId
          }
        } as MessageEvent<WorkerResponse>);
      }, this.config.loadDelayMs ?? 0);
      return;
    }

    const result = this.config.analyses?.[message.elementId] ?? emptyAnalysis(message.elementId);

    window.setTimeout(() => {
      this.onmessage?.({
        data: {
          type: 'analysis',
          requestId: message.requestId,
          elementId: message.elementId,
          result
        }
      } as MessageEvent<WorkerResponse>);
    }, this.config.analysisDelayMs ?? 0);
  }

  terminate() {}
}

type WorkerRequest =
  | {
      type: 'loadPart';
      requestId: number;
      elements: unknown[];
      n3Content: string;
      eyeContent: string;
    }
  | {
      type: 'analyze';
      requestId: number;
      elementId: string;
    };

type WorkerResponse =
  | {
      type: 'partLoaded';
      requestId: number;
    }
  | {
      type: 'analysis';
      requestId: number;
      elementId: string;
      result: ReasoningAnalysis;
    }
  | {
      type: 'error';
      requestId: number;
      stage: 'loadPart' | 'analyze';
      message: string;
    };

const partOneXml = `<?xml version="1.0" encoding="UTF-8"?>
<part id="I" number="1" title="CONCERNING GOD">
  <section type="definitions" id="I.definitions">
    <def id="I.def.1" number="1">
      <text>By cause of itself, I understand that whose essence involves existence.</text>
    </def>
  </section>
  <section type="propositions" id="I.propositions">
    <prop id="I.prop.1" number="1">
      <text>Substance is by nature prior to its modifications.</text>
      <proof id="I.prop.1.proof">
        <text>This follows from the definition of substance.</text>
      </proof>
    </prop>
  </section>
</part>`;

const partTwoXml = `<?xml version="1.0" encoding="UTF-8"?>
<part id="II" number="2" title="ON THE NATURE AND ORIGIN OF THE MIND">
  <section type="propositions" id="II.propositions">
    <prop id="II.prop.1" number="1">
      <text>The human mind is the idea of the human body.</text>
    </prop>
  </section>
</part>`;

const latinByPart: Record<number, Record<string, string>> = {
  1: {
    'I.def.1': 'Per causam sui intelligo id, cuius essentia involvit existentiam.',
    'I.prop.1': 'Substantia prior est natura suis affectionibus.',
    'I.prop.1.proof': 'Ex definitione substantiae sequitur.'
  },
  2: {
    'II.prop.1': 'Mens humana est idea corporis humani.'
  }
};

const fetchResponse = (body: string | object): Promise<Response> =>
  Promise.resolve({
    ok: true,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body
  } as Response);

const installFetchMock = () =>
  vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('ethica_1.xml')) {
      return fetchResponse(partOneXml);
    }

    if (url.includes('ethica_2.xml')) {
      return fetchResponse(partTwoXml);
    }

    if (url.includes('ethica_la_1.json')) {
      return fetchResponse({ elements: latinByPart[1] });
    }

    if (url.includes('ethica_la_2.json')) {
      return fetchResponse({ elements: latinByPart[2] });
    }

    if (url.includes('ethica-logic.n3') || url.includes('ethica-logic-eye.n3')) {
      return fetchResponse('@prefix ethics: <http://spinoza.org/ethics#> .');
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

const emptyAnalysis = (elementId: string): ReasoningAnalysis => ({
  reasoning: [],
  transitiveChains: [],
  weightAnalysis: {
    elementId,
    inboundWeight: 0,
    outboundWeight: 0,
    transitiveInfluence: 0,
    foundationalScore: 0,
    relationshipBreakdown: {},
    dependencyDepth: 0,
    influenceReach: 0
  }
});

const buildWorker = (config?: ConstructorParameters<typeof FakeWorker>[0]) => {
  const worker = new FakeWorker(config);
  mockCreateReasoningWorker.mockReturnValue(worker as unknown as Worker);
  return worker;
};

beforeEach(() => {
  mockCreateReasoningWorker.mockReset();
  window.history.replaceState(null, '', '/');
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: function Worker() {}
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn()
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn()
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

test('renders the loading state before data is fetched', () => {
  const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
    () => new Promise(() => {}) as Promise<Response>
  );
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  buildWorker();

  render(<App />);
  expect(screen.getByText(/loading spinoza's ethics/i)).toBeInTheDocument();
  expect(screen.getByText(/preparing the text, structure, and inference graph for reading/i)).toBeInTheDocument();

  fetchSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

test('restores a deep-linked passage from the URL hash after loading', async () => {
  installFetchMock();
  buildWorker();
  window.history.replaceState(null, '', '/#I.prop.1.proof');

  render(<App />);

  expect(await screen.findByRole('heading', { name: 'Proof' })).toBeInTheDocument();
  expect(screen.getByText('I.prop.1.proof')).toBeInTheDocument();
});

test('shows analysis loading before rendering worker results for a selected passage', async () => {
  installFetchMock();
  buildWorker({
    analysisDelayMs: 25,
    analyses: {
      'I.def.1': {
        reasoning: [
          {
            subject: 'I.def.1',
            predicate: 'cites',
            object: 'I.prop.1'
          }
        ],
        transitiveChains: [],
        weightAnalysis: {
          elementId: 'I.def.1',
          inboundWeight: 1,
          outboundWeight: 1,
          transitiveInfluence: 0,
          foundationalScore: 2,
          relationshipBreakdown: { cites: 1 },
          dependencyDepth: 0,
          influenceReach: 1
        }
      }
    }
  });

  render(<App />);

  expect(await screen.findByRole('heading', { name: 'The Ethics' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Definition I'));

  expect(screen.getByText(/tracing relations and inferred dependencies/i)).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'prop.1' })).toBeInTheDocument();
});

test('navigates across parts from a relationship chip in the analysis panel', async () => {
  installFetchMock();
  buildWorker({
    analyses: {
      'I.prop.1': {
        reasoning: [
          {
            subject: 'I.prop.1',
            predicate: 'cites',
            object: 'II.prop.1'
          }
        ],
        transitiveChains: [],
        weightAnalysis: {
          elementId: 'I.prop.1',
          inboundWeight: 0,
          outboundWeight: 1,
          transitiveInfluence: 0,
          foundationalScore: 1,
          relationshipBreakdown: { cites: 1 },
          dependencyDepth: 0,
          influenceReach: 1
        }
      },
      'II.prop.1': emptyAnalysis('II.prop.1')
    }
  });

  render(<App />);

  expect(await screen.findByRole('heading', { name: 'The Ethics' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Proposition I'));

  const crossPartLink = await screen.findByRole('button', { name: 'II.prop.1' });
  fireEvent.click(crossPartLink);

  await waitFor(() =>
    expect(
      Array.from(document.querySelectorAll<HTMLButtonElement>('.part-button')).find(button =>
        button.classList.contains('active')
      )?.textContent
    ).toContain('On the Nature and Origin of the Mind')
  );
  await waitFor(() => expect(document.querySelector('.panel-id')?.textContent).toBe('II.prop.1'));
});
