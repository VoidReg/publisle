# Compiler recipe

The Dockerfile pins Ubuntu noble-20250127 by its OCI index digest and uses the
Ubuntu apt snapshot at 2025-03-01. Runtime export uses the locally built image's
immutable `sha256` ID, with `--pull=never` and no runtime network. Setup is explicit.

`cacert.pem` is the Mozilla CA bundle distributed by https://curl.se/ca/cacert.pem,
retained to bootstrap HTTPS apt on the minimal base. Its SHA-256 is
`a41b5d356aea97a529fe27e0f7316d2f9d946d75927476cf9cf1b90637d00505`.
Original certificate notices are retained; Mozilla CA data is under MPL 2.0.

Native tools remain supported and are checked before auto selects them. Container
installation is not part of document import or export and does not modify source.
