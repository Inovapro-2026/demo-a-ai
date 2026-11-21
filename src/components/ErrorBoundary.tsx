import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMessage = error.message || 'Ocorreu um erro inesperado.';
    try {
      const parsed = JSON.parse(displayMessage) as { error?: string; operationType?: string };
      if (parsed && parsed.error) {
        displayMessage = `Erro de acesso aos dados (${parsed.operationType || 'operação'}): ${parsed.error}`;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, message: displayMessage };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
          <div className="max-w-md w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl font-bold text-neutral-900">
              Algo não saiu como esperado
            </h2>
            <p className="mt-2 text-sm text-neutral-700 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 w-full rounded-xl bg-[#4A1230] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 transition"
            >
              Recarregar aplicação
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
