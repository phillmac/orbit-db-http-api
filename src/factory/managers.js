const Web3 = require('web3')
const pMap = require('p-map');
const PeerId = require('peer-id')
const OrbitDB = require('orbit-db')
const Logger = require('logplease')
const PeerInfo = require('peer-info')
const multiaddr = require('multiaddr')
const { default: PQueue } = require('p-queue')
const PeerStore = require('libp2p/src/peer-store')
const { EventEmitter } = require('events')
const { DBManager, PeerManager, SessionManager } = require('orbit-db-managers')

const deps = {
  EventEmitter,
  Logger,
  multiaddr,
  PeerId,
  PeerInfo,
  PeerStore,
  pMap,
  PQueue,
  Web3
}

const getManagers = async (ipfs, options) => {
  const orbitDB = await OrbitDB.createInstance(ipfs, options.orbitDB)
  const peerManager = new PeerManager({ ipfs, orbitDB, ...deps, options })
  return {
    peerManager,
    dbManager: new DBManager({ orbitDB, peerManager, ...deps, options }),
    sessionManager: new SessionManager()
  }
}

module.exports = getManagers
