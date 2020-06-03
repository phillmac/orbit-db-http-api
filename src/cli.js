#!/usr/bin/env node

const fs = require('fs')
const { docopt } = require('docopt')
const version = require('../package.json').version
const Logger = require('logplease')
const localApiFactory = require('./factory/ipfs-local.js')
const remoteApiFactory = require('./factory/ipfs-api.js')
const merge = require('lodash/merge')

class Cli {
  constructor () {
    const doc =
`
OrbitDb HTTP API v${version}

Usage:
    cli.js local [--ipfs-dht] [options]
    cli.js api  [--ipfs-host=IPFS_HOST] [--ipfs-port=IPFS_PORT] [options]
    cli.js -h | --help | --version

Options:
    --debug                         Enable api debug response on error
    --api-port=API_PORT             Listen for api calls on API_PORT
    --orbitdb-dir=ORBITDB_DIR       Store orbit-db files in ORBITDB_DIR
    --config=CONFIG                 Load orbit-db conf options from ORBITDB_CONF
    --enable-tls                    Require https for connections. Enabled by default if https cert & key present
    --https-cert=HTTPS_CERT         Path to https cert
    --https-key=HTTPS_KEY           Path to https cert key
    --force-http1                   Disable HTTP2
    --allow-http1                   Enable HTTP1.X connections to api
    --announce-dbs=ANNOUNCE_DBS     Announce dbs to dht (requires --ipfs-dht in local mode)
`
    this._args = docopt(doc, {
      version: version
    })
  }

  get args () {
    return this._args
  }
}

async function init () {
  const logger = Logger.create('orbit-db-http-api')
  let options
  let orbitDBAPI

  try {
    const cli = new Cli()
    const args = cli.args
    const config = args['--conf'] || process.env.CONFIG_FILE

    if (config) {
      options = JSON.parse(fs.readFileSync(config))
    }

    const ipfsMode = (args.api && 'api') || (args.local && 'local')
    const orbitDBDir = args['--orbitdb-dir'] || process.env.ORBITDB_DIR
    const apiPort = args['--api-port'] || process.env.API_PORT
    const enableTLS = args['--enable-tls'] || process.env.ENABLE_TLS
    const certFile = args['--https-cert'] || process.env.HTTPS_CERT
    const certKeyFile = args['--https-key'] || process.env.HTTPS_KEY
    const forceHTTP1 = args['--force-http1'] || process.env.FORCE_HTTP1
    const allowHTTP1 = args['--allow-http1'] || process.env.ALLOW_HTTP1
    const ipfsHost = args['--ipfs-host'] || process.env.IPFS_HOST
    const ipfsPort = args['--ipfs-port'] || process.env.IPFS_PORT
    const ipfsDHT = args['--ipfs-dht'] || process.env.IPFS_DHT
    const apiDebug = args['--debug'] || process.env.API_DEBUG
    const announceDBs = args['--announce-dbs'] || process.env.ANNOUNCE_DBS

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
        apiDebug: Boolean(apiDebug),
        logger
      },
      peerMan: {
        dhtEnabled: Boolean(ipfsDHT),
        ipfsMode: ipfsMode,
        announceDBs: (ipfsMode === 'api' || (ipfsMode === 'local' && ipfsDHT)) && Boolean(announceDBs)
      },
      server: {
        hapi: {
          port: apiPort,
          tls: Boolean(enableTLS) || Boolean(certKeyFile && certFile)
        },
        forceHTTP1: Boolean(forceHTTP1),
        http2: {
          allowHTTP1: Boolean(allowHTTP1),
          certKeyFile: certKeyFile,
          certFile: certFile
        }
      }
    }

    if (ipfsMode === 'local') {
      delete cliOptions.ipfs.host
      delete cliOptions.ipfs.port
    }

    options = merge({}, options, cliOptions)

    if ((enableTLS) && (!options.server.http2.certFile)) throw new Error('--https-cert is required')
    if ((enableTLS) && (!options.server.http2.certKeyFile)) throw new Error('--https-key is required')
    if (!options.server.hapi.port) options.server.hapi.port = 3000
    if (announceDBs && ipfsMode === 'local' && (!ipfsDHT)) {
      logger.warn('DB announcing disabled due to IPFS DHT not enabled')
    } else if (announceDBs) {
      logger.info('Automatic Announce DBs to DHT enabled')
    }

    logger.debug(`Options: ${JSON.stringify(options, null, 4)}`)

    if (
      options.server.http2.certKeyFile &&
      options.server.http2.certFile
    ) {
      options = merge(options, {
        server: {
          http2: {
            key: fs.readFileSync(options.server.http2.certKeyFile),
            cert: fs.readFileSync(options.server.http2.certFile)
          }
        }
      })
    }

    switch (ipfsMode) {
      case 'local':
        orbitDBAPI = await localApiFactory(options)
        break

      case 'api':
        if (!options.ipfs.host) throw new Error('--ipfs-host is required')
        if (!options.ipfs.port) options.ipfs.port = 5001
        orbitDBAPI = await remoteApiFactory(options)
        break

      default:
        throw new Error("Unrecognised ipfs mode. Please specify either 'api' or 'local'")
    }

    await orbitDBAPI.server.start()
    logger.info(`Server running on port ${options.server.hapi.port}`)
    logger.debug({
      DEBUG: {
        QUERY: process.env.DEBUG_QUERY
      }
    })
  } catch (err) {
    logger.error(err)
    process.exit(1)
  }
}

init()
