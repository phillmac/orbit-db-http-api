const CID = require('cids')
const Logger = require('js-logger')

class PeerManager {
  constructor (ipfs, options = {}) {
    const dbPeers = {}
    const peerSearches = {}
    const peersList = {}
    let dbM

    options.dbmPromise.then((dbmInstance) => { dbM = dbmInstance })

    const announceDBS = async (dbs) => {
      Logger.info('Announcing DBs')
      for (const db of Object.values(dbs)) {
        try {
          await ipfs.dht.provide(new CID(db.address.root))
          Logger.info('Finished announcing DBs')
        } catch (ex) {
          Logger.trace('Error while announcing DBs', ex)
        }
      }
    }

    this.announceDBS = announceDBS

    if (options.announceDBS) {
      setInterval(function () {
        announceDBS(dbM.dbs())
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

    const resolvePeerAddr = async (peerId) => {
      if (peerSearches[peerId]) return { isNew: false, details: searchDetails[peerId] }
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
      return { isNew: true, details: searchDetails[peerId] }
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
}

module.exports = PeerManager
