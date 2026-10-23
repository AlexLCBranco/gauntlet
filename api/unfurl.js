// GET /api/unfurl?url=… — a web page's preview for the whiteboard's web
// embeds (api/_lib/unfurl.js). A Vercel function; the local proxy answers
// the same address with the same code.

import { handleUnfurl } from "./_lib/unfurl.js";

export default function handler(req, res) {
  return handleUnfurl(req, res);
}
