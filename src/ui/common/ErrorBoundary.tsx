import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/** Aísla fallos de una parte de la interfaz (p. ej. WebGL no disponible). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // El fallback ya informa al usuario; no se envía nada a ningún servicio externo.
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
