# Base image pinned by registry digest; apt packages frozen to Ubuntu snapshot.
FROM ubuntu@sha256:72297848456d5d37d1262630108ab308d3e9ec7ed1c3286a32fe09856619a782
COPY cacert.pem /etc/ssl/certs/ca-certificates.crt
RUN rm -f /etc/apt/sources.list.d/ubuntu.sources && printf 'deb https://snapshot.ubuntu.com/ubuntu/20250301T000000Z noble main universe\ndeb https://snapshot.ubuntu.com/ubuntu/20250301T000000Z noble-updates main universe\ndeb https://snapshot.ubuntu.com/ubuntu/20250301T000000Z noble-security main universe\n' > /etc/apt/sources.list && apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates latexmk texlive-publishers texlive-luatex texlive-latex-extra texlive-fonts-recommended texlive-lang-arabic texlive-lang-chinese fonts-paktype fonts-texgyre fonts-texgyre-math fontconfig && rm -rf /var/lib/apt/lists/*
RUN fc-cache -f /usr/share/texlive/texmf-dist/fonts/opentype/public/fandol && luaotfload-tool --update
WORKDIR /work
