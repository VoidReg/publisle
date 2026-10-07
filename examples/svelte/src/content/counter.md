---
title: Interactive Counter
description: A portable counter.
---

# Interactive Counter

:::interactive{type="publisle:interactive-schematic" schemaVersion="2" activation="interaction" label="Interactive clocked counter"}
:::title
Clocked counter
:::

:::description
Observe the output on each clock edge.
:::

:::fallback
The counter starts at zero.
:::

```publisle-payload
{ "source": "./counter.json" }
```

:::

::::interactive{#375a6c0a-4887-4c5b-ab1f-707308b81610 type="demo:interactive-scene" schemaVersion="1" activation="interaction"}
:::title
Explore a 3D scene
:::

:::instructions
Drag to orbit, scroll to zoom, or select a named object. Reset View restores the camera.
:::

:::fallback
A blue box at (-2, 0, 0), an orange sphere at (0, 0, 0), and a green cylinder at (2, 0, 0).
:::

```publisle-payload
{
  "background": "#162033",
  "camera": {
    "position": [
      6,
      4,
      8
    ],
    "target": [
      0,
      0,
      0
    ],
    "fov": 45
  },
  "lights": {
    "ambient": {
      "color": "#ffffff",
      "intensity": 1.5
    },
    "directional": {
      "color": "#ffffff",
      "intensity": 3,
      "position": [
        3,
        5,
        4
      ]
    }
  },
  "objects": [
    {
      "id": "box",
      "name": "Blue box",
      "geometry": {
        "type": "box",
        "dimensions": [
          1.4,
          1.4,
          1.4
        ]
      },
      "position": [
        -2,
        0,
        0
      ],
      "rotation": [
        0,
        0.3,
        0
      ],
      "scale": [
        1,
        1,
        1
      ],
      "material": {
        "color": "#4488ff",
        "roughness": 0.5,
        "metalness": 0.1
      }
    },
    {
      "id": "sphere",
      "name": "Orange sphere",
      "geometry": {
        "type": "sphere",
        "dimensions": [
          0.85,
          0.85,
          0.85
        ]
      },
      "position": [
        0,
        0,
        0
      ],
      "rotation": [
        0,
        0,
        0
      ],
      "scale": [
        1,
        1,
        1
      ],
      "material": {
        "color": "#ff9944",
        "roughness": 0.5,
        "metalness": 0.1
      }
    },
    {
      "id": "cylinder",
      "name": "Green cylinder",
      "geometry": {
        "type": "cylinder",
        "dimensions": [
          0.65,
          0.65,
          1.8
        ]
      },
      "position": [
        2,
        0,
        0
      ],
      "rotation": [
        0,
        0,
        0
      ],
      "scale": [
        1,
        1,
        1
      ],
      "material": {
        "color": "#44cc99",
        "roughness": 0.5,
        "metalness": 0.1
      }
    }
  ],
  "controls": {
    "orbit": true,
    "pan": true,
    "zoom": true,
    "selection": true,
    "reset": true
  }
}
```

::::
