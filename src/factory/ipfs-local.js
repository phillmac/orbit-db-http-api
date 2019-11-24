const Ipfs = require('ipfs')
const OrbitDB = require('orbit-db')
const { DBManager, PeerManager, SessionManager } = require('orbit-db-managers')
const OrbitDBApi = require('../lib/OrbitDBAPI.js')

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
  const managers = {}
  managers.peerManager = new PeerManager(ipfs, orbitDB, options)
  managers.dbManager = new DBManager(orbitDB, managers.peerManager)
  managers.sessionManager = new SessionManager()
  const orbitDBAPI = new OrbitDBApi(managers, options)

  return orbitDBAPI
}

module.exports = apiFactory
