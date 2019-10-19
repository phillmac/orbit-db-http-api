const isDefined = (arg) => arg !== undefined && arg !== null

const MakeQuerablePromise = (promise) => {
  // Don't modify any promise that has been already modified.
  if (promise.isResolved) return promise

  // Set initial state
  let isPending = true
  let isRejected = false
  let isFulfilled = false

  // Observe the promise, saving the fulfillment in a closure scope.
  let result = promise.then(
    function (v) {
      isFulfilled = true
      isPending = false
      return v
    },
    function (e) {
      isRejected = true
      isPending = false
      throw e
    }
  )

  result.isFulfilled = function () {
    return isFulfilled
  }
  result.isPending = function () {
    return isPending
  }
  result.isRejected = function () {
    return isRejected
  }
  return result
}

class PeerManager {
  constructor (ipfs, orbitDB, options = {}) {
    if (!isDefined(options.PeerId)) {
      throw new Error('options.PeerId is a required argument.')
    }
    if (!isDefined(options.PeerInfo)) {
      throw new Error('options.PeerInfo is a required argument.')
    }
    if (!isDefined(options.multiaddr)) {
      throw new Error('options.multiaddr is a required argument.')
    }
    if (!isDefined(options.PeerBook)) {
      throw new Error('options.PeerBook is a required argument.')
    }

    if (typeof options.PeerId !== 'function') {
      throw new Error('options.PeerId must be callable')
    }
    if (typeof options.PeerInfo !== 'function') {
      throw new Error('options.PeerInfo must be callable')
    }
    if (typeof options.multiaddr !== 'function') {
      throw new Error('options.multiaddr must be callable')
    }

    const peerManOptions = Object.assign({}, isDefined(options.peerMan) ? options.peerMan : options)
    const PeerBook = options.PeerBook
    const dbPeers = {}
    const peerSearches = {}
    const peersList = typeof PeerBook === 'function' ? new PeerBook() : PeerBook
    const PeerId = options.PeerId
    const PeerInfo = options.PeerInfo
    const multiaddr = options.multiaddr

    const logger = Object.assign({
      debug: function () {},
      info: function () {},
      warn: function () {},
      error: function () {}
    },
    options.logger,
    peerManOptions.logger
    )

    const announceDBs = async () => {
      logger.info('Announcing DBs')
      for (const db of Object.values(orbitDB.stores)) {
        await announceDB(db)
      }
      logger.info('Finished announcing DBs')
    }

    this.announceDBs = announceDBs

    const announceDB = async (db) => {
      logger.info(`Announcing ${db.address.toString()}`)
      try {
        await ipfs.dht.provide(db.address.root)
        logger.info(`Finished announcing ${db.address.toString()}`)
      } catch (err) {
        logger.warn('Error while announcing DB', err)
      }
    }

    this.announceDB = announceDB

    if (peerManOptions.announceDBs) {
      setInterval(function () {
        announceDBs(orbitDB.stores)
      }, peerManOptions.announceInterval || 1800000)
    }

    const searchDetails = (searchID) => {
      return {
        searchID: searchID,
        started: (peerSearches[searchID] && peerSearches[searchID].started) || '',
        options: (peerSearches[searchID] && peerSearches[searchID].options) || {}
      }
    }

    this.searchDetails = searchDetails

    this.getSearches = () =>
      Object.keys(peerSearches).map(k => searchDetails(k))

    const swarmFindPeer = async (peerIDStr) => {
      for (const peer of await ipfs.swarm.addrs()) {
        if (peerIDStr.includes(peer.id.toB58String())) {
          return peer
        }
      }
    }

    const resolvePeerId = async (peerID) => {
      let result
      if (PeerId.isPeerId(peerID)) peerID = peerID.toB58String()
      if (peersList.has(peerID)) return result // Short circuit

      const resolved = [
        MakeQuerablePromise(swarmFindPeer(peerID).then(function(peer){
          peersList.put(peer, false)
          return peer
        })),
        MakeQuerablePromise(dhtFindPeer(peerID).search)
      ]

      while ((!result) && resolved.some(p => p.isPending())) {
        try {
        result = await Promise.race(resolved.filter(p => p.isPending()))
        } catch (err) {
          logger.warn(err)
        }
      }

      if (result) {
        const peerInfo = createPeerInfo(result)
        return peerInfo
      }
      throw new Error(`Unable to resolve peer ${peerID}`)
    }

    this.resolvePeerId = resolvePeerId

    const createPeerInfo = (details) => {
      if (PeerInfo.isPeerInfo(details)) return details // Short circuit
      let peerInfo
      if (PeerId.isPeerId(details)) return new PeerInfo(details)
      if (typeof details.ID === 'string' ) {
        peerInfo =  new PeerInfo(PeerId.createFromB58String(details.ID))
      } else {
        throw new Error('Unhandled createPeerInfo', details) // Peer id property is something other then 'ID'
      }

      if (isDefined(details.Addrs)) {
        for (const addr of details.Addrs) {
          peerInfo.multiaddrs.add(multiaddr(addr))
        }
      }
      return peerInfo
    }

    const dhtFindPeer = (peerIDStr) => {
      if (peerIDStr in peerSearches) {
        return {
          isNew: false,
          details: searchDetails(peerIDStr),
          search: peerSearches[peerIDStr].search
        }
      }
      logger.info(`Resolving addrs for ${peerIDStr}`)
      const search = ipfs.dht
        .findPeer(peerIDStr)
        .then(result => {
          peersList.put(result, false)
          delete peerSearches[peerIDStr]
          return results
        })
        .catch(err => {
          delete peerSearches[peerIDStr]
          logger.warn(`Error while resolving addrs for ${peerIDStr}`, err)
        })
      peerSearches[peerIDStr] = {
        started: Date.now(),
        search
      }
      return {
        isNew: true,
        details: searchDetails(peerIDStr),
        search
      }
    }

    this.findPeers = (db, opts = {}) => {
      let search
      if (db.id in peerSearches) {
        return {
          isNew: false,
          details: searchDetails(db.id),
          search: peerSearches[db.id].search
        }
      }
      logger.info(`Finding peers for ${db.id}`)
      if (
        typeof ipfs.send === 'function' &&
                ((peerManOptions && peerManOptions.useCustomFindProvs) || (opts && opts.useCustomFindProvs))
      ) {
        logger.debug('Using custom findProvs')
        search = new Promise((resolve, reject) => {
          ipfs.send(
            {
              path: 'dht/findprovs',
              args: db.address.root
            },
            (err, result) => {
              if (err) reject(err)
              let peers = []
              result.on('end', () => resolve(peers))
              result.on('data', chunk => {
                if (chunk.Type === 4) {
                  const newPeers = chunk.Responses.map(r => createPeerInfo(r))
                  logger.debug(`Found peers from DHT: ${JSON.stringify(chunk.Responses)}`)
                  for (const peer of newPeers) {
                    addPeer(db, peer)
                  }
                  peers = peers.concat(newPeers)
                }
              })
            }
          )
        })
      } else {
        search = ipfs.dht.findProvs(db.address.root, opts || {}).then(peers => {
          for (const peer of peers) {
            addPeer(db, peer)
          }
          return peers
        })
      }
      search.then(peers => {
        logger.info(`Finished finding peers for ${db.id}`)
        return peers
      }).catch(err => {
        logger.warn(`Error while finding peers for ${db.id}`, err)
      }).finally (() => {
        delete peerSearches[db.id]
      })
      peerSearches[db.id] = {
        started: Date.now(),
        options: opts,
        search
      }
      return {
        isNew: true,
        details: searchDetails(db.id),
        search
      }
    }

    this.getPeers = (db) => {
      if (!(db.id in dbPeers)) return []
      return dbPeers[db.id].map(p => {
        const peer = peersList.get(p)
        return {
          id: peer.id.toB58String(),
          multiaddrs: peer.multiaddrs.toArray().map(m => m.toString())
        }
      })
    }

    this.allPeers = () => {
      return Object.values(peersList.getAll()).map(p => {
        return {
          id: p.id.toB58String(),
          multiaddrs: p.multiaddrs.toArray().map(m => m.toString())
        }
      })
    }

    this.removeDB = (db) => {
      if (db.id in peerSearches) {
        peerSearches[db.id].search.then(() => {
          delete dbPeers[db.id]
        })
      } else {
        delete dbPeers[db.id]
      }
    }

    const addPeer = (db, peer) => {
      if (!PeerInfo.isPeerInfo(peer)) peer = createPeerInfo(peer)
      peersList.put(peer, false)
      if (!(db.id in dbPeers)) dbPeers[db.id] = []
      dbPeers[db.id].push(peer.id.toB58String())
    }

    this.attachDB = (db) => {
      db.events.on('peer', async function (peerID) {
        const peer = await swarmFindPeer(peerID)
        logger.debug(`Resolved peer from event ${peer.id.toB58String()}`)
        addPeer(db, peer)
      })
    }
  }
}

if (typeof module === 'object') module.exports = PeerManager
