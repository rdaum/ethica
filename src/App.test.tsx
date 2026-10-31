import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import createReasoningWorker from './lib/createReasoningWorker';
import App from './App';
import { PassageAnalysis } from './types';

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
      analyses?: Record<string, PassageAnalysis>;
      loadDelayMs?: number;
      analysisDelayMs?: number;
    } = {}
  ) {}

  postMessage(message: WorkerRequest) {
    if (message.type === 'loadGraph') {
      window.setTimeout(() => {
        this.onmessage?.({
          data: {
            type: 'graphLoaded',
            requestId: message.requestId
          }
        } as MessageEvent<WorkerResponse>);
      }, this.config.loadDelayMs ?? 0);
      return;
    }

    const result = this.config.analyses?.[message.elementId] ?? analysisWith();

    window.setTimeout(() => {
      this.onmessage?.({
        data: {
          type: 'analysis',
          requestId: message.requestId,
          result
        }
      } as MessageEvent<WorkerResponse>);
    }, this.config.analysisDelayMs ?? 0);
  }

  terminate() {}
}

type WorkerRequest =
  | {
      type: 'loadGraph';
      requestId: number;
      n3Content: string;
    }
  | {
      type: 'analyze';
      requestId: number;
      elementId: string;
    };

type WorkerResponse =
  | {
      type: 'graphLoaded';
      requestId: number;
    }
  | {
      type: 'analysis';
      requestId: number;
      result: PassageAnalysis;
    }
  | {
      type: 'error';
      requestId: number;
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

    if (url.includes('ethica_fr_')) {
      return fetchResponse({ elements: {}, footnotes: {} });
    }

    if (url.includes('ethica_la_1.json')) {
      return fetchResponse({ elements: latinByPart[1] });
    }

    if (url.includes('ethica_la_2.json')) {
      return fetchResponse({ elements: latinByPart[2] });
    }

    if (url.includes('ethica-logic.n3')) {
      return fetchResponse('@prefix ethics: <http://spinoza.org/ethics#> .');
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

const analysisWith = (overrides: Partial<PassageAnalysis> = {}): PassageAnalysis => ({
  dependsOn: [],
  usedBy: [],
  cites: [],
  citedBy: [],
  structure: { parent: null, proofs: [], corollaries: [], notes: [] },
  dependencyPaths: [],
  dependentPaths: [],
  metrics: { cites: 0, citedBy: 0, totalDependencies: 0, totalDependents: 0, depth: 0 },
  ...overrides
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

  await waitFor(() => expect(document.querySelector('.panel-id')?.textContent).toBe('I.prop.1.proof'));
  expect(document.querySelector('[data-element-id="I.prop.1.proof"]')).toHaveClass('selected');
  expect(window.location.hash).toBe('#I.prop.1.proof');
});

test('shows analysis loading before rendering worker results for a selected passage', async () => {
  installFetchMock();
  buildWorker({
    analysisDelayMs: 25,
    analyses: {
      'I.def.1': analysisWith({ usedBy: ['I.prop.1'] })
    }
  });

  render(<App />);

  expect(await screen.findByRole('heading', { name: 'The Ethics' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Definition I'));

  expect(screen.getByText(/tracing relations and dependencies/i)).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'I, Prop. I' })).toBeInTheDocument();
});

test('navigates across parts from a relationship chip in the analysis panel', async () => {
  installFetchMock();
  buildWorker({
    analyses: {
      'I.prop.1': analysisWith({ dependsOn: ['II.prop.1'] })
    }
  });

  render(<App />);

  expect(await screen.findByRole('heading', { name: 'The Ethics' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Proposition I'));

  const crossPartLink = await screen.findByRole('button', { name: 'II, Prop. I' });
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

test('shows a retry when a part fails to load, and recovers', async () => {
  const fetchSpy = installFetchMock();
  const respond = fetchSpy.getMockImplementation()!;
  let failing = true;
  fetchSpy.mockImplementation((input: RequestInfo | URL) =>
    failing && String(input).includes('ethica_1.xml')
      ? Promise.resolve({ ok: false, status: 500 } as Response)
      : respond(input)
  );
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  buildWorker();

  render(<App />);

  expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);

  failing = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('Definition I')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  consoleErrorSpy.mockRestore();
});

test('shows a retry when analysis fails, rather than an empty result', async () => {
  installFetchMock();
  const worker = buildWorker();
  const post = worker.postMessage.bind(worker);
  let failing = true;
  worker.postMessage = (message: WorkerRequest) => {
    if (message.type === 'analyze' && failing) {
      window.setTimeout(() => {
        worker.onmessage?.({
          data: { type: 'error', requestId: message.requestId, message: 'bad' }
        } as MessageEvent<WorkerResponse>);
      });
      return;
    }

    post(message);
  };
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  render(<App />);
  fireEvent.click(await screen.findByText('Definition I'));

  expect(await screen.findByRole('alert')).toHaveTextContent(/relationships for this passage could not be loaded/i);
  expect(screen.queryByText(/no relationships were found/i)).not.toBeInTheDocument();

  failing = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(await screen.findByText(/no relationships were found/i)).toBeInTheDocument();
  consoleErrorSpy.mockRestore();
});

test('keeps the reader in place during a part switch and ignores stale responses', async () => {
  const fetchSpy = installFetchMock();
  const respond = fetchSpy.getMockImplementation()!;
  let releasePartTwo: () => void = () => {};
  const partTwoHeld = new Promise<void>(resolve => {
    releasePartTwo = resolve;
  });
  fetchSpy.mockImplementation((input: RequestInfo | URL) =>
    String(input).includes('ethica_2.xml') ? partTwoHeld.then(() => respond(input)) : respond(input)
  );
  buildWorker();

  render(<App />);
  await screen.findByText('Definition I');

  const parts = document.querySelectorAll<HTMLButtonElement>('.part-button');
  fireEvent.click(parts[1]);

  expect(await screen.findByText('Loading Part II…')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'The Ethics' })).toBeInTheDocument();
  expect(screen.queryByText(/preparing the text/i)).not.toBeInTheDocument();

  // Switch back before Part II answers; its late response must not take over.
  fireEvent.click(parts[0]);
  expect(await screen.findByText('Definition I')).toBeInTheDocument();
  releasePartTwo();
  await new Promise(resolve => setTimeout(resolve, 10));

  expect(screen.getByText('Definition I')).toBeInTheDocument();
  expect(document.querySelector('.part-button.active')).toHaveTextContent('Part I');
});

test('fetches each part and the graph only once', async () => {
  const fetchSpy = installFetchMock();
  buildWorker();

  render(<App />);
  await screen.findByText('Definition I');

  const parts = document.querySelectorAll<HTMLButtonElement>('.part-button');
  fireEvent.click(parts[1]);
  await waitFor(() => expect(document.querySelector('[data-element-id="II.prop.1"]')).toBeInTheDocument());
  fireEvent.click(parts[0]);
  await waitFor(() => expect(document.querySelector('[data-element-id="I.def.1"]')).toBeInTheDocument());

  const calls = fetchSpy.mock.calls.map(([input]) => String(input));
  expect(calls.filter(url => url.includes('ethica_1.xml'))).toHaveLength(1);
  expect(calls.filter(url => url.includes('ethica-logic.n3'))).toHaveLength(1);
  expect(calls.some(url => url.includes('eye'))).toBe(false);
});
