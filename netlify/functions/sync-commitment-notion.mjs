// Mirrors a commitment into the "Commitments" database in Notion, so it's
// searchable alongside transcripts and systems. Called from index.html
// right after every Supabase write (create/update/delete) — this endpoint
// never talks to Supabase itself, it only talks to Notion.
//
// Required environment variables (Vercel -> Project Settings -> Environment Variables):
//   NOTION_API_KEY            - same integration token used by the Transcript Submitter
//   NOTION_COMMITMENTS_DB_ID  - 216f63f3a830421b84422a581480e412 (the Commitments database)

var CLIENT_PAGE_IDS = {
  "Semida Repta": "3ab78d7c-4315-816f-9fe2-fbf83565a692",
  "Evelyn Kidonakis": "3ab78d7c-4315-8174-a395-d8e5e2d7d951",
  "Nick Gallegos": "3ab78d7c-4315-8102-8db1-d025bd9b416d",
  "Paul Diaz": "3ab78d7c-4315-8157-bec4-e2f8e5a733dd",
  "French Moore III": "3ab78d7c-4315-816b-93ae-d9fe4be2215f",
  "Bella Hanono": "3ab78d7c-4315-8136-b07a-ec8124dc3f5f",
  "Bryce Westmoreland": "3ab78d7c-4315-8164-a237-d8e0c2a95548",
  "Mark Streitz": "3ab78d7c-4315-81a4-bed3-cb8f6be3c4c4",
  "David Matney": "3ab78d7c-4315-81e5-b003-cf795ad4aa7f",
  "Drew Link": "3ab78d7c-4315-81e9-856e-e38a3d783488",
  "Praneeth Devabhaktuni": "3ab78d7c-4315-819f-acad-eb11ea03f0b9",
  "Varun Joseph": "3ab78d7c-4315-81bc-adf9-d3e3784a0e2f",
  "Jaime Davenport": "3ab78d7c-4315-8135-aeeb-fedd2fb6b189",
  "Christopher Calnon": "3ab78d7c-4315-814c-81a0-f0e732ad4c01",
  "Ben Alvarez": "3ab78d7c-4315-8187-8cfc-ff19a56c81d7",
  "Ethan Grounds": "3ab78d7c-4315-811d-8845-fc22334b287f",
  "Jim Albrecht": "3ab78d7c-4315-8150-84e2-d24e4d130a0c",
  "Ben Sirrine": "3ab78d7c-4315-811f-ab9a-dada7d71c129",
  "Lynne Thomas": "3ab78d7c-4315-8108-8f1b-f91449e0c32e",
  "Franklin A. Landers": "3ab78d7c-4315-8120-9c7d-e54f2cbd1df6",
  "Danny Bellamy": "3ab78d7c-4315-8162-ba14-cd153fe62374",
  "Michelle Lacues": "3ab78d7c-4315-815c-aa77-d636a1e40a5e",
  "Sundar Jagadeeshan": "3ab78d7c-4315-8192-8b66-c2e514a23ed8",
  "Lori Tijerino": "3b178d7c-4315-81c6-9723-db90239fb75b",
  "Yvonne Caton-Hospedales": "3b178d7c-4315-8184-8697-cc4d157708a4",
  "Hammad Aziz": "3b178d7c-4315-813f-82d1-fe8e7b116125",
  "Douglas Hinterman": "3b178d7c-4315-81d0-9f0a-c791355b747f",
  "Loc Tong": "3b178d7c-4315-81d3-ad86-d7a6f498de7e",
  "Todd Anderson": "3b178d7c-4315-814f-b391-caf8ab442787",
  "Douglas Kersey": "3b178d7c-4315-8134-acad-cfb2d90ff22d",
  "Sina Reangber": "3b178d7c-4315-81c0-b61d-c9d40dd2feec",
  "Homayoun Ardjmand": "3b178d7c-4315-818b-b8fd-f435320363ab",
  "James Lohr": "3b178d7c-4315-8168-b761-e250b95c12c9",
  "Gina Gomez": "3b178d7c-4315-8103-9ce0-e11db6c3a4a4",
  "Mario Samaniego 01 - Las Cruces": "3b178d7c-4315-81ce-81aa-dbaa6025ed6d",
  "Mario Samaniego 02 - Alamogordo": "3b178d7c-4315-81a7-b9a7-cbb4e9ee442a",
  "Justin Norbo": "3b178d7c-4315-819d-9387-e5fd1bfdf0a1",
  "Bahram Hamidi (Murray, New York)": "3b178d7c-4315-816e-ba3c-cbd9de5387a4",
  "Bahram Hamidi (Greene, Brooklyn)": "3b178d7c-4315-8113-9ece-e4bf2b2873a6",
  "Patterson Shedd": "3b178d7c-4315-8194-a298-c884a955f301",
  "Eric Kaleka": "3b178d7c-4315-81ab-82e2-f683fa6204ad",
  "Elizabeth Kubasko": "3b178d7c-4315-819e-911a-ce71516a9e2a",
  "Victor Bauer": "3b178d7c-4315-81ef-bc61-c6efaf252774",
  "Kellan Clark": "3b178d7c-4315-81a3-9b9b-f5aa17d7d62d",
  "Tyler Kurle": "3b178d7c-4315-81da-a73b-f78aa4ef4155"
};

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

function buildProperties(fields) {
  var props = {
    "Commitment": { title: [{ text: { content: (fields.text || "Untitled commitment").slice(0, 2000) } }] },
    "Logged By": { rich_text: [{ text: { content: fields.loggedBy || "" } }] },
    "Status": { select: { name: STATUS_MAP[fields.status] || "Not Started" } }
  };
  if (fields.datePromised) props["Date Promised"] = { date: { start: fields.datePromised } };
  if (fields.deadline) props["Deadline"] = { date: { start: fields.deadline } };
  if (fields.notes) props["Notes"] = { rich_text: [{ text: { content: fields.notes.slice(0, 2000) } }] };

  var clientPageId = CLIENT_PAGE_IDS[fields.client];
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

  if (!NOTION_API_KEY || !NOTION_COMMITMENTS_DB_ID) {
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
        properties: buildProperties(body)
      });
      return json({ synced: true, notionPageId: page.id });
    }

    if (action === "update") {
      if (!body.notionPageId) {
        return json({ synced: false, reason: "No notionPageId on this commitment yet" });
      }
      await notionRequest(NOTION_API_KEY, "/pages/" + body.notionPageId, "PATCH", {
        properties: buildProperties(body)
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
