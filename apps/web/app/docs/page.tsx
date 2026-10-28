const ENDPOINTS: [string,string,string][] = [
  ["POST","/api/tasks/{type}","Submit a task with prompt, aspectRatio, reference, or other task-specific fields. Use noWait for asynchronous execution."],
  ["GET","/api/tasks/{taskId}","Poll task status: processing, succeeded, or failed. Results expire after 24 hours."],
  ["POST","/api/upload/chunk-init?fileName=&fileMd5=","Initialize an upload. An existing data.url means the file was deduplicated."],
  ["POST","/api/upload/chunk","Upload one part with uploadId, partNumber, and file (up to 5 MB). Returns partNumber and etag."],
  ["POST","/api/upload/chunk-complete?uploadId=","Complete an upload with [{partNumber, etag}]. Returns a public URL."],
  ["POST","/api/upload/direct","Single-step multipart upload used by the web interface."],
  ["GET/POST/DELETE","/api/api-key","Manage API keys. A new key is shown in plaintext only once."],
  ["GET/POST/DELETE","/api/brandkit","Create, update, list, or remove brand kits."],
  ["POST","/api/brandkit/extract","Extract brand guidance from supplied notes using your configured language model."],
  ["GET","/api/brand/context?sessionId=","Get the active brand kit for a conversation."],
  ["GET/POST","/api/templates","List or publish community templates."],
  ["GET/POST/PATCH/DELETE","/api/projects · /api/chat/sessions","Persist projects and conversations."],
  ["POST","/api/chat/send","Stream assistant events over SSE: msgId, content, renderData, brandId, and [Heartbeat]."],
  ["GET/POST","/api/user/preferences/language","Read or update language preferences. Default: English."],
];
export default function Docs(){return <main className="stub"><header className="sectionHeading"><div><h1>Developer guide</h1><p>Build on your own creative infrastructure.</p></div></header><p className="hintP">Responses use <code>{"{code:0, data, msg}"}</code>. Authenticate with <code>authorization: pf-…</code>. Set <code>OIA_REQUIRE_KEY=1</code> to enforce authentication.</p><div className="surface tableScroll apiSection"><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}><thead><tr style={{textAlign:"left"}}><th>Method</th><th>Path</th><th>Description</th></tr></thead><tbody>{ENDPOINTS.map(([m,p,d])=><tr key={p+m} style={{borderBottom:"1px solid var(--line)"}}><td><code>{m}</code></td><td><code>{p}</code></td><td style={{color:"var(--muted)"}}>{d}</td></tr>)}</tbody></table></div><section style={{marginTop:28}}><h2>Agent skills</h2><p className="hintP">Copy a skill from <code>packages/skills/skills</code> into <code>~/.claude/skills/</code> (or your agent’s equivalent), then set <code>OIA_BASE_URL</code> and <code>OIA_API_KEY</code>. See For Agents for setup details.</p></section></main>;}
