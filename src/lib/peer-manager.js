const CID = require('cids')
const Logger = require('js-logger')

class PeerManager {
  constructor (ipfs, options = {}) {
    const dbPeers = {}
    const peerSearches = {}
    const peersList = {}
    let dbM

    options.dbmPromise.then((dbmInstance) => { dbM = dbmInstance })

    const announceDBs = async (dbs) => {
      Logger.info('Announcing DBs')
      for (const db of Object.values(dbs)) {
          await announceDB(db)
      }
      Logger.info('Finished announcing DBs')
  }

  this.announceDBs = announceDBs

  const announceDB = async (db) => {
    Logger.info(`Announcing ${db.address.id}`)
    try {
      await ipfs.dht.provide(new CID(db.address.root))
      Logger.info(`Finished announcing ${db.address.id}`)
    } catch (ex) {
      Logger.trace('Error while announcing DB', ex)
    }
  }

  this.announceDB = announceDB

    if (options.announceDBs) {
      setInterval(function () {
        announceDBs(dbM.dbs())
      }, options.announceInterval || 1800000)
    }

    const searchDetails = (searchID) => {
      return {
        searchID: searchID,
        started: peerSearches[searchID] && peerSearches[searchID].started || '',
        options: peerSearches[searchID] && peerSearches[searchID].options || {}
      }
    }
    this.searchDetails = searchDetails

    this.getSearches = () => Object.keys(peerSearches).map(k => searchDetails(k))

    const resolvePeerAddrs = async (peerInfo) => {
      const peerId = getPeerID(peerInfo)
      if (peerSearches[peerId]) return { isNew: false, details: searchDetails(peerId) }
      Logger.info(`Resolving addrs for ${peerId}`)
      const search = ipfs.dht.findPeer(peerId)
      peerSearches[peerId] = {
        started: Date.now(),
        options: options,
        search: search.then((results) => {
          peersList[peerId] = results
          delete peerSearches[peerId]
          return results
        }).catch((err) => {
          delete peerSearches[peerId]
          Logger.info(`Error while resolving addrs for ${peerId}`, err)
        })
      }
      return { isNew: true, details: searchDetails(peerId) }
    }

    this.findDBPeers = (db, opts = {}) => {
      if (peerSearches[db.id]) return { isNew: false, details: searchDetails(db.id) }
      Logger.info(`Finding peers for ${db.id}`)
      const search = ipfs.dht.findProvs(db.address.root, opts || {})
      peerSearches[db.id] = {
        started: Date.now(),
        options: opts,
        search: search.then(async (results) => {
          dbPeers[db.id] = results
          db.events.emit('peers.found', { event: 'peers.found', data: { peers: getDBPeers(db) } })
          Logger.info(`Finished finding peers for ${db.id}`)
          delete peerSearches[db.id]
          return dbPeers[db.id]
        }).catch((err) => {
          delete peerSearches[db.id]
          Logger.info(`Error while finding peers for ${db.id}`, err)
        })
      }
      return { isNew: true, details: searchDetails(db.id) }
    }

    const getDBPeers = (db) => {
      return (dbPeers[db.id] || []).map(p => {
        return {
          id: p.id.toB58String(),
          multiaddrs: p.multiaddrs.toArray().map(m => m.toString())
        }
      })
    }

    this.getDBPeers = getDBPeers

    this.getPeers = () => {
      return Object.values(peersList).map(p => {
        return {
          id: p.id.toB58String(),
          multiaddrs: p.multiaddrs.toArray().map(m => m.toString())
        }
      })
    }

    this.removeDB = async (db) => {
      if (peerSearches[db.id]) {
        peerSearches[db.id].search.then(() => {
          delete dbPeers[db.id]
        })
      } else {
        delete dbPeers[db.id]
      }
    }

    function isSwarmPeerConnected (peerInfo, swarmPeers) {
      if (swarmFindPeerAddr(peerInfo, swarmPeers)) {
        return true
      }
      return false
    }

    async function swarmFindPeerAddr (peerInfo, swarmPeers) {
      let peerId
      if (!swarmPeers) swarmPeers = await ipfs.swarm.peers()
      if (typeof peerInfo === 'string') {
        peerId = peerInfo
      } else {
        peerId = peerInfo.id.toB58String()
      }
      for (const { peer, addr } of swarmPeers) {
        if (peerId.includes(peer.toB58String())) {
          return addr.toString()
        }
      }
    }

    function pingPeer (peerInfo) {
      let peerId
      if (typeof peerInfo === 'string') {
        peerId = peerInfo
      } else {
        peerId = peerInfo.id.toB58String()
      }
      ipfs.ping(peerId, function (err, _responses) {
        if (err) {
          Logger.trace(`Error pinging ${peerId}`, err)
        }
      })
    }
  }

  //  getPeerAddresses = (peerInfo) => {
  //   for (const getAddrsMethod  of [
  //     () => peerInfo.multiaddrs.toArray().map(m => m.toString())
  //   ]) {

  //   }
  // }

  // getPeerID = (peerInfo) => {
  //   if (typeof peerInfo === 'string') {
  //     return peerInfo
  //   } else if (peerInfo.id && typeof peerInfo.id.toB58String === 'function'){
  //     return peerInfo.id.toB58String()
  //   } else {
  //     throw new Error(`Uknown peerInfo ${typeof peerInfo}`)
  //   }
  // }

  // connectPeer = async (peerInfo)  => {
  //   const peerAddresses = getPeerAddresses(peerInfo)
  //   const peerId = getPeerID(peerInfo)

  //   Logger.info(`Connecting ipfs peer: ${peerId}`)
  //   for (const address of peerAddresses )
  //   try {
  //     await ipfs.swarm.connect(address)
  //   } catch (ex) {
  //     Logger.trace(`Unable to connect ${address}: ${ex}`)
  //   }
  //   Logger.info(`Connected ${peerId}`)
  // }
}

module.exports = PeerManager
