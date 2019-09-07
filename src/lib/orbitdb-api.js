const Hapi  = require('hapi');
const Boom  = require('boom');
const Http2 = require('http2');
const Susie = require('susie');

require('events').EventEmitter.defaultMaxListeners = 50  //Set warning higher then normal to handle many clients

class OrbitdbAPI {
    constructor (dbm, server_opts) {
        let comparisons, rawiterator, getraw, unpack_contents, listener;
        let dbMiddleware, addEventListener;

        listener = Http2.createSecureServer(server_opts.http2_opts);
        this.server = new Hapi.Server({
            listener,
            tls: true,
            port: server_opts.api_port});

        comparisons = {
            'ne': (a, b) => a != b,
            'eq': (a, b) => a == b,
            'gt': (a, b) => a > b,
            'lt': (a, b) => a < b,
            'gte': (a, b) => a >= b,
            'lte': (a, b) => a <= b,
            'mod': (a, b, c) => a % b == c,
            'range': (a, b, c) => Math.max(b,c) >= a && a >= Math.min(b,c),
            'all': () => true
        };

        dbMiddleware = fn =>
            async (request, h) => {
                let db
                db = await dbm.get(request.params.dbname)
                return Promise.resolve((fn(db, request, h)))
                    .catch((err) => {throw err});
        };

        rawiterator = (db, request, _h) =>
            db.iterator(request.payload).collect();

        getraw = (db, request, _h) =>
            db.get(request.params.item);

        unpack_contents = (contents) => {
            if (contents){
                if (contents.map) {
                   return contents.map((e) => {
                        if (e.payload) return e.payload.value
                        return e
                    })
                } else if (contents.payload) {
                   return contents.payload.value
                }
            }
            return contents
        };

        addEventListener = (db, event_name, request, h) => {
            let event_map = new Map(Object.entries({
                'replicated': (address) =>
                    h.event({event:'replicated', data: {address:address}}),
                'replicate': (address) =>
                    h.event({event:'replicate', data: {address:address}}),
                'replicate.progress': (address, hash, entry, progress, have) =>
                    h.event({event:'replicate.progress', data: {address:address, hash:hash, entry:entry, progress:progress, have:have}}),
                'load': (dbname) =>
                    h.event({event:'load', data: {dbname:dbname}}),
                'load.progress': (address, hash, entry, progress, total) =>
                    h.event({event:'load.progress', data: {address:address, hash:hash, entry:entry, progress:progress, total:total}}),
                'ready': (dbname, heads) =>
                    h.event({event:'ready', data: {dbname:dbname, heads:heads}}),
                'write': (dbname, hash, entry) =>
                        h.event({event:'write', data: {dbname:dbname, hash:hash, entry:entry}}),
                'closed': (dbname) =>
                        h.event({event:'closed', data: {dbname:dbname}})
            }));

            let event_callback = event_map.get(event_name)
            if(event_callback){
                db.events.on(event_name, event_callback)
               let keepalive = setInterval(() => h.event({event:'keep-alive'}), 10000)
                request.events.on('disconnect', () => {
                    db.events.removeListener(event_name, event_callback)
                    clearInterval(keepalive)
                })
            } else {
                if(this.debug) throw Boom.badRequest(`Unrecognized event name: $(event_name)`)
                throw Boom.badRequest('Unrecognized event name')
            }
        }

        Promise.resolve(this.server.register(Susie)).catch((err) => {throw err});
        this.server.route([
            {
                method: 'GET',
                path: '/dbs',
                handler: (_request, _h) => dbm.db_list()
            },
            {
                method: ['POST', 'PUT'],
                path: '/db',
                handler: async (request, _h) => {
                    let db, payload;
                    payload = request.payload;
                    db = await dbm.get(payload.dbname, payload);
                    return dbm.db_info(db.dbname);
                }
            },
            {
                method: ['POST', 'PUT'],
                path: '/db/{dbname}',
                handler: async (request, _h) => {
                    let db;
                    db = await dbm.get(request.params.dbname, request.payload);
                    return dbm.db_info(db.dbname);
                }
            },
            {
                method: 'GET',
                path: '/db/{dbname}',
                handler: (request, _h) => dbm.db_info(request.params.dbname)
            },
            {
                method: 'DELETE',
                path: '/db/{dbname}',
                handler: async (request, _h) => {
                    await dbm.db_list_remove(request.params.dbname);
                    return {};
                }
            },
            {
                method: 'DELETE',
                path: '/db/{dbname}/{item}',
                handler: dbMiddleware (async (db, request, _h) => {
                    if (db.del) {
                        return {hash: await db.del(request.params.item)};
                    } else if (db.remove) {
                        return {hash: await db.remove(request.params.item)};
                    } else {
                        return Boom.methodNotAllowed(`DB type ${db.type} does not support removing data`,
                        {
                            dbname: db.dbname,
                            dbtype: db.type
                        });
                    }
                })
            },
            {
                method: ['POST', 'PUT'],
                path: '/db/{dbname}/put',
                handler: dbMiddleware( async (db, request, _h) => {
                    let params;
                    params = request.payload;

                    if (db.type == 'keyvalue') {
                        let key, value;
                        if (!params['key']) {
                            [key,value] = [Object.keys(params)[0], Object.values(params)[0]];
                        } else {
                            ({key,value} = params);
                        }
                        return {hash: await db.put(key, value)};
                    } else {
                        return {hash: await db.put(params)};
                    }
                })
            },
            {
                method: ['POST', 'PUT'],
                path: '/db/{dbname}/add',
                handler: dbMiddleware( async (db, request, _h) => {
                    return {hash: await db.add(request.payload)};
                })
            },
            {
                method: ['POST', 'PUT'],
                path: '/db/{dbname}/inc',
                handler: dbMiddleware( async (db, request, _h) => {
                    let incval
                    incval = parseInt(request.payload ? request.payload.val || 1 : 1);
                    return {hash: await db.inc(incval)};
                })
            },
            {
                method: ['POST', 'PUT'],
                path: '/db/{dbname}/inc/{val}',
                handler: dbMiddleware( async (db, request, _h) => {
                    return {hash: await db.inc(parseInt(request.params.val || 1))};
                })
            },
            {
                method: 'POST',
                path: '/db/{dbname}/query',
                handler: dbMiddleware( async (db, request, _h) => {
                    let qparams, comparison, query;
                    qparams = request.payload;
                    comparison = comparisons[qparams.comp || 'all'];
                    query = (doc) => comparison(doc[qparams.propname || '_id'], ...qparams.values);
                    return await db.query(query);
                })
            },
            {
                method: 'GET',
                path: '/db/{dbname}/iterator',
                handler:  dbMiddleware( async (db, request, h) => {
                    let raw;
                    raw = rawiterator(db, request, h);
                    return raw.map((e) => Object.keys(e.payload.value)[0]);

                })
            },
            {
                method: 'GET',
                path: '/db/{dbname}/rawiterator',
                handler: dbMiddleware( async (db, request, h) => {
                    return rawiterator(db, request, h);
                })
            },
            {
                method: 'GET',
                path: '/db/{dbname}/raw/{item}',
                handler: dbMiddleware( async (db, request, h) => {
                    return getraw(db, request, h);
                })
            },
            {
                method: 'GET',
                path: '/db/{dbname}/{item}',
                handler: dbMiddleware( async (db, request, h) => {
                    let raw;
                    raw = getraw(db, request, h);
                    return unpack_contents(raw);
                })
            },
            {
                method: 'GET',
                path: '/db/{dbname}/all',
                handler: dbMiddleware( async (db, _request, _h) => {
                    if (typeof db._query == 'function') {
                        let contents
                        contents = db._query({limit:-1})
                       return contents.map((e) => Object.keys(e.payload.value)[0])
                    } else {
                        return unpack_contents(db.all)
                    }
                })
            },
            {
                method: 'GET',
                path: '/db/{dbname}/index',
                handler: dbMiddleware( async (db, _request, _h) => db.index)
            },
            {
                method: 'GET',
                path: '/db/{dbname}/value',
                handler: dbMiddleware( async (db, _request, _h) => db.value)
           },
           {
                method: 'GET',
                path: '/identity',
                handler: (_request, _h) => dbm.identity()
            },
            {
                method: ['POST', 'PUT'],
                path: '/db/{dbname}/access/write',
                handler: dbMiddleware( async (db, request, _h) => {
                    await db.access.grant('write', request.payload.id)
                    return {};
                })
            },
            {
                method: 'GET',
                path: '/db/{dbname}/events/{eventname}',
                handler: dbMiddleware( async (db, request, h) => {
                    let events = request.params.eventname.split(',')
                    events.forEach((event_name) => addEventListener(db,event_name, request, h));
                    return h.event({event:'registered', data: {eventnames:events}})
                })
            },

        ]);
    }
}

module.exports = OrbitdbAPI
