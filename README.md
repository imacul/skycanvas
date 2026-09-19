# SkyCanvas

Agent-first design canvas and Figma bridge.

## Tonight's MVP
- Structured scene graph canvas
- Layer inspection
- local persistence
- design JSON export
- shareable design-link shape
- MCP server foundation for coding agents

## Run
```bash
npm install
npm run dev
```

MCP server:
```bash
npm run mcp
```

## Architecture
SkyCanvas documents remain structured rather than flattened. The web canvas renders the document; MCP exposes the same document to coding agents. Figma import/export is a bridge into this canonical scene graph rather than making Figma the database.

## Next
1. Figma clipboard/plugin importer
2. hosted document persistence and real /design/:id URLs
3. PNG screenshot endpoint + asset extraction
4. MCP get_design/get_node/get_screenshot/get_assets
5. reverse SkyCanvas -> Figma export
