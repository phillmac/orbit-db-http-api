#!/usr/bin/env node

const fs        = require('fs');
const {docopt}  = require('docopt');
const version   = require('../package.json').version;
const Logger    = require('js-logger')
const merge     = require('lodash/merge')



Logger.useDefaults({
    defaultLevel: Logger.TRACE,
    formatter: function (messages, _context) {
        d = new Date()
        messages.unshift(`${d.toLocaleDateString()} ${d.toLocaleTimeString()}`)
    }
});


class Cli {
    constructor() {
        const doc =
`
OrbitDb HTTP API v${version}

Usage:
    cli.js local [--ipfs-dht] [options]
    cli.js api  [--ipfs-host=IPFS_HOST] [--ipfs-port=IPFS_PORT] [options]
    cli.js -h | --help | --version

Options:
    --debug                         Enable api debug response on error
    --https-port=HTTPS_PORT             Listen for api calls on API_PORT
    --orbitdb-dir=ORBITDB_DIR       Store orbit-db files in ORBITDB_DIR
    --config=CONFIG                 Load orbit-db conf options from ORBITDB_CONF
    --https-cert=HTTPS_CERT         Path to https cert
    --https-key=HTTPS_KEY           Path to https cert key
    --announce-dbs=ANNOUNCE_DBS     Announce dbs to dht (requires --ipfs-dht in local mode)
`;
        this._args = docopt(doc, {
            'version': version
        });

    }

    get args () {
        return this._args;
    }
}

async function init () {

    let options
    let orbitDBAPI


    try {
        const cli         = new Cli();
        const args        = cli.args;
        const config      = args['--conf'] || process.env.CONFIG_FILE;

        if (config) {
            fs.readFile(config, 'utf8', function (err, data) {
                if (err) throw err;
                options = JSON.parse(data);
            });
        }

        const ipfsMode    = (args['api'] && 'api')  || (args['local'] && 'local');
        const orbitDBDir  = args['--orbitdb-dir']   || process.env.ORBITDB_DIR;
        const httpsPort   = args['--https-port']    || process.env.HTTPS_PORT;
        const certFile    = args['--https-cert']    || process.env.HTTPS_CERT;
        const certKeyFile = args['--https-key']     || process.env.HTTPS_KEY;
        const ipfsHost    = args['--ipfs-host']     || process.env.IPFS_HOST;
        const ipfsPort    = args['--ipfs-port']     || process.env.IPFS_PORT;
        const ipfsDHT     = args['--ipfs-dht']      || process.env.IPFS_DHT;
        const apiDebug    = args['--debug']         || process.env.API_DEBUG;
        const dbAnnounce  = args['--announce-dbs']  || process.env.ANNOUNCE_DBS;

        const cliOptions = {
            ipfs: {
                host: ipfsHost,
                port: ipfsPort,
                libp2p: {
                    config: {
                      dht: {
                        enabled: Boolean(ipfsDHT)
                      }
                    }
                }
            },
            orbitDB: {
                directory: orbitDBDir
            },
            orbitDBAPI: {
                apiDebug: Boolean(apiDebug)
            },
            peerMan: {
                dhtEnabled: Boolean(ipfsDHT),
                ipfsMode: ipfsMode,
                dbAnnounce: ( ipfsMode == 'api' || (ipfsMode == 'local' && ipfsDHT )) && Boolean(dbAnnounce)
            },
            server: {
                httpsPort: httpsPort,
                http2: {
                    certKeyFile: certKeyFile,
                    certFile: certFile
                }
            }
        }

        options = merge(options || {}, cliOptions)

        if (!options.server.http2.certFile) throw new Error('--https-cert is required');
        if (!options.server.http2.certKeyFile) throw new Error('--https-key is required');
        if (!options.server.httpsPort) options.server.httpsPort = 3000
        if (dbAnnounce && ipfsMode == 'local' && (!ipfsDHT)) {
            Logger.warn('DB announcing disabled due to IPFS DHT not enabled')
        }

        Logger.debug(`Options: ${JSON.stringify(options, null, 4)}`)

        options = merge(options, {
            server: {
                http2: {
                    key: fs.readFileSync(options.server.http2.certKeyFile),
                    cert: fs.readFileSync(options.server.http2.certFile)
                }
            }
        })

        switch(ipfsMode){
            case 'local':
                const localApiFactory = require('./factory/ipfs-local.js').default;
                orbitDBAPI = await localApiFactory(options)
                break;

            case 'api':
                const remoteApiFactory = require('./factory/ipfs-api.js');
                if (!options.ipfs.host) throw new Error ('--ipfs-host is required');
                if (!options.ipfs.port) options.ipfs.port = 5001
                orbitDBAPI = await remoteApiFactory(options)
                break;

            default:
                throw new Error("Unrecognised ipfs type. Please specify either 'api' or 'local'");
        }

        await orbitDBAPI.server.start()
        Logger.info(`Server running on port ${options.server.httpsPort}`);

    } catch(err) {
        Logger.error(err);
        process.exit(1);
    }
}

init()
