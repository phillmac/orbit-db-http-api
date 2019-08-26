const CID = require('cids')
const Logger    = require('js-logger')


class DBManager {
    constructor(orbitdb, ipfs, options={}){
        let _dbs = {};
        let dbPeers = {};
        let peerSearches = {};
        let peersList = {};

        let find_db = (dbn)  => {
            let result
            if (dbn in _dbs) return _dbs[dbn]
            for (let db of Object.values(_dbs)) {
                if (dbn == db.id) {
                    result = db
                    break
                } else if (dbn == [db.address.root, db.address.path].join('/')) {
                    result = db
                    break
                }
            };
            if (result) return result
        };

        this.get = async (dbn, params) => {
            let db = find_db(dbn);
            if (db) {
                return db;
            } else {
                Logger.info(`Opening db ${dbn}`);
                db = await orbitdb.open(dbn, params);
                Logger.info(`Loading db ${dbn}`);
                await db.load();
                Logger.info(`Loaded db ${db.dbname}`);
                _dbs[db.dbname] = db;
                dbPeers[db.id] = []
                ipfs.dht.provide(new CID(db.address.root));
                return db;
            }
        };

        this.db_list_remove = async (dbn) => {
            let db = find_db(dbn)
            if (db) {
                await db.close()
                delete _dbs[db.dbname];
                delete dbPeers[db.address.root];
                Logger.info(`Unloaded db ${db.dbname}`);
            }
        }

        this.db_list = () => {
            let db_info_list = {};
            for (let dbn in _dbs) {
                if (_dbs.hasOwnProperty(dbn)) {
                    db_info_list[dbn] = this.db_info(dbn);
                }
            }
            return JSON.stringify(db_info_list);
        };

        let _db_write = (db) => {
            return (
                db.access.write ||
                (typeof db.access.get == 'function' && db.access.get('write')) ||
                db.access._options.write ||
                'unavaliable'
            );
        }

        this.db_write = (dbn) => {
            let db = find_db(dbn);
            if (!db) return {};
            return _db_write(db);
        }

        this.db_info = (dbn) => {
            let db = find_db(dbn);
            if (!db) return {};
            let __db_write = _db_write(db)
            return {
                address: db.address,
                dbname: db.dbname,
                id: db.id,
                options: {
                    create: db.options.create,
                    indexBy: db.options.indexBy,
                    localOnly: db.options.localOnly,
                    maxHistory: db.options.maxHistory,
                    overwrite: db.options.overwrite,
                    path: db.options.path,
                    replicate: db.options.replicate,
                },
                canAppend: __db_write.includes(orbitdb.identity.id),
                write: __db_write,
                type: db.type,
                uid: db.uid,
                indexLength: db.index.length || Object.keys(db.index).length,
                accessControlerType: db.access.type || 'custom',
                peers: this.get_db_peers(db),
                peerCount:  (dbPeers[db.id]).length,
                capabilities: Object.keys(                                         //TODO: cleanup this mess once tc39 object.fromEntries aproved
                    Object.assign ({}, ...                                         // https://tc39.github.io/proposal-object-from-entries
                        Object.entries({
                            add: typeof db.add == 'function',
                            get: typeof db.get == 'function',
                            inc: typeof db.inc == 'function',
                            iterator: typeof db.iterator == 'function',
                            put: typeof db.put == 'function',
                            query: typeof db.query == 'function',
                            remove: typeof (db.del || db.remove) == 'function',
                            value: typeof db.value == 'function'
                        }).filter(([k,v]) => v).map(([k,v]) => ({[k]:v}))
                    )
                )
            };
        };

        this.identity = () => {
            return orbitdb.identity;
        };

        this.announce_dbs = async () => {
            Logger.info('Announcing DBs')
            for (let db of Object.values(_dbs)) {
                try {
                    await ipfs.dht.provide(new CID(db.address.root));
                } catch (ex) {}
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

        this.find_db_peers = (db, options={
            resolvePeerAddrs: {isNew: false, details: this.search_details[db.id]},
            ipfs: {}
        }) => {
            if(peerSearches[db.id]) return false;
            Logger.info(`Finding peers for ${db.id}`);
            let search = ipfs.dht.findProvs(db.address.root, options.ipfs || {})
            peerSearches[db.id] = {
                started: Date.now(),
                options: options,
                search: search.then(async (results) => {
                    if (options.resolvePeerAddrs) {
                        let addrs = await Promise.all(results.map((p) => {
                            resolvePeerAddr(p.id.toB58String())
                        }));
                        Logger.debug(`Found peer addrs ${addrs}`)
                    } else {
                        dbPeers[db.id] = results
                    }
                    db.events.emit('peers.found', {event:'peers.found', data:{peers:dbPeers[db.id]}})
                    Logger.info(`Finished finding peers for ${db.id}`);
                    delete peerSearches[db.id]
                    return dbPeers[db.id]
                }).catch((err) => {
                    delete peerSearches[db.id]
                    Logger.info(`Error while finding peers for ${db.id}`, err);
                })
            }
            return true;
        }

        this.get_db_peers = (db) => {
            return dbPeers[db.id].map(p => {
                return {
                    peer:p,
                    id: p.id.toB58String(),
                    multiaddrs: p.multiaddrs.toString()
                }
            })
        }

        this.get_peers = () => {
            return Object.values(peersList).map(p => {
                id: p.id.toB58String()
                multiaddrs: p.multiaddrs.map(m=>m.toString())
            })
        }


        function ipfsPeerConnected(swarm_peers, peerAddr) {
            if (swarmFindPeer(swarm_peers, peerAddr)) {
              return true;
            }
            return false;
        }

        function swarmFindPeer(swarm_peers, peerAddr) {
            for (let peerInfo of swarm_peers) {
                if (peerAddr.includes(peerInfo.peer.toB58String())) {
                    return peerInfo;
                }
            }
        }

        function ipfsPing(peerInfo) {
            peerId = peerInfo.id.toB58String();
            ipfs.ping(peerId, function(err, _responses) {
                if (err) {
                    Logger.trace(`Error pinging ${peerId}`, err);
                }
            });
          }
    }
}

module.exports = DBManager;
