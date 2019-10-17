const Ipfs = require('ipfs')
const OrbitDB = require('orbit-db')
const DBManager = require('../lib/db-manager.js')
const PeerManager = require('../lib/peer-manager.js')
const OrbitDBApi = require('../lib/orbitdb-api.js')
const EmptyPromise = require('empty-promise')
const Logger = require('logplease')


const merge = require('lodash/merge')

async function apiFactory (options) {
  const dbmPromise = EmptyPromise()

  options = merge({
    ipfs: {
      EXPERIMENTAL: {
        pubsub: true
      },
      start: true
    },
    peerMan: {
      dbmPromise: dbmPromise
    }
  }, options)
  const ipfs = await new Promise((resolve, reject) => {
    var node = new Ipfs(options.ipfs)
    node.on('ready', () => {
      resolve(node)
    })
  }).catch((err) => { throw err })

  const orbitDB = await OrbitDB.createInstance(ipfs, options.orbitDB)
  const peerMan = new PeerManager(ipfs, options.peerMan)
  const dbM = new DBManager(orbitDB, peerMan)
  const orbitDBAPI = new OrbitDBApi(dbM, peerMan, options)

  dbmPromise.resolve(dbM)

  return orbitDBAPI
}

module.exports = apiFactory
