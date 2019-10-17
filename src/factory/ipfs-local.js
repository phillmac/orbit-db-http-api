const Ipfs = require('ipfs')
const OrbitDB = require('orbit-db')
const DBManager = require('../lib/db-manager.js')
const PeerManager = require('../lib/peer-manager.js')
const OrbitDBApi = require('../lib/orbitdb-api.js')


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

  const orbitDB = await OrbitDB.createInstance(ipfs, options.orbitDB)
  const peerMan = new PeerManager(ipfs, orbitDB, options)
  const dbMan = new DBManager(orbitDB, peerMan)
  const orbitDBAPI = new OrbitDBApi(dbMan, peerMan, options)

  return orbitDBAPI
}

module.exports = apiFactory
