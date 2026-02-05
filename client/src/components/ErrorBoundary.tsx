import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    private handleReset = () => {
        localStorage.removeItem('chatgorithm_user');
        sessionStorage.removeItem('chatgorithm_user');
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '20px',
                    backgroundColor: '#1e1e2e',
                    color: '#cdd6f4',
                    minHeight: '100vh',
                    fontFamily: 'monospace'
                }}>
                    <h1 style={{ color: '#f38ba8' }}>⚠️ Error en la aplicación</h1>
                    <p style={{ color: '#fab387' }}>Algo salió mal. Detalles del error:</p>

                    <pre style={{
                        backgroundColor: '#313244',
                        padding: '15px',
                        borderRadius: '8px',
                        overflow: 'auto',
                        fontSize: '12px',
                        marginBottom: '20px'
                    }}>
                        {this.state.error?.toString()}
                        {'\n\n'}
                        {this.state.errorInfo?.componentStack}
                    </pre>

                    <button
                        onClick={this.handleReset}
                        style={{
                            backgroundColor: '#89b4fa',
                            color: '#1e1e2e',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        🔄 Reiniciar App (limpiar sesión)
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
