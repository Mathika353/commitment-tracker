// Runs on a schedule automatically (see the `config.schedule` export below —
// Netlify's own scheduler triggers this directly, no public URL or auth
// header needed the way Vercel's cron required). Checks Supabase for
// commitments that are overdue or due soon, and emails a summary via SendGrid.
//
// Required environment variables (Netlify -> Site configuration -> Environment variables):
//   SUPABASE_URL       - same value as in index.html
//   SUPABASE_ANON_KEY  - same value as in index.html
//   SENDGRID_API_KEY   - from SendGrid -> Settings -> API Keys
//   EMAIL_FROM         - the single sender address you verified in SendGrid
//   EMAIL_RECIPIENTS   - comma-separated list, e.g. "a@x.com,b@x.com"
// Optional:
//   NOTIFY_DAYS_AHEAD  - how many days ahead counts as "due soon" (default 3)

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rowsHtml(list, color) {
  return list
    .map(function (c) {
      return (
        "<tr>" +
        '<td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">' + escapeHtml(c.client) + "</td>" +
        '<td style="padding:6px 10px;border-bottom:1px solid #eee;">' + escapeHtml(c.text) + "</td>" +
        '<td style="padding:6px 10px;border-bottom:1px solid #eee;color:' + color + ';font-weight:600;">' + c.deadline + "</td>" +
        '<td style="padding:6px 10px;border-bottom:1px solid #eee;">' + escapeHtml(c.logged_by || "") + "</td>" +
        "</tr>"
      );
    })
    .join("");
}

export default async () => {
  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  var SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  var EMAIL_FROM = process.env.EMAIL_FROM;
  var EMAIL_RECIPIENTS = process.env.EMAIL_RECIPIENTS;
  var DAYS_AHEAD = Number(process.env.NOTIFY_DAYS_AHEAD || 3);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SENDGRID_API_KEY || !EMAIL_FROM || !EMAIL_RECIPIENTS) {
    console.error("Missing one or more required environment variables");
    return new Response("Missing config", { status: 500 });
  }

  try {
    var query = SUPABASE_URL + "/rest/v1/commitments?status=neq.done&select=*&order=deadline.asc";
    var dbResp = await fetch(query, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY
      }
    });

    if (!dbResp.ok) {
      var dbErr = await dbResp.text();
      console.error("Supabase query failed", dbErr);
      return new Response("Supabase query failed", { status: 500 });
    }

    var commitments = await dbResp.json();

    var today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    var todayStr = today.toISOString().slice(0, 10);

    var cutoff = new Date(today);
    cutoff.setUTCDate(cutoff.getUTCDate() + DAYS_AHEAD);
    var cutoffStr = cutoff.toISOString().slice(0, 10);

    var overdue = [];
    var dueSoon = [];

    commitments.forEach(function (c) {
      if (!c.deadline) return;
      if (c.deadline < todayStr) overdue.push(c);
      else if (c.deadline <= cutoffStr) dueSoon.push(c);
    });

    if (overdue.length === 0 && dueSoon.length === 0) {
      return new Response("Nothing due — no email sent.", { status: 200 });
    }

    var headerRow =
      '<tr style="text-align:left;font-size:12px;text-transform:uppercase;color:#5b5a4c;">' +
      '<th style="padding:6px 10px;">Client</th>' +
      '<th style="padding:6px 10px;">Commitment</th>' +
      '<th style="padding:6px 10px;">Deadline</th>' +
      '<th style="padding:6px 10px;">Logged by</th></tr>';

    var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#23281f;">';
    html += "<h2 style=\"margin-bottom:4px;\">Follow-Through Ledger &mdash; deadline check for " + todayStr + "</h2>";

    if (overdue.length) {
      html += '<h3 style="color:#9c3b2e;">Overdue (' + overdue.length + ")</h3>";
      html += '<table style="border-collapse:collapse;width:100%;margin-bottom:20px;">' + headerRow + rowsHtml(overdue, "#9c3b2e") + "</table>";
    }

    if (dueSoon.length) {
      html += '<h3 style="color:#8a6a2f;">Due in the next ' + DAYS_AHEAD + " days (" + dueSoon.length + ")</h3>";
      html += '<table style="border-collapse:collapse;width:100%;">' + headerRow + rowsHtml(dueSoon, "#8a6a2f") + "</table>";
    }

    html += "</div>";

    var recipients = EMAIL_RECIPIENTS.split(",")
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    var sgResp = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + SENDGRID_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [{ to: recipients.map(function (email) { return { email: email }; }) }],
        from: { email: EMAIL_FROM },
        subject: "Follow-Through Ledger: " + overdue.length + " overdue, " + dueSoon.length + " due soon",
        content: [{ type: "text/html", value: html }]
      })
    });

    if (!sgResp.ok) {
      var sgErr = await sgResp.text();
      console.error("SendGrid send failed", sgResp.status, sgErr);
      return new Response("SendGrid send failed", { status: 500 });
    }

    return new Response(
      "Email sent to " + recipients.length + " recipients — " + overdue.length + " overdue, " + dueSoon.length + " due soon",
      { status: 200 }
    );
  } catch (err) {
    console.error(err);
    return new Response(err.message, { status: 500 });
  }
};

export const config = {
  schedule: "0 16 * * *"
};
