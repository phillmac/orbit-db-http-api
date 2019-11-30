module.exports = function (dbMan) {
  return fn =>
    async (request, h) => {
      const db = await dbMan.get(request.params.dbname)
      return Promise.resolve(fn(db, request, h))
        .catch((err) => { throw err })
    }
}
