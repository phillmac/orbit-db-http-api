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
  const ipfs = await new Promise((resolve, reject) => {
    var node = new Ipfs(options.ipfs)
    node.on('ready', () => {
      resolve(node)
    })
  }).catch((err) => { throw err })

  const orbitDBAPI = new OrbitDBApi(await getManagers(ipfs, options), options)

  return orbitDBAPI
}

module.exports = apiFactory
