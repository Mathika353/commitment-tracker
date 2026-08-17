// Mirrors a commitment into the "Commitments" database in Notion, so it's
// searchable alongside transcripts and systems. Called from index.html
// right after every Supabase write (create/update/delete) — this endpoint
// never talks to Supabase itself, it only talks to Notion.
//
// Required environment variables (Vercel -> Project Settings -> Environment Variables):
//   NOTION_API_KEY              - same integration token used by the Transcript Submitter
//   NOTION_COMMITMENTS_DB_ID    - 216f63f3a830421b84422a581480e412 (the Commitments database)
//   NOTION_OPS_DASHBOARD_DB_ID  - 7e107e2403d44fcc989bda7a3e9dbabf (looks up the client's page id live)

var STATUS_MAP = {
  not_started: "Not Started",
  in_progress: "In Progress",
  waiting: "Waiting",
  done: "Done"
};

var NOTION_VERSION = "2022-06-28";

async function notionRequest(apiKey, path, method, body) {
  var resp = await fetch("https://api.notion.com/v1" + path, {
    method: method,
    headers: {
      Authorization: "Bearer " + apiKey,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  var data = await resp.json();
  if (!resp.ok) {
    var err = new Error("Notion API error: " + (data.message || resp.status));
    err.detail = data;
    throw err;
  }
  return data;
}

async function findClientId(apiKey, opsDbId, clientName) {
  if (!clientName) return null;
  var data = await notionRequest(apiKey, "/databases/" + opsDbId + "/query", "POST", {
    filter: { property: "Client", title: { equals: clientName } },
    page_size: 1
  });
  return data.results.length ? data.results[0].id : null;
}

async function buildProperties(fields, apiKey, opsDbId) {
  var props = {
    "Commitment": { title: [{ text: { content: (fields.text || "Untitled commitment").slice(0, 2000) } }] },
    "Logged By": { rich_text: [{ text: { content: fields.loggedBy || "" } }] },
    "Status": { select: { name: STATUS_MAP[fields.status] || "Not Started" } }
  };
  if (fields.datePromised) props["Date Promised"] = { date: { start: fields.datePromised } };
  if (fields.deadline) props["Deadline"] = { date: { start: fields.deadline } };
  if (fields.notes) props["Notes"] = { rich_text: [{ text: { content: fields.notes.slice(0, 2000) } }] };

  var clientPageId = await findClientId(apiKey, opsDbId, fields.client);
  if (clientPageId) props["Client"] = { relation: [{ id: clientPageId }] };

  return props;
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  var NOTION_API_KEY = process.env.NOTION_API_KEY;
  var NOTION_COMMITMENTS_DB_ID = process.env.NOTION_COMMITMENTS_DB_ID;
  var NOTION_OPS_DASHBOARD_DB_ID = process.env.NOTION_OPS_DASHBOARD_DB_ID;

  if (!NOTION_API_KEY || !NOTION_COMMITMENTS_DB_ID || !NOTION_OPS_DASHBOARD_DB_ID) {
    // Fail soft: the ledger's own Supabase write already succeeded by the time
    // this is called, so a missing Notion config shouldn't block the user.
    return json({ synced: false, reason: "Notion sync not configured" });
  }

  try {
    var body;
    try {
      body = await req.json();
    } catch (e) {
      return json({ error: "Request body was not valid JSON" }, 400);
    }
    var action = body.action;

    if (action === "create") {
      var page = await notionRequest(NOTION_API_KEY, "/pages", "POST", {
        parent: { database_id: NOTION_COMMITMENTS_DB_ID },
        properties: await buildProperties(body, NOTION_API_KEY, NOTION_OPS_DASHBOARD_DB_ID)
      });
      return json({ synced: true, notionPageId: page.id });
    }

    if (action === "update") {
      if (!body.notionPageId) {
        return json({ synced: false, reason: "No notionPageId on this commitment yet" });
      }
      await notionRequest(NOTION_API_KEY, "/pages/" + body.notionPageId, "PATCH", {
        properties: await buildProperties(body, NOTION_API_KEY, NOTION_OPS_DASHBOARD_DB_ID)
      });
      return json({ synced: true, notionPageId: body.notionPageId });
    }

    if (action === "archive") {
      if (!body.notionPageId) {
        return json({ synced: false, reason: "No notionPageId on this commitment" });
      }
      await notionRequest(NOTION_API_KEY, "/pages/" + body.notionPageId, "PATCH", {
        archived: true
      });
      return json({ synced: true });
    }

    return json({ error: "action must be create, update, or archive" }, 400);
  } catch (err) {
    console.error(err);
    // Fail soft here too — Notion sync is a nice-to-have layered on top of the
    // real Supabase write, not a dependency the ledger's core function needs.
    return json({ synced: false, reason: err.message });
  }
};
