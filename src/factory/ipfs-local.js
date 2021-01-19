const Ipfs = require('ipfs')
const OrbitDBApi = require('../lib/OrbitDBAPI.js')
const getManagers = require('./managers.js')

const merge = require('lodash/merge')

async function apiFactory (options) {
  options = merge({
    ipfs: {
      EXPERIMENTAL: {
        pubsub: true
      },
      start: true
    }
  }, options)
  const ipfs = await Ipfs.create(options.ipfs)
  const peerStore = ipfs.libp2p.peerStore
  const orbitDBAPI = new OrbitDBApi(await getManagers(ipfs, peerStore, options), options)

  return orbitDBAPI
}

module.exports = apiFactory
