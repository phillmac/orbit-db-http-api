class DBManager {
    constructor(orbitdb){
        let _dbs = {};

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
                await db.load();
                console.log(`Loaded db ${db.dbname}`);
                _dbs[db.dbname] = db;
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

        this.db_info = (dbn) => {
            let db = find_db(dbn);
            if (!db) return {};
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
                type: db.type,
                uid: db.uid,
                indexLength: db.index.length || Object.keys(db.index).length,
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
    }
}

module.exports = DBManager;
