
module.exports = function (managers, _options, _logger) {
  const sessMan = managers.sessionManager

  return [
    {
      method: ['PUT', 'POST'],
      path: '/sessions/{sessionId}',
      handler: (request, _h) => sessMan.register(request.params.sessionId)
    },
    {
      method: 'DELETE',
      path: '/sessions/{sessionId}',
      handler: (request, _h) => sessMan.unregister(request.params.sessionId)
    }
  ]
}
