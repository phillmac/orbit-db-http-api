const Hapi  = require('hapi');
const Boom  = require('boom');
const Http2 = require('http2');
const Susie = require('susie');



class OrbitdbAPI {
    constructor (dbm, server_opts) {
        let comparisons, rawiterator, getraw, unpack_contents, listener;
        let dbMiddleware, ErrorHandler, asyncMiddleware;

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
                    .catch((err) => ErrorHandler(err, h));
        };

        asyncMiddleware = fn =>
            (request, h) => Promise.resolve(fn(request, h))
                .catch((err) => ErrorHandler(err, h));

        ErrorHandler = (err, _h) => {
            console.error(err);
            return Boom.badImplementation();
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

        Promise.resolve(this.server.register(Susie)).catch((err) => {throw err});
        this.server.route([
            {
                method: 'GET',
                path: '/dbs',
                handler: (_request, h) => {
                    try {
                        return dbm.db_list();
                    } catch(err) {
                        return ErrorHandler(err, h);
                    }
                }
            },
            {
                method: ['POST', 'PUT'],
                path: '/db',
                handler: asyncMiddleware( async (request, _h) => {
                    let db, payload;
                    payload = request.payload;
                    db = await dbm.get(payload.dbname, payload);
                    return dbm.db_info(db.dbname);
                })
            },
            {
                method: ['POST', 'PUT'],
                path: '/db/{dbname}',
                handler: asyncMiddleware( async (request, _h) => {
                    let db;
                    db = await dbm.get(request.params.dbname, request.payload);
                    return dbm.db_info(db.dbname);
                })
            },
            {
                method: 'GET',
                path: '/db/{dbname}',
                handler: (request, h) => {
                    try {
                       return dbm.db_info(request.params.dbname);
                    } catch(err) {
                        return ErrorHandler(err, h);
                    }
                }
            },
            {
                method: 'DELETE',
                path: '/db/{dbname}',
                handler: asyncMiddleware( async (request, _h) => {
                    await dbm.db_list_remove(request.params.dbname);
                    return {};
                })
            },
            {
                method: 'DELETE',
                path: '/db/{dbname}/{item}',
                handler: dbMiddleware( async (db, request, _h) => {
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
                    return {hash: await db.inc(parseInt(request.payload.val || 1))};
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
                method: 'GET',
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
                handler: (_request, h) => {
                    try {
                        return dbm.identity()
                    } catch(err) {
                        return ErrorHandler(err, h);
                    }
                }
            },
            {
                method: ['POST', 'PUT'],
                path: '/db/{dbname}/access/write',
                handler: dbMiddleware( async (db, request, _h) => {
                    await db.access.grant('write', request.payload.publicKey)
                    return {};
                })
            },
            {
                method: 'GET',
                path: '/db/{dbname}/events/{eventname}',
                handler: dbMiddleware( async (db, request, h) => {
                    let eventname = request.params.eventname
                    switch (eventname) {
                        case 'replicated':
                            db.events.on('replicated', (address) =>
                                h.event({type:'replicated',address:address}));
                            break;
                        case 'replicate.progress':
                            db.events.on('replicate.progress', (address, hash, entry, progress, have) =>
                                h.event({type:'replicate.progress',address:address, hash:hash, entry:entry, progress:progress, have:have}));
                            break;
                        case 'load':
                            db.events.on('load', (dbname) => h.event({type:'load', dbname:dbname}));
                            break;
                        case 'load.progress':
                            db.events.on('load.progress', (address, hash, entry, progress, total) =>
                                h.event({type:'load.progress',address:address, hash:hash, entry:entry, progress:progress, total:total}));
                            break;
                        case 'ready':
                            db.events.on('ready', (dbname, heads) => h.event({type:'ready',dbname:dbname, heads:heads}));
                            break;
                        case 'write':
                            db.events.on('write', (dbname, hash, entry) => h.event({type:'write',dbname:dbname, hash:hash, entry:entry}));
                            break;
                        case 'closed':
                            db.events.on('closed', (dbname) => h.event({type:'closed', dbname:dbname}));
                            break;
                    }
                    setInterval(h.event({type:'keep-alive'}, 10000))

                    return h.event({type:'registered', eventname:eventname})
                })
            }
        ]);
    }
}

module.exports = OrbitdbAPI
