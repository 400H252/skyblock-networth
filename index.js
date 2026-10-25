// Hypixel SkyBlock networth tracker.
// For each player: look up UUID, pull their selected SkyBlock profile, calculate
// networth with SkyHelper-Networth, and append one row to a Google Sheet.

const { ProfileNetworthCalculator } = require('skyhelper-networth');
const { google } = require('googleapis');

const API_KEY = process.env.HYPIXEL_API_KEY;
const SHEET_ID = process.env.SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const PLAYERS = (process.env.PLAYERS || '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);
const TAB = process.env.SHEET_TAB || 'Networth';

const HEADERS = [
  'Timestamp (ET)',
  'Player',
  'Profile',
  'Networth',
  'Non-cosmetic networth',
  'Unsoulbound networth',
  'Purse',
  'Bank',
  'Note',
];

function requireEnv() {
  const missing = [];
  if (!API_KEY) missing.push('HYPIXEL_API_KEY');
  if (!SHEET_ID) missing.push('SHEET_ID');
  if (!SERVICE_ACCOUNT_JSON) missing.push('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!PLAYERS.length) missing.push('PLAYERS');
  if (missing.length) {
    console.error(`Missing required settings: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hypixel(path) {
  const res = await fetch(`https://api.hypixel.net${path}`, {
    headers: { 'API-Key': API_KEY },
  });
  if (res.status === 429) {
    await sleep(5000);
    return hypixel(path);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(`Hypixel ${path} -> ${res.status} ${body.cause || ''}`.trim());
  }
  return body;
}

async function resolveUuid(player) {
  const clean = player.replace(/-/g, '');
  if (/^[0-9a-f]{32}$/i.test(clean)) return { uuid: clean.toLowerCase(), name: player };
  const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(player)}`);
  if (!res.ok) throw new Error(`Could not find Minecraft user "${player}" (${res.status})`);
  const data = await res.json();
  return { uuid: data.id, name: data.name };
}

async function getNetworthRow(player, timestamp) {
  const { uuid, name } = await resolveUuid(player);

  const { profiles } = await hypixel(`/v2/skyblock/profiles?uuid=${uuid}`);
  if (!profiles || !profiles.length) {
    return [timestamp, name, '', '', '', '', '', '', 'No SkyBlock profiles'];
  }
  const profile = profiles.find((p) => p.selected) || profiles[0];
  const member = profile.members[uuid];
  if (!member) return [timestamp, name, profile.cute_name, '', '', '', '', '', 'Member data missing'];

  let museum;
  try {
    const m = await hypixel(`/v2/skyblock/museum?profile=${profile.profile_id}`);
    museum = m.members && m.members[uuid];
  } catch (e) {
    console.warn(`  museum lookup failed for ${name}: ${e.message}`);
  }

  const bank = profile.banking?.balance ?? 0;
  const calc = new ProfileNetworthCalculator(member, museum, bank);
  const full = await calc.getNetworth({ onlyNetworth: true });
  const nonCosmetic = await calc.getNonCosmeticNetworth({ onlyNetworth: true });

  const note = full.noInventory ? 'Inventory API off (networth is partial)' : '';
  return [
    timestamp,
    name,
    profile.cute_name,
    Math.round(full.networth),
    Math.round(nonCosmetic.networth),
    Math.round(full.unsoulboundNetworth),
    Math.round(full.purse),
    Math.round(full.bank),
    note,
  ];
}

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function ensureTab(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets.some((s) => s.properties.title === TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
  }
  const head = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A1:A1`,
  });
  if (!head.data.values || !head.data.values.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

async function main() {
  requireEnv();

  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
  });

  const rows = [];
  for (const player of PLAYERS) {
    try {
      console.log(`Checking ${player}...`);
      rows.push(await getNetworthRow(player, timestamp));
    } catch (e) {
      console.error(`  failed for ${player}: ${e.message}`);
      rows.push([timestamp, player, '', '', '', '', '', '', `Error: ${e.message}`]);
    }
    await sleep(1000);
  }

  const sheets = await getSheets();
  await ensureTab(sheets);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
  console.log(`Added ${rows.length} row(s) to "${TAB}".`);

  // The networth library keeps a background refresh timer running; exit explicitly.
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
