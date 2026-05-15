const NDPiClient                    = require('./service/NDPiClient.js');
const CecController                 = require('./service/client_cec.js');
const SystemConfigurationManager    = require('./service/client_fs.js');

const { exec }                      = require('child_process');

class NDPi_Monitor_Client_Main {
    constructor() {
        this.client = null;
        this.cec = null;
        this.system = null;
    }

    init() {
        this._initializeSystem();
    }

    _initializeSystem() {
        this.system = new SystemConfigurationManager();
        this.system.init();
        this.system.on('data-loaded', () => {
            this._initializeCec();
        });
    }

    _initializeCec() {
        this.cec = new CecController();
        this.cec.on('ready', () => {
            this._initializeClient();
        });
    }

    _initializeClient() {
        this.client = new NDPiClient(this.system, this.cec);
        this.client.start();
    }
}

const CRLFArray = string => string.split(/\r?\n/);

async function startClient() {
    const main = new NDPi_Monitor_Client_Main();
    await new Promise((resolve) => {
        const startup = exec(`./sh/startup`);
        startup.stdout.on('data', (data) => {
            parseNewLine(data).forEach((line) => {
                console.log(line);
            });
        });
        startup.on('exit', () => {
            resolve();
        })
    });
    main.init();

    function parseNewLine(stdin) { return String(stdin).split(/\r?\n/); }
}

startClient();