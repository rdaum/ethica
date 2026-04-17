import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the loading state before data is fetched', () => {
  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
    () => new Promise(() => {}) as Promise<Response>
  );
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  render(<App />);
  expect(screen.getByText(/loading spinoza's ethics/i)).toBeInTheDocument();
  expect(screen.getByText(/preparing the text, structure, and inference graph for reading/i)).toBeInTheDocument();

  fetchSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});
