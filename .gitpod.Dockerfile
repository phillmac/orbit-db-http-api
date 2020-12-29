FROM gitpod/workspace-full

USER root

RUN mkdir -p /usr/local/share/ca-certificates/extra && chown gitpod:gitpod /usr/local/share/ca-certificates/extra

USER gitpod
