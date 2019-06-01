# OrbitDB HTTP API Server

[![Gitter](https://img.shields.io/gitter/room/nwjs/nw.js.svg)](https://gitter.im/orbitdb/orbit-db-http-api)
[![npm version](https://badge.fury.io/js/orbit-db-http-api.svg)](https://www.npmjs.com/package/orbit-db-http-api)
[![node](https://img.shields.io/node/v/orbit-db-http-api.svg)](https://www.npmjs.com/package/orbit-db-http-api)

> An HTTP API Server for the OrbitDB distributed peer-to-peer database.

**Table of Contents**

- [Install](#install)
- [Setup](#setup)
- [API](#api)
  - [GET /dbs](#get-dbs)
  - [GET /db/:dbname](#get-dbdbname)
  - [GET /db/:dbname/value](#get-dbdbnamevalue)
  - [GET /db/:dbname/query](#get-dbdbnamequery)
    - [Modulus Query](#modulus-query)
    - [Range Query](#range-query)
  - [GET /db/:dbname/:item](#get-dbdbnameitem)
  - [GET /db/:dbname/iterator](#get-dbdbnameiterator)
  - [GET /db/:dbname/index](#get-dbdbnameindex)
  - [GET /identity](#get-identity)
  - [POST /db/:dbname](#post-dbdbname)
  - [POST|PUT /db/:dbname/add](#post-put-dbdbnameadd)
  - [POST|PUT /db/:dbname/put](#post-put-dbdbnameput)
  - [POST|PUT /db/:dbname/inc](#post-put-dbdbnameinc)
  - [POST|PUT /db/:dbname/inc/:val](#post-put-dbdbnameincval)
  - [DELETE /db/:dbname](#delete-dbdbname)
  - [DELETE /db/:dbname/:item](#delete-dbdbnameitem)
- [Contribute](#contribute)
- [License](#license)

## Install

To install the OrbitDB HTTP Client:

```shell
git clone https://github.com/orbitdb/orbit-db-http-api.git
cd orbit-db-api
npm install
```

## Setup

The OrbitDB HTTP Client can be run in two modes; local or api.

In local mode, OrbitDB HTTP Client will launch its own IPFS node to replicate
the OrbitDB peer:

```shell
node src/cli.js local --orbitdb-dir /path/to/orbitdb --https-cert ./my.crt --https-key my.key
```

where --orbitdb-dir is the path to your OrbitDB peer.

In api mode, OrbitDB HTTP Client will connect to an existing IPFS node to
replicate the OrbitDB peer:

```shell
node src/cli.js api --ipfs-host localhost --orbitdb-dir /path/to/orbitdb --https-cert ./my.crt --https-key my.key
```

where --ipfs-host is an external IPFS node and --orbitdb-dir is the path to
your OrbitDB peer.

In both modes, you will also need to specify an SSL certifcate and private key:

--https-cert will be the path to your certificate.
--https-key will be the path to your associated private key.

You can generate an SSL certificate using an SSL certificate authority such as
Let's Encrypt. Alternatively, you can create your own self-signed certificate
although this is highly discouraged for production environments.

When using a self-signed SSL certificate you will either need to add your
certificate to your CA list or pass the ```-k``` option to curl, telling curl to
ignore the the insecure connection.

## API

### GET /dbs

Lists all databases on the current peer.

```shell
curl http://localhost:3000/dbs
```

```json
{"docstore":{"address":{"root":"zdpuAmnfJZ6UTssG5Ns3o8ALXZJXVx5eTLTxf7gfFzHxurbJq","path":"docstore"},"dbname":"docstore","id":"/orbitdb/zdpuAmnfJZ6UTssG5Ns3o8ALXZJXVx5eTLTxf7gfFzHxurbJq/docstore","options":{"create":"true","indexBy":"_id","localOnly":false,"maxHistory":-1,"overwrite":true,"replicate":true},"type":"docstore"},"feed":{"address":{"root":"zdpuAo6DwafMiyuzhfEojXJThFPdv4Eu9hLfaWrKD6GSVzyjj","path":"feed"},"dbname":"feed","id":"/orbitdb/zdpuAo6DwafMiyuzhfEojXJThFPdv4Eu9hLfaWrKD6GSVzyjj/feed","options":{"create":"true","localOnly":false,"maxHistory":-1,"overwrite":true,"replicate":true},"type":"feed"}}
```

### GET /db/:dbname

Gets the details of a database with name :dbname.

Returns information about the database as a JSON object.

```shell
curl http://localhost:3000/db/docstore
```

```json
{"address":{"root":"zdpuAmnfJZ6UTssG5Ns3o8ALXZJXVx5eTLTxf7gfFzHxurbJq","path":"docstore"},"dbname":"docstore","id":"/orbitdb/zdpuAmnfJZ6UTssG5Ns3o8ALXZJXVx5eTLTxf7gfFzHxurbJq/docstore","options":{"create":"true","indexBy":"_id","localOnly":false,"maxHistory":-1,"overwrite":true,"replicate":true},"type":"docstore"}
```

### GET /db/:dbname/value

Gets the current value from counter database :dbname.

Returns the current counter value.

Can only be used on counter.

```shell
curl -X GET http://localhost:3000/db/counter/value
```

```json
1
```

### GET /db/:dbname/query

Queries the database :dbname.

Returns a list of found items as a JSON array.

```shell
curl http://localhost:3000/db/docstore/query -X GET -H "Content-Type: application/json" --data '{"values":[]}'
```

```json
[{"project":"OrbitDB","site":"https://github.com/orbitdb/orbit-db","likes":200},{"project":"IPFS","site":"https://ipfs.io","likes":400}]
```

To query a subset of data, a condition can be specified. For example, to
retrieve only those entries which have a total number of likes above 300:

```shell
curl http://localhost:3000/db/docstore/query -X GET -H "Content-Type: application/json" --data '{"propname":"likes","comp":">","values":[300]}'
```

```json
[{"project":"IPFS","site":"https://ipfs.io","likes":400}]
```

Available operator short-codes are:

```eq```    propname equals value. Equivalent to "=="

```ne```    propname is not equals to value. Equivalent to "!="

```gt```    propname is greater than value. Equivalent to ">"

```lt```    propname is less than value. Equivalent to "<"

```gte```   propname is greater than or equal to value. Equivalent to ">="

```lte```   propname is less than or equal to value. Equivalent to "<="

```mod```   Perform a modulus calculation on propname using value. Equivalent to "%"

```range``` Perform a range query, comparing propname to min and max.

```all```   Fetch all records for field propname. Equivalent to "*"

#### Modulus Query

When using a modulus query, you must supply the divisor and the remainder. For example, to obtain all likes which are multiples of 100, you would specify a divisor 100 and a remainder 0:

```shell
curl -X GET http://localhost:3000/db/docstore/query -H "Content-Type:application/json" --data '{"propname":"likes", "comp":"mod", "values":[100,0]}'
```

```json
[{"site":"https://ipfs.io","likes":400,"project":"IPFS"},{"site":"https://github.com/orbitdb/orbit-db","likes":200,"project":"OrbitDB"}]
```

#### Range Query

When specifying a range query, you must supply the min and max
values. For example, to obtain all likes greater than 250 but less than 1000 the min and max must be supplied:

```shell
curl -X GET http://localhost:3000/db/docstore/query -H "Content-Type:application/json" --data '{"propname":"likes", "comp":"range", "values":[250,1000]}'
```

```json
[{"site":"https://ipfs.io","likes":400,"project":"IPFS"},{"site":"https://github.com/orbitdb/orbit-db","likes":200,"project":"OrbitDB"}]
```

### GET /db/:dbname/:item

Gets a record identified by :item from the database :dbname.

Returns a list of found items as a JSON array.

For the data type docstore, :item must be a value identified by the index field (set using indexBy).

```shell
curl -X GET http://localhost:3000/db/docstore/1
```

```json
[{"_id":1, "value": "test"}]
```

### GET /db/:dbname/iterator

Gets items from an eventlog or feed database :dbname.

Returns a list of matching objects as a JSON array.

Can only be used on eventlog|feed.

```shell
curl -X GET http://localhost:3000/db/feed/iterator
```

```json
[{"IPFS":"https://ipfs.io"}]
```

Additional options can be passed to OrbitDB to return different entries.

```shell
curl -X GET http://localhost:3000/db/feed/iterator -d 'limit=-1'
```

```json
[{"OrbitDB":"https://github.com/orbitdb/orbit-db"},{"IPFS":"https://ipfs.io"}]
```

See [OrbitDB's Iterator API](https://github.com/orbitdb/orbit-db/blob/master/API.md#iteratoroptions-1)
for more information.

### GET /db/:dbname/index

Gets information about the data stored in :dbname.

Returns information about the data stored as a JSON object.

For the data store keyvalue all records are returned:

```shell
curl -X GET http://localhost:3000/keyvalue/index
```

```json
{"Key":{"name1":"Value1"},"Key2":{"name":"Value2"}}
```

Docstore and feed return all records as well as iterators, signature hashes and
other information about the stored data:

```json
{"1":{"cid":"zdpuB1sqnXKwgAtJT7vqtrRUsyr4XUZyhume9uJgrrwZmyegu","id":"/orbitdb/zdpuAzpw8yuuMEuffMFcgXafsAye9GqBPwTjmiJijHz3akFhx/docstore","payload":{"op":"PUT","key":1,"value":{"_id":1,"name":"1"}},"next":[],"v":1,"clock":...}}
```

The eventlog returns the hash of the last stored item:

```json
{"id":"/orbitdb/zdpuB1r3rfya65UUjQu6GsBXEmp5gmjvMwRGwkxd4ySwYnBSK/eventlog","heads":["zdpuAu7eTsdWoQ76CdWCbjcsGV3s6duYyUujaHQiGCAZPLWMb"]}
```

The counter data store returns information about the current counter value:

```json
{"id":"04e6de9dd0e8d0069bcc6d8f3ef11cefe63bba6129c32f2cd422a0394814bc6723b26eb62731ee466020b0394d01dd08e4a5123eaad45e4d0840fd796652a22e42","counters":{"04e6de9dd0e8d0069bcc6d8f3ef11cefe63bba6129c32f2cd422a0394814bc6723b26eb62731ee466020b0394d01dd08e4a5123eaad45e4d0840fd796652a22e42":15}}
```

### GET /identity

Gets the identity information.

Returns identity as a JSON object.

```shell
curl -X GET http://localhost:3000/identity
```

```json
{"id":"03fc293ea95bdb5dea71d5d21cbbae2a57f2d2002c9966f0d5c7b0bda232d5934d","publicKey":"048161d9685991dc87f3e049aa04b1da461fdc5f8a280ed6234fa41c0f9bc98a1ce91f07494584a45b97160ac818e100a6b27777e0b1b09e6ba4795dcc797a6d8b","signatures":{"id":"3045022100e40ab2dcc83dde17c939d5515ce322e7f81bf47536ab342582db8c35f28d2a720220228e418cc3d2f3e0004d5f4292c0d2cf7975c93073e0cc831f0cb849e4ac920a","publicKey":"3045022100ad18ba66006e19e2952eabc9ffb532dd69d60593f90448a05d6f4903c2931e3502204009975030b839522c668cd693d357bf1f3d0423d604a6bc10645425a0a3dd1b"},"type":"orbitdb"}
```

### POST /db/:dbname

Creates a new database and returns information about the newly created database
or opens an existing database with the same name.

Returns information about the database as a JSON object.

The OrbitDB options ```create=true``` and ```type=eventlog|feed|docstore|keyvalue|counter```
must be sent with the POST otherwise an error is thrown.

```shell
curl http://localhost:3000/db/docstore -d "create=true" -d "type=docstore"
```

```json
{"address":{"root":"zdpuAmnfJZ6UTssG5Ns3o8ALXZJXVx5eTLTxf7gfFzHxurbJq","path":"docstore"},"dbname":"docstore","id":"/orbitdb/zdpuAmnfJZ6UTssG5Ns3o8ALXZJXVx5eTLTxf7gfFzHxurbJq/docstore","options":{"create":"true","indexBy":"_id","localOnly":false,"maxHistory":-1,"overwrite":true,"replicate":true},"type":"docstore"}
```

Additional OrbitDB-specific flags can also be passed. For example, if the index
field must be changed then the indexBy flag can be specified as an additional
POST param (this would apply to type docstore only):

```shell
curl http://localhost:3000/db/docstore -d "create=true" -d "type=docstore" -d "indexBy=name"
```

Parameters can also be passed as JSON. This is useful if additional parameters
such as accessController need to be specified:

```shell
curl -H "Content-Type: application/json" --data '{"create":"true","type":"feed","accessController":{"type": "orbitdb","write": ["1234"]}}'
```

To open an existing database, specify the address of the database. If the
database does not exist locally it will be fetched from the swarm.

The address MUST be URL escaped.

```shell
curl -X POST http://localhost:3000/db/zdpuAmnfJZ6UTssG5Ns3o8ALXZJXVx5eTLTxf7gfFzHxurbJq%2Fdocstore
```

By default, OrbitDB will open the database if one already exists with the same
name. To always overwrite the existing database with a new one, pass the
overwrite flag:

```shell
curl http://localhost:3000/db/docstore -d "create=true" -d "type=docstore" -d "overwrite=true"
```

### POST|PUT /db/:dbname/add

Adds a new entry to the eventlog or feed database :dbname.

Returns the multihash of the new record entry.

Can only be used on eventlog|feed

```shell
curl -X POST http://localhost:3000/db/feed/add -d 'feed-item-1'
```

```json
zdpuArB1ZQUQGGpZgJrhy6xyxwxMCE898kDrQW2x6KbnRNbAn
```

### POST|PUT /db/:dbname/put

Puts a record to the database :dbname.

Returns a multihash of the record entry.

```shell
curl -X POST http://localhost:3000/db/docstore/put -H "Content-Type: application/json" -d '{"_id":1, "value": "test"}'
```

```json
zdpuAkkFaimxyRE2bsiLRSiybkku3oDi4vFHqPZh29BABZtZU
```

For the keyvalue store, a JSON object containing the variables `key` and
`value` must be passed in the POST data:

```shell
curl -X POST http://localhost:3000/db/keyvalue/put  -H "Content-Type: application/json" -d '{"key":"Key","value":{ "name": "Value" }}'
```

### POST|PUT /db/:dbname/inc

Increments the counter database :dbname by 1.

Returns a multihash of the new counter value.

```shell
curl -X POST http://localhost:3000/db/counter/inc
```

```json
zdpuAmHw9Tcc4pyVjcVX3rJNJ7SGffmu4EwjodzmaPBVGGzbd
```

### POST|PUT /db/:dbname/inc/:val

Increments the counter database :dbname by :val.

Returns a multihash of the new counter value.

```shell
curl -X POST http://localhost:3000/db/counter/inc/100
```

```json
zdpuAmHw9Tcc4pyVjcVX3rJNJ7SGffmu4EwjodzmaPBVGGzbd
```

### DELETE /db/:dbname

Deletes the local database :dbname. This does not delete any data from peers.

```shell
curl -X DELETE http://localhost:3000/db/docstore
```

### DELETE /db/:dbname/:item

Deletes the item specified by :item from the database :dbname.

Returns the multihash of the item entry deleted or an error if no item is found.

```shell
curl -X DELETE http://localhost:3000/db/docstore/1
```

```json
zdpuB39Yv1LV6CMYuNUgRi125utDpUoiP7PDsumjn1T4ASkzN
```

## Contribute

We would be happy to accept PRs! If you want to work on something, it'd be good to talk beforehand to make sure nobody else is working on it. You can reach us [on Gitter](https://gitter.im/orbitdb/Lobby), or in the [issues section](https://github.com/orbitdb/orbit-db-http-api/issues).

We also have **regular community calls**, which we announce in the issues in [the @orbitdb welcome repository](https://github.com/orbitdb/welcome/issues). Join us!

If you want to code but don't know where to start, check out the issues labelled ["help wanted"](https://github.com/orbitdb/orbit-db-http-api/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22+sort%3Areactions-%2B1-desc).

For specific guidelines for contributing to this repository, check out the [Contributing guide](CONTRIBUTING.md). For more on contributing to OrbitDB in general, take a look at the [@OrbitDB welcome repository](https://github.com/orbitdb/welcome). Please note that all interactions in [@OrbitDB](https://github.com/orbitdb) fall under our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © 2019 phillmac
