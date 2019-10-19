const isDefined = (arg) => arg !== undefined && arg !== null

class PeerManager {
  constructor(ipfs, orbitDB, options = {}) {

    if (!isDefined(options.PeerInfo)) {throw new Error('options.PeerInfo is a required argument.')}
    if (!isDefined(options.multiaddr)) {throw new Error('options.multiaddr is a required argument.')}
    if (!isDefined(options.PeerBook)) {throw new Error('options.PeerBook is a required argument.')}

    if (typeof options.PeerInfo !== 'function') {throw new Error('options.PeerInfo must be callable')}
    if (typeof options.multiaddr !== 'function') {throw new Error('options.multiaddr must be callable')}

    const peerManOptions = Object.assign({}, isDefined(options.peerMan) ? options.peerMan : options)
    const PeerBook = options.PeerBook
    const dbPeers = {}
    const peerSearches = {}
    const peersList = typeof PeerBook === 'function' ? new PeerBook() : PeerBook
    const PeerInfo = options.PeerInfo
    const multiaddr = options.multiaddr

    const logger = Object.assign(
      {
        debug: function() {},
        info: function() {},
        warn: function() {},
        error: function() {}
      },
      options.logger,
      peerManOptions.logger
    )

    const announceDBs = async dbs => {
      logger.info("Announcing DBs")
      for (const db of Object.values(dbs)) {
        await announceDB(db)
      }
      logger.info("Finished announcing DBs")
    }

    this.announceDBs = announceDBs

    const announceDB = async db => {
      logger.info(`Announcing ${db.address.id}`)
      try {
        await ipfs.dht.provide(db.address.root)
        logger.info(`Finished announcing ${db.address.id}`)
      } catch (err) {
        logger.warn("Error while announcing DB", err)
      }
    }

    this.announceDB = announceDB

    if (peerManOptions.announceDBs) {
      setInterval(function() {
        announceDBs(orbitDB.stores)
      }, peerManOptions.announceInterval || 1800000)
    }

    const searchDetails = searchID => {
      return {
        searchID: searchID,
        started:
          (peerSearches[searchID] && peerSearches[searchID].started) || "",
        options:
          (peerSearches[searchID] && peerSearches[searchID].options) || {}
      }
    }
    this.searchDetails = searchDetails

    this.getSearches = () =>
      Object.keys(peerSearches).map(k => searchDetails(k))

    const resolvePeerId = async (peerID) => {
      if (peersList.has(peerID)) return peersList.get(peerID)   //Short circuit
      if (peerID.toB58String) peerID = peerID.toB58String()

      const p1 = (async () => {
        try {
          const swarmPeers = await ipfs.swarm.addrs()
          for (const PeerInfo of swarmPeers) {
            if (peerID.includes(details.id.toB58String())) {
              resolved[p1] = true
              return PeerInfo
            }
          }
        } catch (err) {
          logger.debug(err)
        }
      })()
      const p2 = resolvePeerAddrs(peerID).search.then(details => {
        resolved[p2] = true
        return details
      })

      const resolved = {
        [p1]: false,
        [p2]: false
      }

      let result

      while (Object.keys(resolved).some(p => !resolved[p]) && !result) {
        result = await Promise.race(Object.keys(resolved).filter(p => !resolved[p]))
      }

      if (result) {
        const peerInfo = createPeerInfo(result)
        peersList.put(peerInfo, false)
        return peerInfo
      }
      throw new Error(`Unable to resolve peer ${peerID}`)
    }

    this.resolvePeerId = resolvePeerId.bind(this)

    const createPeerInfo = details => {
      if(PeerInfo.isPeerInfo(details)) return details  //Short circuit
      let result
      if (isDefined(details.ID) ) {
        result = new PeerInfo.create(details.ID)
      } else {
        throw new Error('Unhandled createPeerInfo', details)   //Peer id property is something other then 'ID'
      }

      if (isDefined(details.Addrs)) {
        for(addr of details.Addrs) {
          details.Addrs.forEach(addr => {
            result.multiaddrs.add(multiaddr(addr))
          })
        }
      }
      return result
    }

    const resolvePeerAddrs = async peerIDStr => {
      if (peerSearches[peerIDStr])
        return {
          isNew: false,
          details: searchDetails(peerIDStr),
          search: peerSearches[peerIDStr].search
        }
      logger.info(`Resolving addrs for ${peerIDStr}`)
      const search = ipfs.dht
        .findPeer(peerIDStr)
        .then(results => {
          peersList[peerIDStr] = results
          delete peerSearches[peerIDStr]
          return results
        })
        .catch(err => {
          delete peerSearches[peerIDStr]
          logger.warn(`Error while resolving addrs for ${peerIDStr}`, err)
        })
      peerSearches[peerIDStr] = {
        started: Date.now(),
        options: options,
        search
      }
      return { isNew: true, details: searchDetails(peerIDStr), search }
    }

    this.findPeers = (db, opts = {}) => {
      let search
      if (peerSearches[db.id])
        return {
          isNew: false,
          details: searchDetails(db.id),
          search: peerSearches[db.id].search
        }
      logger.info(`Finding peers for ${db.id}`)
      if (
        typeof ipfs.send === "function" &&
        (peerManOptions.useCustomFindProvs || opts.useCustomFindProvs)
      ) {
        console.debug("Using custom findProvs")
        search = new Promise((resolve, reject) => {
          ipfs.send(
            {
              path: "dht/findprovs",
              args: db.address.root
            },
            (err, result) => {
              if (err) reject(err)
              let peers = []
              result.on("end", () => resolve(peers))
              result.on("data", chunk => {
                if (chunk.Type === 4) {
                  peers = peers.concat(chunk.Responses.map(r => createPeerInfo(r)))
                }
              })
            }
          )
        })
      } else {
        search = ipfs.dht.findProvs(db.address.root, opts || {})
      }
      search.then(peers => {
        logger.info(`Finished finding peers for ${db.id}`)
        for (peer of peers) {
          peersList.put(peer)
        }
      }).catch(err => {
        logger.warn(`Error while finding peers for ${db.id}`, err)
      }).finaly(() => {
        delete peerSearches[db.id]
      })
      peerSearches[db.id] = {
        started: Date.now(),
        options: opts,
        search
      }
      return { isNew: true, details: searchDetails(db.id), search }
    }

    this.getPeers = (db => {
      return (dbPeers[db.id] || []).map(p => {
        return {
          id: p.id.toB58String(),
          multiaddrs: p.multiaddrs.toArray().map(m => m.toString())
        }
      })
    }).bind(this)

    this.allPeers = (() => {
      return Object.values(peersList.getAll()).map(p => {
        return {
          id: p.id.toB58String(),
          multiaddrs: p.multiaddrs.toArray().map(m => m.toString())
        }
      })
    }).bind(this)

    this.detachDB = (db => {
      if (peerSearches[db.id]) {
        peerSearches[db.id].search.then(() => {
          delete dbPeers[db.id]
        })
      } else {
        delete dbPeers[db.id]
      }
    }).bind(this)

    const addPeer = ((db, peer) => {
      if(!peerInfo.isPeerInfo(peer)) peer = createPeerInfo(peer)
      peersList.put(peer, false)
      dbPeers[db.id][peer.id.toB58String()] = peer
    })



    this.attachDB = (db => {
      db.events.on("peer", async function (peerID) {
        const peer = await resolvePeerId(peerID)
        logger.debug(`resolved peer from event ${peer.id.toB58String()}`)
        addPeer(db, peer)
      })
    }).bind(this)
  }
}

if (typeof module === "object") module.exports = PeerManager
