const IpfsApi = require('ipfs-http-client')
const OrbitDB = require('orbit-db')
const DBManager = require('../lib/db-manager.js')
const PeerManager = require('../lib/peer-manager.js')
const OrbitDBApi = require('../lib/orbitdb-api.js')
const EmptyPromise = require('empty-promise')

const merge = require('lodash/merge')

async function apiFactory (options) {
  const dbmPromise = EmptyPromise()

  options = merge({
    peerMan: {
      dbmPromise: dbmPromise
    }
  }, options)

  const ipfs = new IpfsApi(options.ipfs)
  const orbitDB = await OrbitDB.createInstance(ipfs, options.orbitDB)
  const peerMan = new PeerManager(ipfs, options.peerMan)
  const dbM = new DBManager(orbitDB, ipfs, peerMan)
  const orbitDBAPI = new OrbitDBApi(dbM, peerMan, options)

  dbmPromise.resolve(dbM)

  return orbitDBAPI
}

module.exports = apiFactory
