const WebSocket = require('ws');
const { EventEmitter } = require('events');
const { processCommand } = require('./functions');

class ClientServerWebSocket extends EventEmitter {
    constructor(fsData, api) {
        super();

        this.settings = fsData;
        this.server = api;

        this.socket = null;
        this.enabled = true;

        this.ndpiServerIp = fsData.get('ndpi_command_server_host') || null;
        this.ndpiServerPort = fsData.get('ndpi_command_server_port') || null;

        fsData.on('ndpi_command_server_host', (data) => {
            const newIp = String(data || 'localhost');
            if (newIp !== 'localhost' && newIp !== this.ndpiServerIp) {
                this.ndpiServerIp = newIp;
                this.close();
                this.connect();
            }
        });
        fsData.on('ndpi_command_server_port', (data) => {
            const newPort = data;
            if (newPort && newPort !== this.ndpiServerPort) {
                this.ndpiServerPort = newPort;
                this.close();
                this.connect();
            }
        });

        this.reconnectTimer = null;

        if (this.ndpiServerIp && this.ndpiServerPort) {
            this.connect();
        }
    }
    connect() {
        if (!this.ndpiServerIp || this.ndpiServerIp.includes('localhost')) {
            this.scheduleReconnect();
            return;
        }

        this.enabled = true;
        
        // Clean up existing connection
        if (this.socket) {
            try { this.socket.close(); } catch {}
            this.socket = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        console.log('[ clientServer_websocket ] Connecting');
        try {
            const wsUrl = `ws://${this.ndpiServerIp}:${this.ndpiServerPort}/ws/client`;
            this.socket = new WebSocket(wsUrl);
        } catch (error) {
            console.log('[ clientServer_websocket ] Connection Failed', error);
            this.scheduleReconnect();
        }
            
        this.socket.on('open', () => {
            console.log(`[ clientServer_websocket ] Connected NDPi Server`);
            this.server.broadcastToDisplay({ type: 'ndpi-server-connected' });
            this.emit('connected');
        });
        
        this.socket.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                console.log('[ clientServer_websocket ][ Message ] NDPi Server: Message:', message);
                processCommand(message);
            } catch (error) {
                console.log('[ clientServer_websocket ][ Error ] NDPi Server: Message:', data);
                console.log('[ clientServer_websocket ][ Error ] NDPi Server: Error:', error);
            }
        });
        
        this.socket.on('error', (error) => {
            console.log('[ clientServer_websocket ] NDPi Server Connection Error', error);
        });
        
        this.socket.on('close', () => {
            console.log('[ clientServer_websocket ] NDPi Server Disconnected');
            this.scheduleReconnect();
        });
    }

    close() {
        this.enabled = false;
        if (this.socket) {
            if (this.socket.readyState <= 1) this.socket.close();
        }
        this.socket = null;
    }

    scheduleReconnect(ms = 5000) {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.enabled) {
            this.reconnectTimer = setTimeout(() => {
                if (this.enabled) this.connect();
                this.reconnectTimer = null;
            }, ms);
        }
    }

    send(message = {}) {
        if (!this.enabled) return;
        if (!message.type) {
            console.log("[ clientServer_websocket ][ Error ] Missing 'message.type'. Message:", message);
            return;
        }
        if (this.socket && this.socket.readyState <= 1) {
            this.socket.send(JSON.stringify(message));
        } else {
            console.log("[ clientServer_websocket ][ Error ] Unable to send message.");
        }
    }

}

module.exports = ClientServerWebSocket;