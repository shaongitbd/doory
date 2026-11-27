# MCP vector artwork samples

## What it does

An MCP client can draw original artwork with `add_vector` in `edit_design`. Each design below has a PNG
preview and an SVG download so you can inspect the exported curves, fills, and strokes.

| Artwork | PNG preview | SVG |
| --- | --- | --- |
| Leaf | <img src="vector-01-leaf.png" alt="Leaf artwork" width="240"> | [Download SVG](vector-01-leaf.svg) |
| Sailboat | <img src="vector-02-sailboat.png" alt="Sailboat artwork" width="240"> | [Download SVG](vector-02-sailboat.svg) |
| Midnight skyline | <img src="vector-03-midnight-skyline.png" alt="Midnight skyline artwork" width="240"> | [Download SVG](vector-03-midnight-skyline.svg) |
| Owl crest | <img src="vector-04-owl-crest.png" alt="Owl crest artwork" width="240"> | [Download SVG](vector-04-owl-crest.svg) |
| Koi lotus | <img src="vector-05-koi-lotus.png" alt="Koi lotus artwork" width="240"> | [Download SVG](vector-05-koi-lotus.svg) |
| Lunar moth | <img src="vector-06-lunar-moth.png" alt="Lunar moth artwork" width="240"> | [Download SVG](vector-06-lunar-moth.svg) |
| Alpine observatory | <img src="vector-07-alpine-observatory.png" alt="Alpine observatory artwork" width="240"> | [Download SVG](vector-07-alpine-observatory.svg) |

## Requirements

To draw and export your own artwork from an MCP client, enable the MCP server and server-side export.
Use a token with **Edit designs** and **Read designs** permissions. [MCP server setup](../self-hosting/mcp.md)

## Check it works

Send the sample `add_vector` request to `edit_design` with your design ID. Call `export_design` with
`format: "png"` for a preview and `format: "svg"` for a download link.
[Sailboat request example](../self-hosting/mcp.md#what-assistants-can-do)
