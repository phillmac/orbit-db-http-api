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

  const orbitDBAPI = new OrbitDBApi(await getManagers(ipfs, options), options)

  return orbitDBAPI
}

module.exports = apiFactory
