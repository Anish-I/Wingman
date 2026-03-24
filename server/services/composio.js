const { OpenAIToolSet, Composio } = require('composio-core');
const crypto = require('crypto');
const logger = require('./logger');
const { redis } = require('./redis');
const { fetchWithTimeout } = require('../lib/fetch-with-timeout');

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const TOOLS_CACHE_TTL = 30 * 60; // 30 minutes
const TOOL_IDEMPOTENCY_TTL = 300; // 5 minutes — window for deduplicating retried tool calls
// Pending TTL must be short enough that a timed-out external call doesn't strand the key for
// the full dedup window.  30 s > the typical 20 s orchestrator timeout, giving the in-flight
// call time to write its result while still expiring quickly if it is abandoned.
const PENDING_TTL = 30; // seconds

// Tool-name patterns that cause irrecoverable side effects (send, post, create, delete, etc.)
// For these tools, we must NOT remove the idempotency key on failure, because an orphaned
// promise (from a timed-out request) may still complete in the background. Removing the key
// would allow a retry to execute concurrently, causing duplicate non-idempotent actions.
const SIDE_EFFECT_PATTERN = /^(GMAIL_SEND|GMAIL_CREATE|SLACK_SENDS|SLACK_CHAT_POST|TWILIO_|TELNYX_|.*_SEND_|.*_CREATE_|.*_DELETE_|.*_UPDATE_|.*_POST_|.*_REMOVE_)/i;

// Max retries for critical Redis idempotency writes (e.g. after side-effecting tool execution).
const REDIS_IDEMP_RETRY_COUNT = 2;
const REDIS_IDEMP_RETRY_DELAY_MS = 200;

/**
 * Attempt a Redis SET with retries.  For side-effecting tools the caller
 * **must** know if the key was never stored (duplicate execution risk), so
 * we re-throw after exhausting retries.
 */
async function _redisSetWithRetry(key, value, ttl, { label, rethrow }) {
  for (let attempt = 1; attempt <= REDIS_IDEMP_RETRY_COUNT + 1; attempt++) {
    try {
      await redis.set(key, value, 'EX', ttl);
      return; // success
    } catch (err) {
      logger.error({ err: err.message, attempt, label }, '[composio] Redis idempotency set error');
      if (attempt <= REDIS_IDEMP_RETRY_COUNT) {
        await new Promise(r => setTimeout(r, REDIS_IDEMP_RETRY_DELAY_MS));
      } else if (rethrow) {
        throw new Error(`Failed to store idempotency key after ${attempt} attempts for ${label}: ${err.message}`);
      }
    }
  }
}

// All 1003 apps available on Composio.
// Used for connection status checks and OAuth link generation.
// Tools are fetched without an app filter so Composio returns whatever the user has connected.
const WINGMAN_APPS = [
  'gmail', 'composio', 'github', 'googlecalendar', 'notion', 'googlesheets', 'slack', 'supabase',
  'outlook', 'perplexityai', 'twitter', 'googledrive', 'googledocs', 'hubspot', 'linear', 'airtable',
  'codeinterpreter', 'serpapi', 'jira', 'firecrawl', 'tavily', 'youtube', 'slackbot', 'canvas',
  'bitbucket', 'googletasks', 'discord', 'figma', 'composio_search', 'reddit', 'cal', 'wrike',
  'exa', 'sentry', 'snowflake', 'hackernews', 'elevenlabs', 'microsoft_teams', 'asana', 'peopledatalabs',
  'shopify', 'linkedin', 'google_maps', 'one_drive', 'docusign', 'discordbot', 'salesforce', 'calendly',
  'trello', 'apollo', 'semrush', 'mem0', 'neon', 'weathermap', 'posthog', 'clickup',
  'brevo', 'stripe', 'klaviyo', 'browserbase_tool', 'mailchimp', 'attio', 'googlemeet', 'text_to_pdf',
  'zoho', 'fireflies', 'dropbox', 'shortcut', 'confluence', 'freshdesk', 'borneo', 'mixpanel',
  'coda', 'acculynx', 'ahrefs', 'affinity', 'amplitude', 'heygen', 'agencyzoom', 'googlebigquery',
  'microsoft_clarity', 'coinbase', 'monday', 'semanticscholar', 'sendgrid', 'junglescout', 'pipedrive', 'bamboohr',
  'whatsapp', 'dynamics365', 'zendesk', 'googlephotos', 'lmnt', 'metaads', 'zenrows', 'googlesuper',
  'browser_tool', 'yousearch', 'linkup', 'listennotes', 'typefully', 'bolna', 'rocketlane', 'zoom',
  'onepage', 'entelligence', 'retellai', 'servicenow', 'googleads', 'pagerduty', 'toneden', 'rafflys',
  'finage', 'fomo', 'bannerbear', 'miro', 'share_point', 'mocean', 'formcarry', 'appdrag',
  'metatextai', 'launch_darkly', 'mailerlite', 'contentful', 'close', 'docmosis', 'ably', 'more_trees',
  'netsuite', 'moz', 'recallai', 'apaleo', 'survey_monkey', 'zoho_books', 'zoho_inventory', 'facebook',
  'tinypng', 'mopinion', 'crustdata', 'webex', 'brandfetch', 'canva', 'digicert', 'dailybot',
  'linkhut', 'dropbox_sign', 'timely', 'box', 'smugmug', 'productboard', 'blackbaud', 'webflow',
  'amcards', 'simplesat', 'flutterwave', 'hackerrank_work', 'freshbooks', 'process_street', 'screenshotone', 'chatwork',
  'klipfolio', 'demio', 'altoviz', 'd2lbrightspace', 'blackboard', 'lever', 'zoho_bigin', 'pandadoc',
  'workiom', 'lexoffice', 'gorgias', 'google_analytics', 'todoist', 'zoho_desk', 'ashby', 'datarobot',
  'ngrok', 'square', 'yandex', 'baserow', 'dialpad', 'formsite', 'ynab', 'kommo',
  'tisane', 'coinmarketcal', 'browseai', 'maintainx', 'tinyurl', 'bitwarden', 'epic_games', 'timecamp',
  'piggy', 'alchemy', 'gumroad', 'foursquare', 'open_sea', 'humanloop', 'zoominfo', 'gong',
  'placekey', 'datagma', 'servicem8', 'textrazor', 'bubble', 'chmeetings', 'cloudflare', 'harvest',
  'wakatime', 'xero', 'boldsign', 'active_campaign', 'zoho_mail', 'mural', 'brex', 'intercom',
  'eventbrite', 'beeminder', 'rocket_reach', 'interzoid', 'exist', 'zenserp', 'zoho_invoice', 'stack_exchange',
  'botbaba', 'datadog', 'waboxapp', 'echtpost', '_21risk', '_2chat', 'abstract', 'abuselpdb',
  'abyssale', 'accredible_certificates', 'active_trail', 'addressfinder', 'addresszen', 'adrapid', 'adyntel', 'aeroleads',
  'affinda', 'agent_mail', 'agentql', 'agenty', 'agiled', 'agility_cms', 'ai_ml_api', 'aivoov',
  'algodocs', 'algolia', 'all_images_ai', 'alpha_vantage', 'alttext_ai', 'amara', 'ambee', 'ambient_weather',
  'anchor_browser', 'anonyflow', 'anthropic_administrator', 'api_labz', 'api_ninjas', 'api_sports', 'api_bible', 'api2pdf',
  'apiflash', 'apify', 'apify_mcp', 'apilio', 'apipie_ai', 'apiverve', 'appcircle', 'appointo',
  'appveyor', 'aryn', 'ascora', 'asin_data_api', 'astica_ai', 'async_interview', 'autobound', 'autom',
  'ayrshare', 'backendless', 'bart', 'basecamp', 'baselinker', 'basin', 'beaconchain', 'beaconstac',
  'beamer', 'benchmark_email', 'benzinga', 'bestbuy', 'better_proposals', 'better_stack', 'bettercontact', 'bidsketch',
  'big_data_cloud', 'bigmailer', 'bigml', 'bigpicture_io', 'bitquery', 'blazemeter', 'blocknative', 'boloforms',
  'bolt_iot', 'bonsai', 'bookingmood', 'booqable', 'botpress', 'botsonic', 'botstar', 'bouncer',
  'boxhero', 'breathehr', 'breeze', 'brightdata', 'brilliant_directories', 'browserless', 'btcpay_server', 'bugbug',
  'bugherd', 'bugsnag', 'buildkite', 'builtwith', 'bunnycdn', 'byteforms', 'cabinpanda', 'calendarhero',
  'callerapi', 'callingly', 'callpage', 'campaign_cleaner', 'campayn', 'canny', 'capsule_crm', 'carbone',
  'cardly', 'castingwords', 'cats', 'cdr_platform', 'celigo', 'census_bureau', 'centralstationcrm', 'certifier',
  'chaser', 'chatbotkit', 'chatfai', 'cincopa', 'circleci', 'claid_ai', 'classmarker', 'clearout',
  'clickhouse', 'clickmeeting', 'clicksend', 'clientary', 'clockify', 'cloudcart', 'cloudconvert', 'cloudflare_api_key',
  'cloudflare_browser_rendering', 'cloudinary', 'cloudlayer', 'coassemble', 'codacy', 'codemagic', 'codereadr', 'cody',
  'coinmarketcap', 'coinranking', 'college_football_data', 'commcare', 'connecteam', 'contentful_graphql', 'context7_mcp', 'control_d',
  'conversion_tools', 'convertapi', 'convex', 'conveyor', 'convolo_ai', 'corrently', 'countdown_api', 'coupa',
  'craftmypdf', 'crowdin', 'crowterminal', 'cults', 'curated', 'currencyscoop', 'currents_api', 'cursor',
  'customerio', 'customgpt', 'customjs', 'cutt_ly', 'dadata_ru', 'daffy', 'dart', 'data247',
  'databox', 'databricks', 'dataforseo', 'datascope', 'deadline_funnel', 'deepgram', 'deepimage', 'deepseek',
  'deepwiki_mcp', 'delighted', 'deployhq', 'desktime', 'detrack', 'devin_mcp', 'dialmycalls', 'dictionary_api',
  'diffbot', 'digital_ocean', 'dnsfilter', 'dock_certs', 'docker_hub', 'docnify', 'docparser', 'docraptor',
  'docsautomator', 'docsbot_ai', 'docsumo', 'docugenerate', 'documenso', 'documint', 'docupilot', 'docupost',
  'docuseal', 'doppler', 'doppler_marketing_automation', 'dotsimple', 'dovetail', 'dpd2', 'draftable', 'dreamstudio',
  'dripcel', 'dromo', 'dropcontact', 'dub', 'dungeon_fighter_online', 'dynapictures', 'e2b', 'eagle_doc',
  'ecologi', 'egnyte', 'elasticsearch', 'elevenreader', 'elorus', 'emailable', 'emaillistverify', 'emailoctopus',
  'emelia', 'encodian', 'endorsal', 'engage', 'enginemailer', 'enigma', 'eodhd_apis', 'erpnext',
  'esignatures_io', 'espocrm', 'esputnik', 'etermin', 'evenium', 'eventee', 'eventzilla', 'everhour',
  'eversign', 'excel', 'expofp', 'extracta_ai', 'faceup', 'fal_ai', 'faraday', 'fathom',
  'feathery', 'felt', 'fibery', 'fidel_api', 'files_com', 'fillout_forms', 'findymail', 'finerworks',
  'fingertip', 'finmei', 'fireberry', 'firmao', 'fixer', 'flexisign', 'flowiseai', 'fluxguard',
  'fly', 'folk', 'follow_up_boss', 'forcemanager', 'formbricks', 'formdesk', 'fraudlabs_pro', 'freeagent',
  'freshservice', 'fullenrich', 'gagelist', 'gamma', 'gan_ai', 'gatherup', 'gemini', 'gender_api',
  'genderapi_io', 'genderize', 'geoapify', 'geocodio', 'geokeo', 'getform', 'getprospect', 'gift_up',
  'gigasheet', 'giphy', 'gist', 'gitea', 'gitlab', 'givebutter', 'gladia', 'gleap',
  'globalping', 'godial', 'goodbits', 'goody', 'google_address_validation', 'google_admin', 'google_classroom', 'google_cloud_vision',
  'google_search_console', 'googleslides', 'gosquared', 'grafana', 'grafbase', 'granola_mcp', 'graphhopper', 'griptape',
  'grist', 'groqcloud', 'gtmetrix', 'habitica', 'handwrytten', 'happy_scribe', 'hashnode', 'headout',
  'heartbeat', 'helloleads', 'help_scout', 'helpdesk', 'helpwise', 'here', 'hex', 'heyreach',
  'heyy', 'heyzine', 'highergov', 'honeybadger', 'honeyhive', 'hookdeck', 'hotspotsystem', 'html_to_image',
  'hub_planner', 'hugging_face', 'humanitix', 'hunter', 'hypeauditor', 'hyperbrowser', 'hyperise', 'hystruct',
  'ibm_x_force_exchange', 'icypeas', 'identitycheck', 'ignisign', 'imagekit_io', 'imagior', 'imejis_io', 'imgbb',
  'imgix', 'incident_io', 'influxdb_cloud', 'insighto_ai', 'instacart', 'instagram', 'instantly', 'intelliprint',
  'ip2location', 'ip2proxy', 'ip2whois', 'ipdata_co', 'ipinfo_io', 'iqair_airvisual', 'jigsawstack', 'jobnimbus',
  'jotform', 'jumpcloud', 'kadoa', 'kaggle', 'kaleido', 'kanbanize', 'keen_io', 'keyword',
  'kibana', 'kickbox', 'kit', 'klazify', 'knack', 'ko_fi', 'kontent_ai', 'kraken_io',
  'l2s', 'lagrowthmachine', 'labs64_netlicensing', 'landbot', 'langbase', 'laposta', 'leadboxer', 'leadfeeder',
  'leadiq', 'leexi', 'leiga', 'lemlist', 'lemon_squeezy', 'lessonspace', 'leverly', 'linguapop',
  'linkedin_ads', 'linkly', 'listclean', 'livesession', 'llmwhisperer', 'lob', 'lodgify', 'logo_dev',
  'loomio', 'loops_so', 'loyverse', 'magnetic', 'mailbluster', 'mailboxlayer', 'mailcheck', 'mailcoach',
  'mailercloud', 'mailersend', 'mails_so', 'mailsoftly', 'mailtrap', 'make', 'mapbox', 'mapulus',
  'marketstack', 'matterport', 'melo', 'mem', 'memberspot', 'memberstack', 'membervault', 'metabase',
  'mezmo', 'minerstat', 'missive', 'mistral_ai', 'mixmax', 'moco', 'modelry', 'monday_mcp',
  'moneybird', 'moonclerk', 'moosend', 'motion', 'msg91', 'mx_technologies', 'mx_toolbox', 'nango',
  'nano_nets', 'nasa', 'nasdaq', 'needle', 'nethunt_crm', 'neuronwriter', 'neutrino', 'neverbounce',
  'new_relic', 'news_api', 'nextdns', 'niftyimages', 'ninox', 'nocodb', 'nocrm_io', 'northflank',
  'nozbe_teams', 'npm', 'ntfy', 'nusii_proposals', 'nutshell', 'ocr_web_service', 'ocrspace', 'odoo',
  'oksign', 'ollama', 'omnisend', 'onedesk', 'onesignal_rest_api', 'onesignal_user_auth', 'openai', 'opencage',
  'opengraph_io', 'openperplex', 'openrouter', 'openweather_api', 'optimoroute', 'outline', 'owl_protocol', 'page_x',
  'paperform', 'paradym', 'parallel', 'parma', 'parsehub', 'parsera', 'parseur', 'parsio_io',
  'passcreator', 'passslot', 'payhere', 'payhip', 'paystack', 'pdf_api_io', 'pdf_co', 'pdf4me',
  'pdfless', 'pdfmonkey', 'penpot', 'perigon', 'persistiq', 'persona', 'pexels', 'phantombuster',
  'piloterr', 'pilvio', 'pinecone', 'pingdom', 'pipeline_crm', 'placid', 'plain', 'planly',
  'planyo_online_booking', 'plasmic', 'platerecognizer', 'plausible_analytics', 'plisio', 'pointagram', 'polygon', 'polygon_io',
  'poof', 'postalytics', 'postgrid', 'postgrid_verify', 'postiz_mcp', 'postman', 'postmark', 'prerender',
  'printautopilot', 'prisma', 'prismic', 'proabono', 'procfu', 'productlane', 'project_bubble', 'promptmate_io',
  'proofly', 'proxiedmail', 'push_by_techulus', 'pushbullet', 'pushover', 'quaderno', 'quickbooks', 'radar',
  'ragic', 'ragie', 'raisely', 'ramp', 'rawg_video_games_database', 're_amaze', 'realphonevalidation', 'recruitee',
  'redcircle_api', 'reddit_ads', 'referralrock', 'refiner', 'remarkety', 'remote_retrieval', 'remove_bg', 'render',
  'renderform', 'rentman', 'repairshopr', 'replicate', 'reply', 'reply_io', 'resend', 'respond_io',
  'retailed', 'retently', 'rev', 'revolt', 'ritekit', 'rkvst', 'roam', 'roboflow',
  'rocketadmin', 'rollbar', 'rootly', 'rosette_text_analytics', 'route4me', 'rudderstack_transformation', 'runpod', 'safetyculture',
  'salesflare', 'salesforce_service_cloud', 'salesmate', 'sap_successfactors', 'satismeter', 'saucelabs', 'scale_ai', 'scheduleonce',
  'scrape_do', 'scrapegraph_ai', 'scrapfly', 'scrapingant', 'scrapingbee', 'screenshot_fyi', 'search_api', 'seat_geek',
  'securitytrails', 'segment', 'segmetrics', 'sendbird', 'sendbird_ai_chabot', 'sender', 'sendfox', 'sendlane',
  'sendloop', 'sendspark', 'sensibo', 'seqera', 'serpdog', 'serphouse', 'serply', 'serveravatar',
  'sevdesk', 'shipday', 'shipengine', 'shippo', 'short_io', 'short_menu', 'shorten_rest', 'shortpixel',
  'shotstack', 'sidetracker', 'signaturely', 'signpath', 'signwell', 'similarweb_digitalrank_api', 'simla_com', 'simple_analytics',
  'simplekpi', 'simplero', 'sitespeakai', 'skyfire', 'slite', 'smartproxy', 'sms_alert', 'smtp2go',
  'snapchat', 'snowflake_basic', 'softr', 'solcast', 'sourcegraph', 'specific', 'splitwise', 'spoki',
  'spondyr', 'spotify', 'spotlightr', 'sslmate_cert_spotter_api', 'stack_ai', 'stannp', 'starton', 'statuscake',
  'storeganise', 'storerocket', 'stormboard', 'stormglass_io', 'storyblok', 'strava', 'streamtime', 'studio_by_ai21_labs',
  'suitedash', 'supadata', 'superchat', 'supersaas', 'supportbee', 'supportivekoala', 'svix', 'swaggerhub',
  'sympla', 'synthflow_ai', 'taggun', 'talenthr', 'tally', 'tapfiliate', 'tave', 'tavily_mcp',
  'taxjar', 'teamcamp', 'telegram', 'telnyx', 'teltel', 'templated', 'test_app', 'textcortex',
  'textit', 'thanks_io', 'the_odds_api', 'ticketmaster', 'ticktick', 'tidy', 'tiktok', 'timelinesai',
  'timelink', 'tinyfish_mcp', 'tldv', 'toggl', 'token_metrics', 'tomba', 'tomtom', 'tpscheck',
  'triggercmd', 'tripadvisor', 'tripadvisor_content_api', 'truvera', 'turbot_pipes', 'turso', 'twelve_data', 'twocaptcha',
  'typeform', 'typless', 'u301', 'unione', 'unisender', 'updown_io', 'uploadcare', 'uptimerobot',
  'userflow', 'userlist', 'v0', 'vapi', 'vectorshift', 'veo', 'vercel', 'verifiedemail',
  'veriphone', 'vestaboard', 'virustotal', 'wachete', 'waiverfile', 'wati', 'webscraper_io', 'webscraping_ai',
  'webvizio', 'whautomate', 'whoisfreaks', 'whop', 'winston_ai', 'wisepops', 'wit_ai', 'wix',
  'wix_mcp', 'wiza', 'wolfram_alpha_api', 'woodpecker_co', 'workable', 'workday', 'worksnaps', 'world_news_api',
  'writer', 'xata', 'y_gy', 'yelp', 'zep', 'zeplin', 'zerobounce', 'zixflow',
  'zulip', 'zylvie', 'zyte_api'
];

/**
 * Get all available tools for a user.
 * Fetches tools for ALL connected apps — no app filter applied.
 * Composio automatically returns only tools for apps the user has connected.
 * Entity ID is our user's database ID (permanent, never changes).
 */
async function getTools(userId) {
  if (!COMPOSIO_API_KEY) return [];

  const cacheKey = `tools:${userId}`;
  const cached = await redis.get(cacheKey).catch(err => { logger.error({ err: err.message }, '[composio] Redis cache get error'); return null; });
  if (cached) return JSON.parse(cached);

  const toolset = new OpenAIToolSet({ apiKey: COMPOSIO_API_KEY, entityId: String(userId) });
  const tools = await toolset.getTools({});
  await redis.set(cacheKey, JSON.stringify(tools), 'EX', TOOLS_CACHE_TTL).catch(err => { logger.error({ err: err.message }, '[composio] Redis cache set error'); throw err; });
  return tools;
}

async function invalidateToolsCache(userId) {
  await redis.del(`tools:${userId}`).catch(err => { logger.error({ err: err.message }, '[composio] Redis cache del error'); throw err; });
}

/**
 * Build an idempotency key for a tool call.
 * Based on userId + tool name + sorted arguments so identical calls
 * within the TTL window are deduplicated regardless of block.id.
 */
function _toolIdempotencyKey(userId, toolCallBlock) {
  const payload = `${userId}:${toolCallBlock.name}:${JSON.stringify(toolCallBlock.input)}`;
  const hash = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24);
  return `tool:idemp:${hash}`;
}

/**
 * Execute a single tool call for a user, with idempotency.
 *
 * A Redis SET NX guard ensures that if the same tool call (same user,
 * same tool name, same arguments) is retried within the TTL window,
 * the tool is NOT re-executed. Instead the cached result from the
 * first execution is returned. This prevents duplicate side effects
 * for non-idempotent tools like GMAIL_SEND or CREATE_GITHUB_ISSUE.
 */
async function executeTool(userId, toolCallBlock, { signal } = {}) {
  const idempKey = _toolIdempotencyKey(userId, toolCallBlock);
  const isSideEffecting = SIDE_EFFECT_PATTERN.test(toolCallBlock.name);

  // For side-effecting tools (send, create, delete, etc.) use the full dedup
  // TTL so the pending slot outlives any realistic API latency.  Previously
  // PENDING_TTL (30 s) was used for all tools, which let the key expire while
  // the original Composio call was still in-flight — a retry could then
  // reclaim the slot, causing duplicate sends/posts/deletes.
  //
  // For safe/idempotent tools, keep the short PENDING_TTL so the key
  // auto-expires quickly if the caller is killed by an external timeout.
  const claimTTL = isSideEffecting ? TOOL_IDEMPOTENCY_TTL : PENDING_TTL;
  const claimed = await redis.set(idempKey, 'pending', 'NX', 'EX', claimTTL);

  if (claimed !== 'OK') {
    // Another execution of this exact call is in progress or completed.
    // Poll for the result, but also handle key expiry (null) mid-loop.
    for (let i = 0; i < 10; i++) {
      const cached = await redis.get(idempKey);
      if (cached === null) {
        if (isSideEffecting) {
          // Side-effecting tool: the original may still be running on the
          // remote service even though our key expired.  Do NOT re-attempt —
          // that risks duplicate sends/posts/deletes.
          console.warn(`[user:${userId}] Idempotency key expired for side-effecting tool ${toolCallBlock.name}, refusing retry to prevent duplicates`);
          return { error: `Duplicate call to ${toolCallBlock.name} suppressed — the original may still be completing. Please wait and retry later.` };
        }
        // Safe/idempotent tool: the original executor is gone, re-attempt.
        console.log(`[user:${userId}] Idempotency key expired for ${toolCallBlock.name}, re-attempting`);
        break;
      }
      if (cached !== 'pending') {
        console.log(`[user:${userId}] Idempotent cache hit for ${toolCallBlock.name}`);
        try { return JSON.parse(cached); } catch { return { result: cached }; }
      }
      // Still pending — wait 500ms before checking again
      await new Promise(r => setTimeout(r, 500));
    }

    // Final check — the key may have been updated in the last iteration's sleep
    const finalVal = await redis.get(idempKey);
    if (finalVal && finalVal !== 'pending') {
      console.log(`[user:${userId}] Idempotent cache hit (final) for ${toolCallBlock.name}`);
      try { return JSON.parse(finalVal); } catch { return { result: finalVal }; }
    }

    if (finalVal === 'pending') {
      // Key is stale — the original executor likely died (e.g. external timeout).
      // Atomically reclaim the slot by overwriting 'pending' with a fresh
      // 'pending' + TTL in a single Lua script.  This closes the race window
      // in the old DEL → SET NX two-step where a third caller could claim the
      // slot between the delete and the reclaim, causing concurrent execution.
      const reclaimed = await redis.eval(
        "if redis.call('get', KEYS[1]) == 'pending' then redis.call('set', KEYS[1], 'pending', 'EX', ARGV[1]) return 1 else return 0 end",
        1, idempKey, String(claimTTL)
      ).catch(err => { logger.error({ err: err.message }, `[user:${userId}] Redis idempotency reclaim error for ${toolCallBlock.name}`); return 0; });
      if (reclaimed === 1) {
        console.log(`[user:${userId}] Reclaimed stale pending key for ${toolCallBlock.name}, re-attempting`);
        // We atomically own the slot — fall through to execute below.
      } else {
        // The key changed between our GET and the Lua (the original executor
        // wrote its result).  Re-read and return it instead of erroring out.
        const raceVal = await redis.get(idempKey);
        if (raceVal && raceVal !== 'pending') {
          console.log(`[user:${userId}] Idempotent cache hit (race) for ${toolCallBlock.name}`);
          try { return JSON.parse(raceVal); } catch { return { result: raceVal }; }
        }
        console.warn(`[user:${userId}] Idempotent dedup: ${toolCallBlock.name} already in-flight, skipping retry`);
        return { error: `Duplicate call to ${toolCallBlock.name} suppressed — the original is still processing.` };
      }
    } else {
      // finalVal is null — key expired.  Try to claim for re-execution.
      const reclaimed = await redis.set(idempKey, 'pending', 'NX', 'EX', claimTTL);
      if (reclaimed !== 'OK') {
        // Another caller claimed it between our GET and SET NX — check for result.
        const raceVal = await redis.get(idempKey);
        if (raceVal && raceVal !== 'pending') {
          console.log(`[user:${userId}] Idempotent cache hit (race) for ${toolCallBlock.name}`);
          try { return JSON.parse(raceVal); } catch { return { result: raceVal }; }
        }
        console.warn(`[user:${userId}] Idempotent dedup: ${toolCallBlock.name} already in-flight, skipping retry`);
        return { error: `Duplicate call to ${toolCallBlock.name} suppressed — the original is still processing.` };
      }
      // Fall through to execute below
    }
  }

  // We claimed the slot — execute the tool
  try {
    // Check abort signal before starting the API call — avoids sending a
    // request for a tool whose iteration/request has already timed out.
    if (signal?.aborted) {
      const abortErr = new Error(`Aborted before executing ${toolCallBlock.name}`);
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const toolset = new OpenAIToolSet({ apiKey: COMPOSIO_API_KEY, entityId: String(userId) });

    // Inject the abort signal into the SDK's underlying axios instance so
    // that in-flight HTTP requests are actually cancelled — not just raced —
    // when the iteration/request timeout fires.  Without this, the Composio
    // API call completes in the background and side-effecting tools (send
    // email, create ticket) execute even after the orchestrator has moved on.
    let interceptorId;
    const axiosInstance = toolset.backendClient?.instance;
    if (signal && axiosInstance?.interceptors?.request) {
      interceptorId = axiosInstance.interceptors.request.use((config) => {
        if (signal.aborted) {
          const err = new Error(`Aborted before HTTP request for ${toolCallBlock.name}`);
          err.name = 'AbortError';
          throw err;
        }
        // Attach signal so axios cancels the request if abort fires mid-flight
        config.signal = signal;
        return config;
      });
    }

    let raw;
    try {
      raw = await toolset.executeToolCall({
        id: toolCallBlock.id,
        type: 'function',
        function: {
          name: toolCallBlock.name,
          arguments: JSON.stringify(toolCallBlock.input),
        },
      });
    } finally {
      // Clean up the interceptor so it doesn't leak across calls
      if (interceptorId !== undefined && axiosInstance?.interceptors?.request) {
        axiosInstance.interceptors.request.eject(interceptorId);
      }
    }

    const parsed = (() => { try { return JSON.parse(raw); } catch { return { result: raw }; } })();

    // Cache the result so retries get the same response.
    // For side-effecting tools, failure to cache is critical — a retry would
    // re-execute the action (send duplicate email, etc.), so we retry + throw.
    const isSideEffect = SIDE_EFFECT_PATTERN.test(toolCallBlock.name);
    await _redisSetWithRetry(idempKey, JSON.stringify(parsed), TOOL_IDEMPOTENCY_TTL, {
      label: toolCallBlock.name,
      rethrow: isSideEffect,
    });
    return parsed;
  } catch (err) {
    if (SIDE_EFFECT_PATTERN.test(toolCallBlock.name)) {
      // Side-effecting tool: cache the error instead of deleting the key.
      // An orphaned promise (from a timed-out request) may still be running
      // on the remote service. Deleting the key would let a retry claim a new
      // slot and execute concurrently, risking duplicate sends/posts/deletes.
      //
      // Always use the full dedup TTL for side-effecting tools, even on
      // timeout.  The original request may still be in-flight on the remote
      // service well beyond PENDING_TTL (30s).  Using the short TTL allowed
      // a retry to reclaim the idempotency slot while the original was still
      // executing, causing duplicate side effects (e.g. sending two emails).
      const errorTTL = TOOL_IDEMPOTENCY_TTL;
      const errorResult = JSON.stringify({ error: err.message || 'Tool execution failed' });
      await _redisSetWithRetry(idempKey, errorResult, errorTTL, {
        label: toolCallBlock.name,
        rethrow: true, // side-effecting tool — must not allow duplicate execution
      });
    } else {
      // Safe/idempotent tool: remove the key so retries can attempt again
      await redis.del(idempKey).catch(err => { logger.error({ err: err.message }, '[composio] Redis idempotency del error'); });
    }
    throw err;
  }
}

/**
 * Generate an OAuth connection URL for a user to connect an app.
 * The URL is single-use and opens in the user's browser.
 * Once authorized, Composio persists the session indefinitely.
 */
const ALLOWED_REDIRECT_ORIGINS = [
  process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`,
].filter(Boolean);

async function getConnectionLink(userId, appName, redirectUrl = null) {
  const client = new Composio({ apiKey: COMPOSIO_API_KEY });
  const entity = await client.getEntity(String(userId));
  const params = { appName };
  if (redirectUrl) {
    // SSRF protection: only allow redirects to whitelisted origins
    let parsed;
    try { parsed = new URL(redirectUrl); } catch { throw new Error('Invalid redirectUrl'); }
    const origin = parsed.origin;
    if (!ALLOWED_REDIRECT_ORIGINS.some(allowed => origin === new URL(allowed).origin)) {
      throw new Error('redirectUrl origin not in allowlist');
    }
    params.redirectUrl = redirectUrl;
  }
  const conn = await entity.initiateConnection(params);
  return conn.redirectUrl;
}

/**
 * Check which apps the user has already connected.
 * If appNames is null or empty, returns ALL connected accounts.
 * Otherwise filters to only the requested app names.
 * Returns { connected: string[], missing: string[] }
 */
async function getConnectionStatus(userId, appNames = null) {
  if (!COMPOSIO_API_KEY) {
    const msg = 'COMPOSIO_API_KEY is not set — cannot check connection status';
    logger.error(`[composio] ${msg}`);
    return { connected: [], missing: appNames || [], error: msg };
  }

  try {
    // Composio uses entityId (our userId as string) to identify users.
    // The REST API accepts both `user_uuid` and `entityId` — try entityId first
    // as it aligns with how getTools/getConnectionLink identify users.
    const entityId = String(userId);
    // Known limitation: Composio REST API does not support cursor-based pagination
    // for connectedAccounts. pageSize=200 is the maximum allowed value.
    // In practice this is not a bottleneck — a single user rarely connects 200+ apps.
    const url = `https://backend.composio.dev/api/v1/connectedAccounts?user_uuid=${entityId}&pageSize=200`;
    const res = await fetchWithTimeout(url, { headers: { 'x-api-key': COMPOSIO_API_KEY }, timeoutMs: 10_000 });

    if (!res.ok) {
      const body = await res.text().catch(() => '(no body)');
      logger.error({ status: res.status }, '[composio] getConnectionStatus failed');
      return {
        connected: [],
        missing: appNames || [],
        error: `Composio API returned HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    console.log(`[composio] getConnectionStatus for user ${entityId}: ${(data.items || []).length} accounts found, ${(data.items || []).filter(c => c.status === 'ACTIVE').length} active`);

    const activeItems = (data.items || []).filter(c => c.status === 'ACTIVE');

    if (data.items && data.items.length > 0 && activeItems.length === 0) {
      const statuses = [...new Set(data.items.map(c => c.status))];
      console.warn(`[composio] User ${entityId} has ${data.items.length} accounts but none are ACTIVE. Statuses: ${statuses.join(', ')}`);
    }

    const connected = new Set(activeItems.map(c => c.appName.toLowerCase()));

    // No filter — return all connected apps
    if (!appNames || appNames.length === 0) {
      return {
        connected: [...connected],
        missing: [],
      };
    }

    return {
      connected: appNames.filter(a => connected.has(a.toLowerCase())),
      missing: appNames.filter(a => !connected.has(a.toLowerCase())),
    };
  } catch (err) {
    logger.error({ err: err.message || String(err) }, `[composio] getConnectionStatus error for user ${userId}`);
    if (!appNames || appNames.length === 0) {
      return { connected: [], missing: [], error: err.message };
    }
    return { connected: [], missing: appNames, error: err.message };
  }
}

// Pre-compute: app slugs sorted longest-first for greedy prefix matching.
// This ensures multi-word slugs like 'microsoft_teams' match before 'microsoft'.
const _KNOWN_APPS_BY_LENGTH = [...WINGMAN_APPS].sort((a, b) => b.length - a.length || a.localeCompare(b));

/**
 * Detect which app a Composio tool belongs to (e.g. GMAIL_SEND_EMAIL → gmail,
 * MICROSOFT_TEAMS_SEND_MESSAGE → microsoft_teams).
 *
 * Uses longest-prefix matching against known app slugs so multi-word slugs
 * (microsoft_teams, google_maps, zoho_books, etc.) resolve correctly.
 * Falls back to the first underscore segment for unknown/new apps.
 */
function appFromToolName(toolName) {
  const lower = toolName.toLowerCase();
  for (const app of _KNOWN_APPS_BY_LENGTH) {
    if (lower.startsWith(app + '_') || lower === app) {
      return app;
    }
  }
  // Fallback for apps not in WINGMAN_APPS (e.g. newly added by Composio)
  return lower.split('_')[0];
}

/**
 * Select the most relevant tools for a given message using keyword scoring.
 * Scores each tool by how many words from the message appear in its name/description.
 * Returns top `limit` tools (default 25). Any tool is reachable on the right message.
 */
function selectToolsForMessage(tools, message, limit = 25) {
  if (!tools || tools.length === 0) return [];
  if (tools.length <= limit) return tools;

  // Only consider meaningful words: 4+ chars, not pure numbers, not stop words
  const STOP = new Set(['what', 'when', 'where', 'which', 'this', 'that', 'with', 'from', 'have', 'will', 'your', 'they', 'them', 'their', 'been', 'were', 'want', 'need', 'help', 'does', 'make', 'some', 'more', 'also', 'into', 'than', 'then', 'just', 'like', 'tell', 'show', 'give', 'know', 'much', 'many', 'each', 'such']);
  const words = new Set(
    (message || '').toLowerCase().match(/\w+/g)
      ?.filter(w => w.length >= 4 && !/^\d+$/.test(w) && !STOP.has(w))
    || []
  );

  // No meaningful words → pure conversational query, let LLM answer without tools
  if (words.size === 0) return [];

  const scored = tools.map(tool => {
    const haystack = [
      tool.function?.name || '',
      tool.function?.description || '',
    ].join(' ').toLowerCase();
    const score = [...words].filter(w => haystack.includes(w)).length;
    return { tool, score };
  });
  scored.sort((a, b) => b.score - a.score);
  // Require at least 2 keyword matches to avoid false positives on conversational messages.
  // A single incidental word match (e.g. "secret" → anonyflow) should not trigger tool use.
  // Real action requests ("send email", "check gmail", "create github issue") score ≥2.
  if (scored[0].score < 2) return [];
  return scored.slice(0, limit).map(s => s.tool);
}

module.exports = { getTools, invalidateToolsCache, executeTool, getConnectionLink, getConnectionStatus, appFromToolName, selectToolsForMessage, WINGMAN_APPS };
