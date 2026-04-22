
// ...existing code...


// ...existing code...
//
//  * Heliactyl-Fixed
// 
//  * Heliactyl 12.7, Codename Gekyume
//  * Copyright SrydenCloud Limited & Pine Platforms Ltd
//
"use strict";

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Load packages.
import "dotenv/config";
import fs from "fs";
import fetch from "node-fetch";
import chalk from "chalk";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

import { getSettings, waitForSettingsReady } from "./misc/settings.js";
import { loadUserAccountData } from "./misc/userData.js";
import getPteroUser from "./misc/getPteroUser.js";
import { getCountryCode } from "./misc/geo.js";

import { getSettings as getSettingsFromModule } from "./misc/settings.js";
import { getUserTransactions } from "./misc/transactions.js";
import { collectAdminStats } from "./misc/stats.js";

// Buffer polyfill
import { Buffer } from "buffer";
global.Buffer = global.Buffer || Buffer;

if (typeof btoa === "undefined") {
  global.btoa = function (str) {
    return Buffer.from(str, "binary").toString("base64");
  };
}
if (typeof atob === "undefined") {
  global.atob = function (b64Encoded) {
    return Buffer.from(b64Encoded, "base64").toString("binary");
  };
}


import { getActiveConfigPath } from "./misc/settings.js";
// Load settings.
const settings = getSettings();
if (settings.debug) {
  console.log(chalk.yellow(`[Heliactyl][DEBUG] Loaded config from: ${getActiveConfigPath()}`));
  console.log(chalk.yellow(`[Heliactyl][DEBUG] Loaded port: ${settings.website?.port}`));
}

const themesettings = {
  index: "index.ejs",
  notfound: "index.ejs",
  redirect: {},
  pages: {},
  mustbeloggedin: [],
  mustbeadmin: [],
  variables: {}
};

export async function buildRenderData(req, db, theme) {
  const newsettings = getSettings();
  const session = req && req.session ? req.session : {};
  const userinfo = session.userinfo;
  const userId = userinfo ? userinfo.id : null;

  let storedCoins = null;
  let plan = null;

  if (userId) {
    const coinsEnabled = newsettings?.api?.client?.coins?.enabled === true;
    const accountData = await loadUserAccountData({
      req,
      db,
      userId,
      settings: newsettings,
      includeCoins: coinsEnabled,
      includePlan: true
    });
    
    if (coinsEnabled) storedCoins = accountData.coins;
    plan = accountData.plan;
  }

  let resolvedCoins = null;
  if (newsettings?.api?.client?.coins?.enabled === true) {
    resolvedCoins = userId ? (storedCoins !== null && storedCoins !== undefined ? storedCoins : 0) : null;
  }

  const pathname =
    req &&
    req._parsedUrl &&
    typeof req._parsedUrl.pathname === "string"
      ? req._parsedUrl.pathname
      : "";
  const normalizedPath = pathname.replace(/^\/+/, "").replace(/\/+$/, "");

  let transactions = null;
  let adminStats = null;
  if (
    userId &&
    normalizedPath === "wallet" &&
    newsettings?.api?.client?.coins?.enabled === true
  ) {
    transactions = await getUserTransactions(db, userId);
  }

  const normalizedAdminPath = normalizedPath.toLowerCase();
  let statsView = null;
  if (normalizedAdminPath.startsWith("admin/stats")) {
    const suffix = normalizedAdminPath.slice("admin/stats".length).replace(/^\/+/, "");
    statsView = suffix || "overview";
  }
  if (
    statsView &&
    session?.pterodactyl?.root_admin === true
  ) {
    try {
      const referralDate = typeof req?.query?.refDate === "string" ? req.query.refDate.trim() : null;
      adminStats = await collectAdminStats(db, { referralDate });
    } catch (err) {
      console.error("[Heliactyl] Failed to collect admin statistics:", err);
      adminStats = { error: err && err.message ? String(err.message) : "Unknown error" };
    }
  }

  let activeCoupons = null;
  let checkedCoupon = null;
  let referralCodes = null;
  if (
    normalizedAdminPath === "admin/coupons" &&
    session?.pterodactyl?.root_admin === true
  ) {
    try {
      activeCoupons = await db.client.coupon.count({ where: { uses: { gt: 0 } } });
      
      if (req.query.check_code) {
         console.log("[Heliactyl] Checking coupon:", req.query.check_code);
         const code = req.query.check_code;
         const coupon = await db.client.coupon.findUnique({ where: { code } });
         console.log("[Heliactyl] Coupon result:", coupon);
         if (coupon) {
             checkedCoupon = {
               code,
               uses: coupon.uses,
               coins: Number(coupon.coins),
               servers: coupon.extraServers
             };
         } else {
             checkedCoupon = { error: "Coupon not found" };
         }
      }
    } catch (err) {
      console.error("[Heliactyl] Failed to count active coupons:", err);
      activeCoupons = 0;
    }
  }

  if (
    normalizedAdminPath === "admin/referrals" &&
    session?.pterodactyl?.root_admin === true
  ) {
    try {
      const referralRows = await db.client.referralCode.findMany({
        where: { enabled: true },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          _count: { select: { uses: true } },
          creator: { select: { discordId: true } }
        }
      });

      referralCodes = referralRows.map((ref) => ({
        code: ref.code,
        rewardInviter: Number(ref.rewardInviter || 0),
        rewardInvitee: Number(ref.rewardInvitee || 0),
        uses: ref._count?.uses ?? 0,
        inviterDiscordId: ref.creator?.discordId || null
      }));
    } catch (err) {
      console.error("[Heliactyl] Failed to load referral codes:", err);
      referralCodes = [];
    }
  }

  // Get User Country
  let userCountry = null;
  if (req) {
    let ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip;
    if (Array.isArray(ip)) ip = ip[0];
    if (ip && typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    
    userCountry = await getCountryCode(db, ip);
  }

  let serverPlans = {};
  let displayRenewalCost = 0;
  if (session.pterodactyl && session.pterodactyl.relationships && session.pterodactyl.relationships.servers && db) {
      const userServers = session.pterodactyl.relationships.servers.data;
      if (Array.isArray(userServers) && userServers.length > 0) {
          const identifiers = userServers.map(s => s.attributes.identifier);
          try {
              const localServers = await db.client.server.findMany({
                  where: { identifier: { in: identifiers } },
                  select: { identifier: true, plan: true, renewalDisabled: true }
              });
              localServers.forEach(s => {
                  serverPlans[s.identifier] = s.plan;
                  
                   // Calculate Renewal Cost
                  if (s.renewalDisabled !== true) { // Skip disabled renewals
                      const planName = s.plan || newsettings.packages.default;
                      if (planName && newsettings.packages.list[planName]) {
                           const cost = Number(newsettings.packages.list[planName].renewalCost);
                           if (!isNaN(cost) && cost > 0) {
                               displayRenewalCost += cost;
                           }
                      }
                  }
              });
          } catch (err) {
              console.error("[Heliactyl] Failed to fetch server plans:", err);
          }
      }
  }

  let renderEggs = null;
  if (normalizedPath === "servers/new") {
    const settingsEggs = newsettings?.api?.client?.eggs;
    const hasSettingsEggs =
      settingsEggs &&
      typeof settingsEggs === "object" &&
      Object.keys(settingsEggs).length > 0;

    if (hasSettingsEggs) {
      renderEggs = settingsEggs;
    } else if (db?.client?.egg?.findMany) {
      try {
        const dbEggs = await db.client.egg.findMany({
          select: {
            egg_id: true,
            name: true,
            docker_image: true,
            startup: true,
            environment: true
          }
        });

        if (Array.isArray(dbEggs) && dbEggs.length > 0) {
          const normalizedEggs = {};
          for (const egg of dbEggs) {
            if (!egg || typeof egg.egg_id !== "number") continue;

            let environment = {};
            if (egg.environment && typeof egg.environment === "string") {
              try {
                const parsed = JSON.parse(egg.environment);
                if (parsed && typeof parsed === "object") {
                  environment = parsed;
                }
              } catch (_err) {
                environment = {};
              }
            } else if (egg.environment && typeof egg.environment === "object") {
              environment = egg.environment;
            }

            normalizedEggs[String(egg.egg_id)] = {
              display: egg.name || `Egg ${egg.egg_id}`,
              description: "",
              minimum: null,
              maximum: null,
              info: {
                egg: egg.egg_id,
                docker_image: egg.docker_image || null,
                startup: egg.startup || null,
                environment
              },
              variables: []
            };
          }

          if (Object.keys(normalizedEggs).length > 0) {
            renderEggs = normalizedEggs;
          }
        }
      } catch (err) {
        console.error("[Heliactyl] Failed to load eggs from the database:", err);
      }
    }
  }

  return {
    req,
    settings: newsettings,
    userinfo,
    serverPlans,
    displayRenewalCost,
    planName: plan,
    coins: resolvedCoins,
    pterodactyl: session.pterodactyl,
    theme: theme.name,
    extra: theme.settings.variables,
    db,
    transactions,
    adminStats,
    statsView,
    activeCoupons,
    checkedCoupon,
    referralCodes,
    userCountry,
    renderEggs
  };
}

export { buildRenderData as renderdataeval };

// Load database
if (!process.env.DATABASE_URL && settings.database) {
  if (typeof settings.database === 'string') {
    process.env.DATABASE_URL = settings.database;
  } else {
    console.error(chalk.red("[Heliactyl] settings.database is not a string! Check your config.yml indentation."));
  }
}
if (!process.env.DATABASE_URL) {
  console.warn(chalk.yellow("[Heliactyl] DATABASE_URL is not set. Database operations may fail."));
}

const { default: db } = await import("./misc/database.js");
const { syncEggsToDatabase } = await import("./misc/eggSync.js");

db.on("error", (err) => {
  console.log(chalk.red("[Heliactyl] An error has occured when attempting to access the database."));
  if (err) console.error(err);
});

export { db };


// Load express addons.
import express from "express";
const app = express();
import expressWs from "express-ws";
expressWs(app);


// (Debug /login route removed. The real /login route will be loaded from api/oauth2.js)

// Trust proxy to fix rate limiting behind proxies (Nginx/Cloudflare)
app.set("trust proxy", 1);

import ejs from "ejs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
const pgSession = connectPgSimple(session);
import rateLimit from "express-rate-limit";
import compression from "compression";




// Restore: Robust root route to render the main dashboard page

app.get("/", async (req, res) => {
  try {
    let theme = get(req);
    const data = await buildRenderData(req, db, theme);
    // Ensure req.session and req.session.userinfo are always defined for EJS
    // Ensure req and req.session are always defined for EJS
    if (!data.req) data.req = {};
    if (!data.req.session) data.req.session = {};
    if (!('userinfo' in data.req.session)) data.req.session.userinfo = null;
    ejs.renderFile(
      `./themes/${theme.name}/${theme.settings.index}`,
      data,
      null,
      function (err, str) {
        if (err) {
          console.error("[EJS ERROR]", err);
          return res.status(500).send("EJS template error: " + err.message);
        }
        res.status(200).send(str);
      }
    );
  } catch (err) {
    console.error("[Heliactyl][ROOT ROUTE ERROR]", err);
    res.status(500).send("Dashboard failed to load. Please check your configuration.");
  }
});


// Set Content Security Policy header to allow OAuth callback resources
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://cdnjs.cloudflare.com https: http:",
      "script-src-elem 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://cdnjs.cloudflare.com https: http:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com https: http:",
      "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com https: http:",
      "font-src 'self' https://fonts.gstatic.com https: http:",
      "connect-src 'self' ws://localhost:* wss://localhost:* https: http:",
      "img-src 'self' data: https: http:",
      "frame-src 'self' https: http:"
    ].join('; ')
  );
  next();
});

export { app };

app.use(compression());

app.use(session({
  store: new pgSession({
    conString: process.env.DATABASE_URL || settings.database,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: settings.website.secret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

app.use(express.json({
  inflate: true,
  limit: "500kb",
  reviver: null,
  strict: true,
  type: "application/json",
  verify: undefined
}));

// Serve static files from the assets directory
app.use("/assets", express.static("./assets"));

async function bootstrap() {
  try {
    await waitForSettingsReady();
  } catch (err) {
    console.error("[Heliactyl] Failed to prepare settings:", err);
  }

  try {
    if (process.env.DATABASE_URL || settings.database) {
      console.log(chalk.gray("[Heliactyl] Syncing database schema (db push)..."));
      const cp = await import("child_process");
      cp.execSync("npx prisma db push --accept-data-loss", { stdio: "inherit" });
      console.log(chalk.green("[Heliactyl] Database schema synced."));
    }
  } catch (err) {
    console.error(chalk.red("[Heliactyl] Failed to run database migrations."));
    console.error(err);
  }

  try {
    await db.ready();
  } catch (err) {
    console.error("[Heliactyl] Failed to initialize database connection:", err);
  }

  try {
    const getAllServers = await import("./misc/getAllServers.js");
    await getAllServers.default.init();
  } catch (err) {
    console.error("[Heliactyl] Failed to initialize server cache:", err);
  }

  try {
    const runtimeSettings = getSettings();
    const activeSettings = runtimeSettings || getSettings();
    await syncEggsToDatabase(db, activeSettings);
  } catch (err) {
    console.error("[Heliactyl] Failed to import eggs into the database:", err);
  }

  // (app.listen removed from bootstrap; now handled in API loader IIFE)
}

bootstrap();







// --- API Loader: Ensure all API routes are loaded before any other route ---

(async () => {
  // Load API files
  const apifiles = fs.readdirSync("./api").filter(file => file.endsWith(".js"));
  if (settings.debug) console.log(chalk.yellow(`[Heliactyl][DEBUG] API files found: ${apifiles.join(", ")}`));
  for (const file of apifiles) {
    try {
      if (settings.debug) console.log(chalk.yellow(`[Heliactyl][DEBUG] Loading API file: ${file}`));
      const apifile = await import(`./api/${file}`);
      if (typeof apifile.load === "function") {
        await apifile.load(app, db);
        if (settings.debug) console.log(chalk.yellow(`[Heliactyl][DEBUG] Loaded API file: ${file}`));
      } else {
        if (settings.debug) console.warn(chalk.yellow(`[Heliactyl][DEBUG] API file ${file} does not export a load function.`));
      }
    } catch (err) {
      if (settings.debug) console.error(chalk.yellow(`[Heliactyl][DEBUG] Failed to load API file ${file}:`, err));
    }
  }

  // Run all startup tasks BEFORE app.listen
  try {
    console.log(chalk.gray("[Heliactyl] Verifying database schema integrity (users table check)..."));
    // RAW SQL PATCH: Bypass Prisma migration lock-in to fix the missing column IMMEDIATELY.
    await db.client.$executeRawUnsafe(`
      DO $$
      BEGIN
        -----------------------------------------------------------------------
        -- 1. Ensure "Users" (User) table columns exist
        -----------------------------------------------------------------------
        -- Only attempt to patch if the table actually exists.
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='Users') THEN

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='discordId') THEN
               ALTER TABLE "Users" ADD COLUMN "discordId" TEXT UNIQUE;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='pterodactylId') THEN
               ALTER TABLE "Users" ADD COLUMN "pterodactylId" INTEGER UNIQUE;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='packageName') THEN
               ALTER TABLE "Users" ADD COLUMN "packageName" TEXT;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='coins') THEN
               ALTER TABLE "Users" ADD COLUMN "coins" BIGINT DEFAULT 0;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='extraServers') THEN
               ALTER TABLE "Users" ADD COLUMN "extraServers" INTEGER DEFAULT 0;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='isAdmin') THEN
               ALTER TABLE "Users" ADD COLUMN "isAdmin" BOOLEAN DEFAULT false;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='lastLinkvertiseRewardAt') THEN
               ALTER TABLE "Users" ADD COLUMN "lastLinkvertiseRewardAt" TIMESTAMP(3);
            END IF;
        
        END IF;

        -----------------------------------------------------------------------
        -- 2. Ensure "Servers" (Server) table columns exist
        -----------------------------------------------------------------------
        
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='Servers') THEN

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Servers' AND column_name='userId') THEN
                ALTER TABLE "Servers" ADD COLUMN "userId" INTEGER;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Servers' AND column_name='eggId') THEN
                ALTER TABLE "Servers" ADD COLUMN "eggId" INTEGER;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Servers' AND column_name='name') THEN
                ALTER TABLE "Servers" ADD COLUMN "name" TEXT;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Servers' AND column_name='identifier') THEN
                ALTER TABLE "Servers" ADD COLUMN "identifier" TEXT UNIQUE;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Servers' AND column_name='plan') THEN
                ALTER TABLE "Servers" ADD COLUMN "plan" TEXT DEFAULT 'default';
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Servers' AND column_name='status') THEN
                ALTER TABLE "Servers" ADD COLUMN "status" TEXT DEFAULT 'provisioning';
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Servers' AND column_name='createdAt') THEN
                ALTER TABLE "Servers" ADD COLUMN "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Servers' AND column_name='updatedAt') THEN
                ALTER TABLE "Servers" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
            END IF;

        END IF;

        -----------------------------------------------------------------------
        -- 3. Ensure "Eggs" (Egg) table columns exist
        -----------------------------------------------------------------------
        
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='Eggs') THEN

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Eggs' AND column_name='name') THEN
                ALTER TABLE "Eggs" ADD COLUMN "name" TEXT;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Eggs' AND column_name='nest') THEN
                ALTER TABLE "Eggs" ADD COLUMN "nest" TEXT;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Eggs' AND column_name='docker_image') THEN
                ALTER TABLE "Eggs" ADD COLUMN "docker_image" TEXT;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Eggs' AND column_name='startup') THEN
                ALTER TABLE "Eggs" ADD COLUMN "startup" TEXT;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Eggs' AND column_name='environment') THEN
                ALTER TABLE "Eggs" ADD COLUMN "environment" TEXT;
            END IF;

        END IF;

        -----------------------------------------------------------------------
        -- 4. Ensure "Statistics" (Statistic) table columns exist
        -----------------------------------------------------------------------

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='Statistics') THEN

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Statistics' AND column_name='key') THEN
                ALTER TABLE "Statistics" ADD COLUMN "key" TEXT UNIQUE;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Statistics' AND column_name='value') THEN
                ALTER TABLE "Statistics" ADD COLUMN "value" JSONB;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Statistics' AND column_name='recordedAt') THEN
                ALTER TABLE "Statistics" ADD COLUMN "recordedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
            END IF;
        
        END IF;
        
      END $$;
    `);
    console.log(chalk.green("[Heliactyl] Database integrity verified."));
  } catch (err) {
    console.error(chalk.red("[Heliactyl] Failed to patch database schema."));
    console.error(err);
  }


  try {
    console.log("[Heliactyl] Fetching all servers from Pterodactyl API...");
    const getAllServers = await import("./misc/getAllServers.js");
    await getAllServers.default.init();
  } catch (err) {
    console.error("[Heliactyl] Failed to initialize server cache:", err);
  }

  try {
    const runtimeSettings = getSettings();
    const activeSettings = runtimeSettings || getSettings();
    await syncEggsToDatabase(db, activeSettings);
  } catch (err) {
    console.error("[Heliactyl] Failed to import eggs into the database:", err);
  }

  try {
    await db.summariseStatistics({ latestLimit: 3 });
  } catch (err) {
    console.warn(
      chalk.gray("  ") + chalk.yellow("[Heliactyl]") + chalk.white(" Failed to summarise statistics."),
      err
    );
  }

  // Now start the server and print only the final startup message
  app.listen(settings.website.port, '0.0.0.0', function () {
    console.clear();
    console.log(chalk.gray("  "));
    console.log(chalk.gray("  ") + chalk.bgBlue("  APPLICATION IS ONLINE  "));
    console.log(chalk.gray("  "));

    const runtimeSettings = getSettings();
    const versionLabel = "version 1.7";
    console.log(
      chalk.gray("  ") +
        chalk.cyan("[Heliactyl]") +
        chalk.white(
          ` Running Heliactyl ${versionLabel}`
        )
    );
    const oauthLink =
      (runtimeSettings?.api &&
        runtimeSettings.api.client &&
        runtimeSettings.api.client.oauth2 &&
        runtimeSettings.api.client.oauth2.link) ||
      settings.api.client.oauth2.link;
    console.log(
      chalk.gray("  ") +
        chalk.cyan("[Heliactyl]") +
        chalk.white(" You can now access the dashboard at ") +
        chalk.underline(oauthLink + "/")
    );
  });
})();



// TEMP: Plain root route for debugging
app.get('/', (req, res) => {
  res.send('<h1>Server is running!</h1><p>You have fixed the error.</p>');
});

// Robust root route: render main page or show a friendly message
// (Commented out for now)
// app.get("/", async (req, res) => {
//   try {
//     let theme = get(req);
//     const data = await buildRenderData(req, db, theme);
//     ejs.renderFile(
//       `./themes/${theme.name}/${theme.settings.index}`,
//       data,
//       null,
//       function (err, str) {
//         if (err) {
//           console.error("[EJS ERROR]", err);
//           return res.status(500).send("EJS template error: " + err.message);
//         }
//         res.status(200).send(str);
//       }
//     );
//   } catch (err) {
//     console.error("[Heliactyl][ROOT ROUTE ERROR]", err);
//     res.status(500).send("Dashboard failed to load. Please check your configuration.");
//   }
// });



// Restore catch-all route to render all valid pages and handle 404s
setImmediate(() => {
  app.use(async (req, res) => {
    let panelId = null;
    if (req.session.pterodactyl && req.session.userinfo?.id) {
      const accountData = await loadUserAccountData({
        req,
        db,
        userId: req.session.userinfo.id,
        includePanelId: true
      });
      panelId = accountData.panelId;
      if (req.session.pterodactyl.id !== panelId) {
        return res.redirect("/login?prompt=none");
      }
    }

    let theme = get(req);

    if (theme.settings.mustbeloggedin.includes(req._parsedUrl.pathname))
      if (!req.session.userinfo || !req.session.pterodactyl)
        return res.redirect("/login" + (req._parsedUrl.pathname.slice(0, 1) == "/" ? "?redirect=" + req._parsedUrl.pathname.slice(1) : ""));

    if (theme.settings.mustbeadmin.includes(req._parsedUrl.pathname)) {
      ejs.renderFile(
        `./themes/${theme.name}/${theme.settings.notfound}`,
        await buildRenderData(req, db, theme),
        null,
        async function (err, str) {
          delete req.session.newaccount;
          delete req.session.password;
          if (!req.session.userinfo || !req.session.pterodactyl) {
            if (err) {
              console.log(chalk.red(`[Heliactyl] An error has occured on path ${req._parsedUrl.pathname}:`));
              console.log(err);
              return res.send("An error has occured while attempting to load this page. Please contact an administrator to fix this.");
            }
            res.status(200);
            return res.send(str);
          }

          if (!panelId) {
            if (err) {
              console.log(chalk.red(`[Heliactyl] An error has occured on path ${req._parsedUrl.pathname}:`));
              console.log(err);
              return res.send("An error has occured while attempting to load this page. Please contact an administrator to fix this.");
            }
            return res.send(str);
          }

          // Cache Pterodactyl user info for 5 minutes
          const now = Date.now();
          if (req.session.pterodactyl && req.session.ptero_last_check && (now - req.session.ptero_last_check < 5 * 60 * 1000)) {
             // Use cached data
          } else {
            try {
              const cacheaccountinfo = await getPteroUser(req.session.userinfo.id, db, req);
              req.session.pterodactyl = cacheaccountinfo.attributes;
              req.session.ptero_last_check = now;
            } catch (err) {
              if (err) {
                console.log(chalk.red(`[Heliactyl] An error has occured on path ${req._parsedUrl.pathname}:`));
                console.log(err);
                return res.send("An error has occured while attempting to load this page. Please contact an administrator to fix this.");
              }
              return res.send(str);
            }
          }

          if (req.session.pterodactyl.root_admin !== true) {
            if (err) {
              console.log(chalk.red(`[Heliactyl] An error has occured on path ${req._parsedUrl.pathname}:`));
              console.log(err);
              return res.send("An error has occured while attempting to load this page. Please contact an administrator to fix this.");
            }
            return res.send(str);
          }

          ejs.renderFile(
            `./themes/${theme.name}/${theme.settings.pages[req._parsedUrl.pathname.slice(1)] ? theme.settings.pages[req._parsedUrl.pathname.slice(1)] : theme.settings.notfound}`,
            await buildRenderData(req, db, theme),
            null,
            function (err, str) {
              delete req.session.newaccount;
              delete req.session.password;
              if (err) {
                console.log(`[Heliactyl] An error has occured on path ${req._parsedUrl.pathname}:`);
                console.log(err);
                return res.send("An error has occured while attempting to load this page. Please contact an administrator to fix this.");
              }
              res.status(200);
              res.send(str);
            });
        });
      return;
    }

    const data = await buildRenderData(req, db, theme);

    let page = theme.settings.notfound;
    const path = req.path || req._parsedUrl.pathname;
    if (path === "/") {
      page = theme.settings.index;
    } else if (theme.settings.pages[path.slice(1)]) {
      page = theme.settings.pages[path.slice(1)];
    }

    ejs.renderFile(
      `./themes/${theme.name}/${page}`,
      data,
      null,
      function (err, str) {
        delete req.session.newaccount;
        delete req.session.password;
        if (err) {
          console.log(chalk.red(`[Heliactyl] An error has occured on path ${path}:`));
          console.log(err);
          return res.send("An error has occured while attempting to load this page. Please contact an administrator to fix this.");
        }
        res.status(200);
        res.send(str);
      }
    );
  });
});

export function get(req) {
  const theme = getSettings().theme;
  const requestedTheme = encodeURIComponent(getCookie(req, "theme"));
  const name = (requestedTheme && fs.existsSync(`./themes/${requestedTheme}`)) ? requestedTheme : theme;
  const pagesPath = `./themes/${name}/pages.json`;
  const settingsData = fs.existsSync(pagesPath)
    ? JSON.parse(fs.readFileSync(pagesPath, "utf8"))
    : themesettings;

  return {
    settings: settingsData,
    name
  };
};

let cache = false;

export async function islimited() {
  return cache == true ? false : true;
};

export async function ratelimits(length) {
  if (cache == true) return setTimeout(ratelimits, 1);
  cache = true;
  setTimeout(async function () {
    cache = false;
  }, length * 1000);
};

// Get a cookie.
function getCookie(req, cname) {
  let cookies = req.headers.cookie;
  if (!cookies) return null;
  let name = cname + "=";
  let ca = cookies.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == " ") {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return decodeURIComponent(c.substring(name.length, c.length));
    }
  }
  return "";
}
