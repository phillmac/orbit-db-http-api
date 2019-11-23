
module.exports = function (managers) => {[
  {
    method:['PUT','POST'],
    path: '/sessions/{sessionId}',
    handler: (request,_h) => managers.get('sessionManager').addSession(request.params.sessionId)
  }
]}
