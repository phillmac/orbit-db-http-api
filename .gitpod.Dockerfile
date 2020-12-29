FROM gitpod/workspace-full

USER root

RUN chown gitpod:gitpod /usr/local/share/ca-certificates /etc/ssl/certs

USER gitpod
