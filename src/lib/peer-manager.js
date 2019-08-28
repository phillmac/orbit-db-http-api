const CID = require('cids')
const Logger    = require('js-logger')


class PeerManager {
    constructor(ipfs, options={}){
        let dbPeers = {};
        let peerSearches = {};
        let peersList = {};


        this.announce_dbs = async () => {
            Logger.info('Announcing DBs')
            for (let db of Object.values(_dbs)) {
                try {
                    await ipfs.dht.provide(new CID(db.address.root));
                    Logger.info('Finished announcing DBs')
                } catch (ex) {
                    Logger.trace('Error while announcing DBs', ex)
                }
            }
        }

        if(options.announceDBS) {
            setInterval(this.announce_dbs, options.announceInterval || 1800000);
        }

        let search_details = (searchID) => {
            return {
                searchID:searchID,
                started: peerSearches[searchID].started,
                options: peerSearches[searchID].options
            }
        }
        this.search_details = search_details;

        this.get_searches = () => Object.keys(peerSearches).map(k=>this.search_details(k))

        let resolvePeerAddr = async (peerId) => {
            if(peerSearches[peerId]) return peerSearches[peerId], {isNew: false, details: this.search_details[peerId]};
            Logger.info(`Resolving addrs for ${peerId}`);
            let search = ipfs.dht.findPeer(peerId)
            peerSearches[peerId] = search.then((results)=>{
                peersList[peerId] = results
                delete peerSearches[peerId];
                return results
            }).catch((err) => {
                delete peerSearches[peerId]
                Logger.info(`Error while resolving addrs for ${peerId}`, err);
            });
            return peerSearches[peerId], {isNew: true, details: this.search_details[peerId]};

        }

        this.find_db_peers = (db, options={}) => {
            if(peerSearches[db.id]) return {isNew: false, details: search_details[db.id]};
            Logger.info(`Finding peers for ${db.id}`);
            let search = ipfs.dht.findProvs(db.address.root, options || {})
            peerSearches[db.id] = {
                started: Date.now(),
                options: options,
                search: search.then(async (results) => {
                    dbPeers[db.id] = results
                    db.events.emit('peers.found', {event:'peers.found', data:{peers:dbPeers[db.id]}})
                    Logger.info(`Finished finding peers for ${db.id}`);
                    delete peerSearches[db.id]
                    return dbPeers[db.id]
                }).catch((err) => {
                    delete peerSearches[db.id]
                    Logger.info(`Error while finding peers for ${db.id}`, err);
                })
            }
            return {isNew: false, details: (search_details[db.id] || {})};
        }

        this.getDBPeers = (db) => {
            return dbPeers[db.id].map(p => {
                return {
                    id: p.id.toB58String(),
                    multiaddrs: p.multiaddrs.toArray().map(m=>m.toString())
                }
            })
        }

        this.getPeers = () => {
            return Object.values(peersList).map(p => {
                return {
                    id: p.id.toB58String(),
                    multiaddrs: p.multiaddrs.toArray().map(m=>m.toString())
                }
            })
        }

        function isSwarmPeerConnected(swarmPeers, peerInfo) {
            if (swarmFindPeer(swarmPeers, peerInfo)) {
              return true;
            }
            return false;
        }

        function swarmFindPeerAddr(swarmPeers, peerInfo) {
            if (typeof peerInfo == 'string') {
                peerId = peerInfo
            } else {
                peerId = peerInfo.id.toB58String();
            }
            for (let {peer, addr} of swarmPeers) {
                if (peerId.includes(peer.toB58String())) {
                    return addr.toString();
                }
            }
        }

        function pingPeer(peerInfo) {
            if (typeof peerInfo == 'string') {
                peerId = peerInfo
            } else {
                peerId = peerInfo.id.toB58String();
            }
            ipfs.ping(peerId, function(err, _responses) {
                if (err) {
                    Logger.trace(`Error pinging ${peerId}`, err);
                }
            });
          }

    }
}

module.exports = PeerManager;

