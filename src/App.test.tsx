import { render, screen } from '@testing-library/react';
import createReasoningWorker from './lib/createReasoningWorker';
import App from './App';

jest.mock('./lib/createReasoningWorker', () => ({
  __esModule: true,
  default: jest.fn()
}));

test('renders the loading state before data is fetched', () => {
  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
    () => new Promise(() => {}) as Promise<Response>
  );
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  (createReasoningWorker as jest.Mock).mockReturnValue({
    terminate: jest.fn(),
    postMessage: jest.fn()
  });

  render(<App />);
  expect(screen.getByText(/loading spinoza's ethics/i)).toBeInTheDocument();
  expect(screen.getByText(/preparing the text, structure, and inference graph for reading/i)).toBeInTheDocument();

  fetchSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});
