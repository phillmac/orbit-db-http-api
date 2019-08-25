const CID = require('cids')
const Logger    = require('js-logger')


class DBManager {
    constructor(orbitdb, ipfs, options={}){
        let _dbs = {};
        let dbPeers = {};
        let connectLockout;
        let findPeersLockout;
        let peerSearches = {};

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
                dbPeers[db.address.root] = []
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
                peers: get_db_peers(db),
                peerCount:  (dbPeers[db.address.root]).length,
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

        let get_searches = () => {
            return Object.keys(peerSearches)
        }

        this.get_searches = get_searches;

        let find_db_peers = (db, options={}) => {
            if(peerSearches[db.id]) return false;
            Logger.info(`Finding peers for ${db.id}`);
            search = ipfs.dht.findProvs(dbRoot)
            peerSearches[db.id] = search
            search.then((result) => {
                delete peerSearches[db.id]
                dbPeers[db.id] = result
                db.events.emit('peers.found', {event:'peers.found', data:{peers:result}})
                Logger.info(`Finished finding peers for ${db.id}`);
            })
            return true;
        }

        this.find_db_peers = find_db_peers;

        let get_db_peers = (db) => {
            let dbRoot = db.address.root
            return dbPeers[dbRoot].map(p => {
                id: p.id.toB58String()
                multiaddrs: p.multiaddrs.map(m=>m.toString())
            })
        }

        this.get_db_peers = get_db_peers;

        let find_orbitdb_peers =  async (resolve, reject) => {
            if (findPeersLockout) {
                reject('Already finding peers')
            } else {
                findPeersLockout = true;
                Logger.info('Finding OrbitDb peers');
                for (let dbRoot of [...new Set(Object.values(_dbs).map(d => d.address.root))]) {
                    Logger.info(`Finding peers for ${dbRoot}`)
                    try {
                        dbPeers = await ipfs.dht.findProvs(dbRoot)
                        Logger.info(`Found ${dbPeers.length} peers`)
                        dbPeers[dbRoot] = dbPeers
                    } catch (ex) {
                        Logger.debug('Finding peers failed: ', ex)
                        reject(ex)
                    }
                }
                findPeersLockout = false;
                Logger.info('Finished finding OrbitDb peers');
                resolve([...new Set(Object.values(dbPeers))]);
            }
        }

        this.find_orbitdb_peers = find_orbitdb_peers;

        let connect_orbitdb_peers = async (peersList) => {
            if (!connectLockout) {
                connectLockout = true
                Logger.info('Connecting OrbitDb peers');
                let swarmPeers = await ipfs.swarm.peers();
                for (let peerInfo of peersList) {
                    Logger.debug(peerInfo)
                    peerId = peerInfo.id.toB58String();
                    if (ipfsPeerConnected(swarmPeers, peerId)) {
                        ipfsPing(peerInfo);
                    } else {
                        try {
                            try{
                                await ipfs.swarm.connect(peerInfo)
                            } catch (ex) {
                                Logger.info('Trying p2p-circuit')
                                ipfs.swarm.connect(`/p2p-circuit/ipfs/${peerId}`)
                            }
                        } catch (ex) {
                            Logger.debug(`Unable to connect to ${peerId}`, ex)
                        }
                    }
                }
                connectLockout = false
                Logger.info('Finished connecting OrbitDb peers');
            }
        }

        this.connect_orbitdb_peers = connect_orbitdb_peers;

        // setInterval(async function() {
        //     try {
        //         let peersList = await new Promise ((resolve, reject) => find_orbitdb_peers(resolve, reject))
        //         connect_orbitdb_peers(peersList)
        //     } catch (ex) {
        //         Logger.debug(ex)
        //     }
        // }, 300000)

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
