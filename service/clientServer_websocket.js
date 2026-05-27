const WebSocket = require('ws');
const { EventEmitter } = require('events');
const { processCommand } = require('./functions');
const path = require('path');

class ClientServerWebSocket extends EventEmitter {
    constructor(fsData, api) {
        super();

        this.settings = fsData;
        this.server = api;

        this.socket = null;
        this.enabled = true;

        this.ndpiServerIp = fsData.get('ndpi_command_server_host') || null;
        this.ndpiServerPort = fsData.get('ndpi_command_server_port') || null;

        this.reconnectTimer = null;

        if (this.ndpiServerIp && this.ndpiServerPort)
            { this.connect() }
    }
    connect() {
        if (!this.ndpiServerIp || this.ndpiServerIp.includes('localhost'))
        {
            this.scheduleReconnect();
            return;
        }

        this.enabled = true;
        
        // Clean up existing connection
        if (this.socket)
        {
            try { this.socket.close(); } catch {}
            this.socket = null;
        }

        if (this.reconnectTimer)
        {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        console.info(`[ ${path.basename(__filename).split('.')[0]} ] Connecting`);
        try
        {
            const wsUrl = `ws://${this.ndpiServerIp}:${this.ndpiServerPort}/ws/client`;
            this.socket = new WebSocket(wsUrl);
        }
        catch (error)
        {
            console.error(`🔴 [ ${path.basename(__filename).split('.')[0]} ] Connection Failed`, error);
            this.scheduleReconnect();
        }
            
        this.socket.on('open', () => {
            console.info(`[ ${path.basename(__filename).split('.')[0]} ] Connected NDPi Server`);
            this.server.broadcastToDisplay({ type: 'ndpi-server-connected' }, true);
            this.emit('connected');
        });
        
        this.socket.on('message', (data) => {
            try
            {
                const message = JSON.parse(data);
                console.info(`[ ${path.basename(__filename).split('.')[0]} ][ Message ] NDPi Server: Message:`, message);
                processCommand(message);
            }
            catch (error)
            {
                console.error(`🔴 [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] NDPi Server: Message:`, data);
                console.error(`🔴 [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] NDPi Server: Error:`, error);
            }
        });
        
        this.socket.on('error', (error) => {
            console.error(`🔴 [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] NDPi Server Connection`, error);
        });
        
        this.socket.on('close', () => {
            console.info(`🔴 [ ${path.basename(__filename).split('.')[0]} ] NDPi Server Disconnected`);
            this.scheduleReconnect();
        });
    }

    close() {
        console.info(
            `[ ${path.basename(__filename)} ]`,
            'Closing Module'
        );
        this.enabled = false;
        try {
            this.socket.close()
        }
        catch {}
        finally {
            this.socket = null;
        }
        console.info(
            `[ ${path.basename(__filename)} ]`,
            'Module Exited'
        );

        // if (this.socket)
        // {
        //     if (this.socket.readyState === WebSocket.OPEN)
        //     { this.socket.close(); }
        // }
        
        // this.socket = null;
    }

    scheduleReconnect(ms = 5000) {
        if (this.reconnectTimer)
        {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.enabled)
        {
            this.reconnectTimer = setTimeout(() => {
                if (this.enabled)
                    { this.connect() }
                this.reconnectTimer = null;
            }, ms);
        }
    }

    send(message = {}) {
        if (!this.enabled)
            { return }
        if (!message.type)
            {
                console.error(`🔴 [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] Missing 'message.type'. Message:`, message);
                return;
            }
        if (this.socket && this.socket.readyState <= 1)
            { this.socket.send(JSON.stringify(message)) }
        else
            { console.error(`🔴 [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] Unable to send message.`) }
    }

}

module.exports = ClientServerWebSocket;