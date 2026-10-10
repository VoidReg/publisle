# Base and OS packages are frozen independently of the upstream TeX distribution.
FROM ubuntu@sha256:72297848456d5d37d1262630108ab308d3e9ec7ed1c3286a32fe09856619a782
ARG TARGETARCH
COPY cacert.pem /etc/ssl/certs/ca-certificates.crt
RUN set -eu; \
    case "$TARGETARCH" in amd64) archive=ubuntu ;; arm64) archive=ubuntu ;; *) exit 1 ;; esac; \
    rm -f /etc/apt/sources.list.d/ubuntu.sources; \
    printf 'deb https://snapshot.ubuntu.com/%s/20250301T000000Z noble main universe\ndeb https://snapshot.ubuntu.com/%s/20250301T000000Z noble-updates main universe\ndeb https://snapshot.ubuntu.com/%s/20250301T000000Z noble-security main universe\n' "$archive" "$archive" "$archive" > /etc/apt/sources.list; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl perl xz-utils fontconfig fonts-paktype; \
    rm -rf /var/lib/apt/lists/*
COPY install-texlive.sh /tmp/install-texlive.sh
RUN sh /tmp/install-texlive.sh "$TARGETARCH" && rm /tmp/install-texlive.sh
ENV PATH="/opt/texlive/bin/platform:${PATH}"
RUN tlmgr install latexmk tex-gyre tex-gyre-math fandol luahbtex luaotfload luatexbase lualibs luamml unicode-math tagpdf latex-lab pdfmanagement-testphase ulem natbib cite ieeetran elsarticle acmart xstring totpages environ trimspaces framed hyperxmp draftwatermark ncctools comment preprint pbalance libertine newtx inconsolata sttools threeparttable appendix breakurl wrapfig vruler && \
    fc-cache -f /opt/texlive/texmf-dist/fonts/opentype && luaotfload-tool --update
RUN tlmgr install ifmtarg lualatex-math luacode upquote
WORKDIR /work
