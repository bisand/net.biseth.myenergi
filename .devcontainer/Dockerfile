# See here for image contents: https://github.com/microsoft/vscode-dev-containers/tree/v0.245.2/containers/alpine/.devcontainer/base.Dockerfile

# [Choice] Alpine version: 3.16, 3.15, 3.14, 3.13
ARG VARIANT="3.16"
FROM mcr.microsoft.com/vscode/devcontainers/base:0-alpine-${VARIANT}

# ** [Optional] Uncomment this section to install additional packages. **
RUN apk update \
    && apk add --no-cache nodejs npm

# Install Homey cli
RUN npm install --global --no-optional homey


USER vscode
RUN alias ll='ls -halF --color=auto'

# Use this as a base for opening container in external terminal
# alias docker-devcontainer='docker exec -it -w /workspace --env-file="$(pwd)/.devcontainer/container.env" $(docker ps --filter "name=$(basename $(pwd))_devcontainer_app" --format "{{.ID}}") zsh'
# See https://github.com/microsoft/vscode/issues/110050

CMD [ "sleep", "infinity" ]
