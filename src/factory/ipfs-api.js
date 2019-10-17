const IpfsApi = require('ipfs-http-client')
const OrbitDB = require('orbit-db')
const DBManager = require('../lib/db-manager.js')
const PeerManager = require('../lib/peer-manager.js')
const OrbitDBApi = require('../lib/orbitdb-api.js')

async function apiFactory (options) {

  const ipfs = new IpfsApi(options.ipfs)
  const orbitDB = await OrbitDB.createInstance(ipfs, options.orbitDB)
  const peerMan = new PeerManager(ipfs, orbitDB, options)
  const dbMan = new DBManager(orbitDB, peerMan)
  const orbitDBAPI = new OrbitDBApi(dbMan, peerMan, options)

  return orbitDBAPI
}

module.exports = apiFactory
