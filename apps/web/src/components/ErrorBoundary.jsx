import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            error: null,
            previousResetKey: props.resetKey,
        };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    static getDerivedStateFromProps(props, state) {
        if (props.resetKey !== state.previousResetKey) {
            return {
                error: null,
                previousResetKey: props.resetKey,
            };
        }

        return null;
    }

    componentDidCatch(error, errorInfo) {
        console.error('[app] Render failed:', error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.error) {
            const message = this.state.error instanceof Error
                ? this.state.error.message
                : 'Terjadi kesalahan tampilan.';

            return (
                <div className="rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-4 text-sm text-[#e74c3c]">
                    <p className="font-semibold text-text-main">Tampilan halaman bermasalah.</p>
                    <p className="mt-1">{message}</p>
                    <button
                        type="button"
                        className="mt-3 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent-hover"
                        onClick={this.handleReload}
                    >
                        Muat ulang aplikasi
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
