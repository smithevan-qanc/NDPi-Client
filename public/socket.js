class NDPi_WebSocket extends EventTarget {
    /**
     * Opens a WebSocket connection. Uses the 'wss' protocol while connected via 'https', and 'ws' while connected via 'http'.
     * @param {string} path - Path for the destination WebSocket connection (e.g. 'path/to/socket')
     * @param {object} options - Optional. Additional configuration settings
     * @param {string} [options.host] - Verbose logging.
     * @param {number} [options.reconnectionDelay] - Verbose logging.
     * @param {number} [options.reloadPageDelay] - Verbose logging.
     */
    
    constructor(path, options = {}) {
        super();
        this._ws = null;

        this.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.host = options.host || window.location.host;
        this.path = path || '';

        this.timerReconnect = null;
        this.reconnectDelay = options.reconnectionDelay || 3000;

        this.timerPageReload = null;
        this.reloadPageDelay = options.reloadPageDelay || 15000;

        this.connect();
    }

    connect() {
        try { this._ws.close(); }
        catch {}
        finally { this._ws = null; }

        this._ws = new WebSocket(`${this.protocol}//${this.host}/${this.path}`);

        this._ws.onopen = () => {
            console.info('NDPi Websocket Connected');
            if (this.timerReconnect)
            { window.navigation.reload(); }
        };

        this._ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this._ws.onclose = () => {
            console.info('NDPi Websocket Disconnected');
            this.reconnect();
            this._ws = null;
        }
    }

    disconnect() {
        if (this._ws && this._ws.readyState === WebSocket.OPEN)
        try { this._ws.close(); } catch {}
        this._ws = null;
    }

    reconnect() {
        try { clearTimeout(this.timerReconnect); }
        catch {}
        finally { this.timerReconnect = null; }

        this.timerReconnect = setTimeout(() => {
            this.connect();
        }, this.reconnectDelay);
    }
}