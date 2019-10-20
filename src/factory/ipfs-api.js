const IpfsApi = require('ipfs-http-client')
const OrbitDB = require('orbit-db')
const {DBManager, PeerManager} = require('orbit-db-managers')
const OrbitDBApi = require('../lib/OrbitDBAPI.js')

async function apiFactory (options) {

  const ipfs = new IpfsApi(options.ipfs)
  const orbitDB = await OrbitDB.createInstance(ipfs, options.orbitDB)
  const peerMan = new PeerManager(ipfs, orbitDB, options)
  const dbMan = new DBManager(orbitDB, peerMan)
  const orbitDBAPI = new OrbitDBApi(dbMan, peerMan, options)

  return orbitDBAPI
}

module.exports = apiFactory
