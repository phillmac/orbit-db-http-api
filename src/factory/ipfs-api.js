const IpfsApi = require('ipfs-http-client')
const OrbitDB = require('orbit-db')
const { DBManager, PeerManager, SessionManager } = require('orbit-db-managers')
const OrbitDBApi = require('../lib/OrbitDBAPI.js')

async function apiFactory (options) {
  const ipfs = new IpfsApi(options.ipfs)
  const orbitDB = await OrbitDB.createInstance(ipfs, options.orbitDB)
  const managers = {}
  managers.peerManager = new PeerManager(ipfs, orbitDB, options)
  managers.dbManager = new DBManager(orbitDB, managers.peerManager)
  managers.sessionManager = new SessionManager()
  const orbitDBAPI = new OrbitDBApi(managers, options)

  return orbitDBAPI
}

module.exports = apiFactory
