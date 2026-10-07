# Host-owned Three.js scene

This private example package demonstrates a user-defined interactive block. It
is not a Publisle built-in: the host registers `sceneDefinition` and provides the
React or Svelte renderer for `demo:interactive-scene`. Three.js is a dependency
only of this example package. The definition entry point does not import it;
the browser renderer loads through the activated island.

The payload contains `background`, `camera`, `lights`, `objects`, and `controls`.
Objects have stable IDs, names, procedural geometry, position, rotation in
radians, scale, and material color/roughness/metalness. Colors use `#rrggbb`.
Box dimensions are width/height/depth, sphere uses the first dimension as its
radius, and cylinder dimensions are top radius/bottom radius/height. Camera
field of view is in degrees. Controls independently enable orbit, pan, zoom,
selection and reset; selection highlights an object and exposes its JSON.

Use the playground's payload editor to persist scene changes. Camera movement
and selection are transient viewer state. Export Markdown includes the entire
scene payload, with readable or compact JSON. No external assets are fetched.
The static fallback remains available before activation and in print; if WebGL
fails, the object buttons still expose scene properties.
