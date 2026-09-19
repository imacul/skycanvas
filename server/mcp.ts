import { gunzipSync } from "node:zlib";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

function decodeDesign(input:string){
  const hash=input.includes("#design=")?input.split("#design=")[1]:input;
  if(!hash) throw new Error("SkyCanvas design payload is missing.");
  const [format,data]=hash.split(".",2);
  const normalized=data.replaceAll("-","+").replaceAll("_","/");
  const bytes=Buffer.from(normalized,"base64");
  const json=format==="gz"?gunzipSync(bytes).toString("utf8"):bytes.toString("utf8");
  return JSON.parse(json);
}

const server=new McpServer({name:"skycanvas",version:"0.2.0"});

server.tool("get_design","Read the complete SkyCanvas scene graph from a shared design link.",{design:z.string()},async({design})=>{
  const document=decodeDesign(design);
  return {content:[{type:"text",text:JSON.stringify(document,null,2)}]};
});

server.tool("get_design_context","Return implementation-ready design context including exact geometry, colors, typography and assets.",{design:z.string()},async({design})=>{
  const document=decodeDesign(design);
  return {content:[{type:"text",text:JSON.stringify({instruction:"Implement this design faithfully. Treat node geometry, colors, typography, hierarchy and embedded assets as source of truth.",document},null,2)}]};
});

server.tool("get_node","Read one node from a SkyCanvas design.",{design:z.string(),nodeId:z.string()},async({design,nodeId})=>{
  const document=decodeDesign(design);
  const walk=(nodes:any[]):any=>{for(const n of nodes){if(n.id===nodeId)return n;const hit=n.children&&walk(n.children);if(hit)return hit;}};
  const node=walk(document.nodes||[]);
  return {content:[{type:"text",text:node?JSON.stringify(node,null,2):"Node not found"}]};
});

server.tool("get_assets","List image/SVG assets embedded in a SkyCanvas design.",{design:z.string()},async({design})=>{
  const document=decodeDesign(design);const assets:any[]=[];
  const walk=(nodes:any[])=>nodes.forEach(n=>{if(n.src||n.svg)assets.push({id:n.id,name:n.name,type:n.type,src:n.src,svg:n.svg});if(n.children)walk(n.children);});
  walk(document.nodes||[]);
  return {content:[{type:"text",text:JSON.stringify(assets,null,2)}]};
});

await server.connect(new StdioServerTransport());
