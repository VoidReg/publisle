#!/bin/sh
set -eu
case "$1" in
  amd64) platform=x86_64-linux ;;
  arm64) platform=aarch64-linux ;;
  *) echo 'Unsupported TeX Live platform' >&2; exit 1 ;;
esac
repository=https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/2025/tlnet-final
installer_sha512=a307d7d11bcbd1f054ad0b0d476f7f12bc1a40d07445020edef8713b44453831d18a2f1722c3d2b0ea2e4fe6c06183a79d1c4049495113f412a9f5a570a8614d
database_sha512=2fb7adc54cff58fa55c5b7c1bd3034e1efd849d0b73535c8dcdf0d8a36f66998b7a578ae036ef24354641be5f3738b0ad1323b7318581d88a0e271d1ac12cb2b
stage=$(mktemp -d)
cd "$stage"
curl --fail --location --retry 3 "$repository/install-tl-unx.tar.gz" -o installer.tar.gz
printf '%s  installer.tar.gz\n' "$installer_sha512" | sha512sum --check -
curl --fail --location --retry 3 "$repository/tlpkg/texlive.tlpdb" -o texlive.tlpdb
printf '%s  texlive.tlpdb\n' "$database_sha512" | sha512sum --check -
tar -xzf installer.tar.gz --strip-components=1
cat > profile <<EOF
selected_scheme scheme-basic
TEXDIR /opt/texlive
TEXMFLOCAL /opt/texlive/texmf-local
TEXMFSYSCONFIG /opt/texlive/texmf-config
TEXMFSYSVAR /opt/texlive/texmf-var
TEXMFCONFIG /tmp/texmf-config
TEXMFVAR /tmp/texmf-var
TEXMFHOME /tmp/texmf-home
binary_$platform 1
collection-latexrecommended 1
collection-fontsrecommended 1
option_doc 0
option_src 0
option_path 0
EOF
perl ./install-tl -repository "$repository" -profile profile
# Preserve the pinned package database; TeX Live verifies archive checksums.
cp texlive.tlpdb /opt/texlive/tlpkg/frozen-source.tlpdb
ln -s "$platform" /opt/texlive/bin/platform
rm -rf "$stage"
