const Logger = require('js-logger')

class DBManager {
  constructor (orbitdb,  peerMan) {
    const dbs = {}

    const findDB = (dbn) => {
      let result
      if (dbn in dbs) return dbs[dbn]
      for (const db of Object.values(dbs)) {
        if (dbn === db.id) {
          result = db
          break
        } else if (dbn === [db.address.root, db.address.path].join('/')) {
          result = db
          break
        }
      };
      return result
    }

    this.get = async (dbn, params) => {
      let db = findDB(dbn)
      if (db) {
        return db
      } else {
        Logger.info(`Opening db ${dbn}`)
        db = await orbitdb.open(dbn, params)
        Logger.info(`Loading db ${dbn}`)
        await db.load()
        Logger.info(`Loaded db ${db.dbname}`)
        dbs[db.dbname] = db
        return db
      }
    }

    this.dbRemove = async (dbn) => {
      const db = findDB(dbn)
      if (db) {
        await db.close()
        delete dbs[db.dbname]
        peerMan.removeDB(db)
        Logger.info(`Unloaded db ${db.dbname}`)
      }
    }

    this.dbs = () => Object.values(dbs)

    this.dbList = () => Object.keys(dbs).map((dbn) => dbInfo(dbn))

    const dbWrite = (db) => {
      return (
        db.access.write ||
                (typeof db.access.get === 'function' && db.access.get('write')) ||
                db.access._options.write ||
                'unavaliable'
      )
    }

    this.dbWrite = (dbn) => {
      const db = findDB(dbn)
      if (!db) return {}
      return dbWrite(db)
    }

    const dbInfo = (dbn) => {
      const db = findDB(dbn)
      if (!db) return {}
      const write = dbWrite(db)
      const dbPeers = peerMan.getDBPeers(db)
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
          replicate: db.options.replicate
        },
        canAppend: write.includes(orbitdb.identity.id),
        write: write,
        type: db.type,
        uid: db.uid,
        indexLength: db.index.length || Object.keys(db.index).length,
        accessControlerType: db.access.type || 'custom',
        peers: dbPeers,
        peerCount: dbPeers.length,
        capabilities: Object.keys( // TODO: cleanup this mess once tc39 object.fromEntries aproved
          Object.assign({}, ...Object.entries({
            add: typeof db.add === 'function',
            get: typeof db.get === 'function',
            inc: typeof db.inc === 'function',
            iterator: typeof db.iterator === 'function',
            put: typeof db.put === 'function',
            query: typeof db.query === 'function',
            remove: typeof (db.del || db.remove) === 'function',
            value: typeof db.value === 'function'
          }).filter(([k, v]) => v).map(([k, v]) => ({ [k]: v }))
          )
        )
      }
    }

    this.dbInfo = dbInfo

    this.identity = () => {
      return orbitdb.identity
    }
  }
}

module.exports = DBManager
