const CID = require('cids')

class DBManager {
    constructor(orbitdb, ipfs, options={}){
        let _dbs = {};
        let dbPeers = {}

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
                console.log(`Opening db ${dbn}`);
                db = await orbitdb.open(dbn, params);
                console.log(`Loading db ${dbn}`);
                await db.load();
                console.log(`Finished loading db ${db.dbname}`);
                _dbs[db.dbname] = db;
                ipfs.dht.provide(new CID(db.address.root));
                return db;
            }
        };

        this.db_list_remove = async (dbn) => {
            let db = find_db(dbn)
            if (db) {
                await db.close()
                delete _dbs[db.dbname];
                console.log(`Unloaded db ${db.dbname}`);
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
                canAppend: orbitdb.identity in __db_write,
                write: __db_write,
                type: db.type,
                uid: db.uid,
                indexLength: db.index.length || Object.keys(db.index).length,
                accessControlerType: db.access.type || 'custom',
                peers: dbPeers[db.id] || [],
                peerCount:  (dbPeers[db.id] || []).length,
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
            console.info('Announcing DBs')
            for (let db of Object.values(_dbs)) {
                try {
                    await ipfs.dht.provide(new CID(db.address.root));
                } catch (ex) {}
            }
        }

        if(options.announceDBS) {
            setInterval(this.announce_dbs, options.announceInterval || 1800000);
        }
    }
}

module.exports = DBManager;
