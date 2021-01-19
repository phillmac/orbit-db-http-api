const IpfsApi = require('ipfs-http-client')
const OrbitDBApi = require('../lib/OrbitDBAPI.js')
const getManagers = require('./managers.js')
const PeerStore = require('libp2p/src/peer-store')

async function apiFactory (options) {
  const ipfs = new IpfsApi(options.ipfs)
  const peerStore = new PeerStore({ peerID: await ipfs.id() })
  const orbitDBAPI = new OrbitDBApi(await getManagers(ipfs, peerStore, options), options)

  return orbitDBAPI
}

module.exports = apiFactory
