<div align="center">
<h1>Minecraft Tintable Model Generator</h1>

Automatically generate tintable Minecraft item models from any texture.

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen)](https:/globexix.github.io/minecraft-tintable-model-generator/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Minecraft Version](https://img.shields.io/badge/Minecraft-1.21.4--1.21.9-blue.svg)](https://minecraft.net/)
</div>

## What it does

Upload a texture -> get ready-to-use tintable item model. No manual Blockbench work.

- Automatic color detection
- Complete model JSON with `tintindex` values
- Item override structure for 1.21.4+
- NBT color arrays for commands
- White pattern texture export

## Usage

1. [Open the tool](https:/globexix.github.io/minecraft-tintable-model-generator/)
2. Upload your texture (16x16 to 128x128)
3. Adjust color tolerance if needed
4. Download files and add to your resource pack, or download generated resourcepack

<div align="center">
  <img src="demo.gif" alt="Demo GIF" width="600">
</div>

## Files generated

- `model.json` - The tintable model
- `override.json` - Item override structure  
- `pattern.png` - White base texture
- NBT array for commands

## Requirements

- Minecraft 1.21.4+
- Resource Pack Format 44+
- Works with any item that supports tinting