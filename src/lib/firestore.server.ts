import { createSign } from "node:crypto";

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";

let cachedToken: { token: string; exp: number } | null = null;

function b64url(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URI,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = b64url(signer.sign(privateKey));
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, exp: now + json.expires_in };
  return json.access_token;
}

function projectBase() {
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

// Convert Firestore REST value -> plain JS
export function fromFirestoreValue(v: any): any {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("bytesValue" in v) return v.bytesValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fromFirestoreValue);
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields ?? {});
  return v;
}

export function fromFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFirestoreValue(v);
  return out;
}

async function authedFetch(url: string, init?: RequestInit) {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore ${res.status}: ${body}`);
  }
  return res.json();
}

export async function listRootCollections(): Promise<string[]> {
  const data = (await authedFetch(`${projectBase()}:listCollectionIds`, {
    method: "POST",
    body: JSON.stringify({ pageSize: 100 }),
  })) as { collectionIds?: string[] };
  return (data.collectionIds ?? []).sort();
}

export type FirestoreDoc = {
  id: string;
  path: string;
  createTime?: string;
  updateTime?: string;
  data: Record<string, any>;
};

export async function listDocuments(
  collection: string,
  pageSize = 200,
): Promise<FirestoreDoc[]> {
  const url = `${projectBase()}/${encodeURIComponent(collection)}?pageSize=${pageSize}`;
  const data = (await authedFetch(url)) as {
    documents?: Array<{
      name: string;
      fields?: Record<string, any>;
      createTime?: string;
      updateTime?: string;
    }>;
  };
  return (data.documents ?? []).map((d) => {
    const parts = d.name.split("/");
    const id = parts[parts.length - 1];
    return {
      id,
      path: d.name.split("/documents/")[1] ?? d.name,
      createTime: d.createTime,
      updateTime: d.updateTime,
      data: fromFirestoreFields(d.fields ?? {}),
    };
  });
}
