const Web3 = require('web3')
const pMap = require('p-map')
const PeerId = require('peer-id')
const OrbitDB = require('orbit-db')
const Logger = require('logplease')
const multiaddr = require('multiaddr')
const { default: PQueue } = require('p-queue')
const { EventEmitter } = require('events')
const { DBManager, PeerManager, SessionManager } = require('orbit-db-managers')
const SetStore = require('@tabcat/orbit-db-set')

OrbitDB.addDatabaseType(SetStore.type, SetStore)

const deps = {
  EventEmitter,
  Logger,
  multiaddr,
  PeerId,
  pMap,
  PQueue,
  Web3
}

const getManagers = async (ipfs, peerStore, options) => {
  const orbitDB = await OrbitDB.createInstance(ipfs, options.orbitDB)
  const peerManager = new PeerManager({ ipfs, orbitDB, peerStore, ...deps, options })
  return {
    peerManager,
    dbManager: new DBManager({ orbitDB, peerManager, ...deps, options }),
    sessionManager: new SessionManager()
  }
}

module.exports = getManagers
