const { query, withTransaction } = require('./index');

/** Tracks SQL parameter indices automatically — eliminates manual $N bookkeeping. */
class ParamCollector {
  constructor() { this.values = []; }
  add(value) { this.values.push(value); return `$${this.values.length}`; }
}

/**
 * Validates and double-quote-escapes a SQL identifier (column/table name).
 * Rejects anything that isn't a simple lowercase identifier to prevent
 * SQL injection even if an upstream allowlist is bypassed.
 */
function safeId(name) {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

// Recognized synthetic phone prefixes used as identity keys for non-phone signups.
// Real E.164 phones always start with '+', so they can never collide with these.
const SYNTHETIC_PREFIXES = ['email:', 'google:', 'apple:'];

/**
 * Returns true if the value looks like a synthetic phone key (e.g. 'email:foo@bar.com').
 */
function isSyntheticPhone(value) {
  if (typeof value !== 'string') return false;
  return SYNTHETIC_PREFIXES.some(p => value.startsWith(p));
}

/**
 * Returns true if the value is a valid E.164 phone number.
 */
function isRealPhone(value) {
  return typeof value === 'string' && /^\+[1-9]\d{1,14}$/.test(value);
}

async function getUserByPhone(phone) {
  const result = await query('SELECT * FROM users WHERE phone = $1', [phone]);
  return result.rows[0] || null;
}

async function getUserById(id) {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getUserByEmail(email) {
  const result = await query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function getUserByGoogleId(googleId) {
  const result = await query('SELECT * FROM users WHERE google_id = $1', [googleId]);
  return result.rows[0] || null;
}

async function getUserByAppleId(appleId) {
  const result = await query('SELECT * FROM users WHERE apple_id = $1', [appleId]);
  return result.rows[0] || null;
}

async function linkUserIdentity(userId, fields) {
  const allowed = ['email', 'google_id', 'apple_id', 'phone'];
  const setClauses = [];
  const whereClauses = [];
  const conflictClauses = [];
  const p = new ParamCollector();

  const userRef = p.add(userId);

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && allowed.includes(key)) {
      const ref = p.add(value);
      // Only update if the column is NULL or already matches — never overwrite
      // a different existing value (prevents identity hijacking).
      const col = safeId(key);
      setClauses.push(`${col} = ${ref}`);
      whereClauses.push(`(${col} IS NULL OR ${col} = ${ref})`);
      // Atomic conflict check: ensure no *other* user already claims this identity.
      conflictClauses.push(`NOT EXISTS (SELECT 1 FROM users WHERE ${col} = ${ref} AND id != ${userRef})`);
    }
  }
  if (setClauses.length === 0) return null;

  setClauses.push('updated_at = NOW()');
  // Single atomic UPDATE that checks ownership, null-guards, AND conflict-free
  // conditions all in one WHERE clause — no separate SELECT needed.
  const result = await query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = ${userRef} AND ${whereClauses.join(' AND ')} AND ${conflictClauses.join(' AND ')} RETURNING *`,
    p.values
  );
  return result.rows[0] || null;
}

/**
 * Merge sourceUserId into targetUserId: move all data, copy identity
 * fields that target lacks, then delete the source account.
 * Must run inside a transaction.
 */
async function mergeUserAccounts(targetUserId, sourceUserId, txQuery) {
  // No-op when source and target are the same user — acquiring advisory locks
  // twice with the same ID pair could deadlock, and the merge logic would
  // delete the user's own data.
  if (targetUserId === sourceUserId) return;

  // Acquire advisory locks to serialize any concurrent merge involving these users.
  // pg_advisory_xact_lock is automatically released when the transaction ends.
  const lockId1 = Math.min(targetUserId, sourceUserId);
  const lockId2 = Math.max(targetUserId, sourceUserId);
  await txQuery('SELECT pg_advisory_xact_lock($1, $2)', [lockId1, lockId2]);

  // Lock and verify both users exist before moving any child rows.
  // SELECT ... FOR UPDATE prevents concurrent modifications even if the
  // caller didn't lock the rows (makes the function self-protecting).
  const [target] = (await txQuery('SELECT * FROM users WHERE id = $1 FOR UPDATE', [targetUserId])).rows;
  const [source] = (await txQuery('SELECT * FROM users WHERE id = $1 FOR UPDATE', [sourceUserId])).rows;
  if (!target || !source) return;

  // Move child rows from source → target
  await txQuery('UPDATE connected_apps SET user_id = $1 WHERE user_id = $2 AND app_slug NOT IN (SELECT app_slug FROM connected_apps WHERE user_id = $1)', [targetUserId, sourceUserId]);
  await txQuery('DELETE FROM connected_apps WHERE user_id = $1', [sourceUserId]);
  await txQuery('UPDATE conversation_history SET user_id = $1 WHERE user_id = $2', [targetUserId, sourceUserId]);
  await txQuery('UPDATE automation_rules SET user_id = $1 WHERE user_id = $2', [targetUserId, sourceUserId]);
  await txQuery('UPDATE reminders SET user_id = $1 WHERE user_id = $2', [targetUserId, sourceUserId]);
  await txQuery('UPDATE workflows SET user_id = $1 WHERE user_id = $2', [targetUserId, sourceUserId]);
  // Move pending replies BEFORE deleting workflow_runs, because
  // workflow_pending_replies has a CASCADE FK to workflow_runs — deleting
  // runs first would cascade-delete the pending replies we need to keep.
  await txQuery('UPDATE workflow_pending_replies SET user_id = $1 WHERE user_id = $2', [targetUserId, sourceUserId]);
  // workflow_runs and workflow_run_events have no user_id column; they are
  // linked to users through workflow_id → workflows(user_id).  Moving
  // workflows above reassociates them with the target user.  Explicitly
  // delete any stray records still tied to the source user's workflows so
  // they are not silently cascade-deleted when the source user row is removed.
  await txQuery(
    `DELETE FROM workflow_run_events WHERE run_id IN (
       SELECT wr.id FROM workflow_runs wr
       JOIN workflows w ON wr.workflow_id = w.id WHERE w.user_id = $1)`,
    [sourceUserId]
  );
  await txQuery(
    `DELETE FROM workflow_runs WHERE workflow_id IN (
       SELECT id FROM workflows WHERE user_id = $1)`,
    [sourceUserId]
  );

  const updates = {};
  if (!target.email && source.email) updates.email = source.email;
  if (!target.google_id && source.google_id) updates.google_id = source.google_id;
  if (!target.apple_id && source.apple_id) updates.apple_id = source.apple_id;
  if (!target.name && source.name) updates.name = source.name;
  if (!target.pin_hash && source.pin_hash) updates.pin_hash = source.pin_hash;
  // Prefer a real phone over a synthetic one
  if (source.phone && /^\+[1-9]\d{1,14}$/.test(source.phone)) {
    if (!target.phone || !(/^\+[1-9]\d{1,14}$/.test(target.phone))) {
      updates.phone = source.phone;
    }
  }
  // Merge preferences (target wins on conflicts)
  if (source.preferences && Object.keys(source.preferences).length > 0) {
    const merged = { ...source.preferences, ...target.preferences };
    updates.preferences = JSON.stringify(merged);
  }

  if (Object.keys(updates).length > 0) {
    const setClauses = [];
    const p = new ParamCollector();
    for (const [key, value] of Object.entries(updates)) {
      const ref = p.add(value);
      if (key === 'preferences') {
        setClauses.push(`${safeId('preferences')} = ${ref}::jsonb`);
      } else {
        setClauses.push(`${safeId(key)} = ${ref}`);
      }
    }
    setClauses.push('updated_at = NOW()');
    const targetRef = p.add(targetUserId);
    await txQuery(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ${targetRef}`, p.values);
  }

  // Clear source identity columns to avoid unique constraint violations, then delete
  await txQuery('UPDATE users SET phone = NULL, email = NULL, google_id = NULL, apple_id = NULL WHERE id = $1', [sourceUserId]);
  await txQuery('DELETE FROM users WHERE id = $1', [sourceUserId]);
}

async function createUser(phone, name) {
  // Use ON CONFLICT DO UPDATE with a no-op SET so RETURNING * always yields the
  // row in a single atomic statement — no follow-up SELECT that could miss a
  // concurrently deleted row (TOCTOU).
  const result = await query(
    'INSERT INTO users (phone, name) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING *',
    [phone, name || null]
  );
  return result.rows[0];
}

/**
 * Atomically get or create a user by phone number.
 * Uses INSERT ... ON CONFLICT DO UPDATE to guarantee a row is always returned,
 * eliminating the race where concurrent callers both see no row from DO NOTHING.
 * Returns { user, created } so callers know whether this is a new user.
 */
async function getOrCreateUserByPhone(phone, queryFn) {
  const q = queryFn || query;
  // Only accept real E.164 phone numbers — synthetic keys must use dedicated functions
  if (!isRealPhone(phone)) {
    throw new Error(`getOrCreateUserByPhone: refusing non-E.164 value "${phone.slice(0, 30)}"`);
  }
  // Upsert: on conflict, perform a no-op update (phone = phone) so RETURNING * always yields a row
  const res = await q(
    `INSERT INTO users (phone) VALUES ($1)
     ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
     RETURNING *, (xmax = 0) AS created`,
    [phone]
  );
  const row = res.rows[0];
  return { user: row, created: row.created };
}

/**
 * Atomically create a user with email set at insert time.
 * Prevents the TOCTOU race where concurrent signups both see no user
 * and both create separate accounts for the same email.
 * Returns { user, created } — created=false means an existing user was found.
 */
async function createUserByEmail(email, name) {
  // Reject emails that would produce a nested synthetic key (e.g. 'email:google:attacker')
  if (isSyntheticPhone(email) || isRealPhone(email)) {
    throw new Error('createUserByEmail: email looks like a synthetic key or phone number');
  }
  const phone = `email:${email}`;
  try {
    const result = await query(
      'INSERT INTO users (phone, name, email) VALUES ($1, $2, $3) RETURNING *',
      [phone, name || null, email]
    );
    return { user: result.rows[0], created: true };
  } catch (err) {
    // 23505 = unique_violation on phone or email index — another request won the race
    if (err.code === '23505') {
      const existing = await query(
        'SELECT * FROM users WHERE email = $1 OR phone = $2 LIMIT 1',
        [email, phone]
      );
      if (existing.rows[0]) return { user: existing.rows[0], created: false };
    }
    throw err;
  }
}

async function updateUserZapierAccount(userId, zapierAccountId) {
  const result = await query(
    'UPDATE users SET zapier_account_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [zapierAccountId, userId]
  );
  return result.rows[0];
}

const MAX_PREFERENCES_BYTES = 64 * 1024; // 64 KB limit for preferences JSONB

async function updateUserPreferences(userId, preferences) {
  return withTransaction(async (txQuery) => {
    // Lock the row to serialize concurrent preference merges
    const locked = await txQuery('SELECT preferences FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const current = locked.rows[0]?.preferences || {};
    const merged = { ...current, ...preferences };
    const mergedJson = JSON.stringify(merged);
    if (Buffer.byteLength(mergedJson, 'utf8') > MAX_PREFERENCES_BYTES) {
      throw Object.assign(new Error('Preferences size limit exceeded'), { code: 'PREFERENCES_TOO_LARGE' });
    }
    const result = await txQuery(
      'UPDATE users SET preferences = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *',
      [mergedJson, userId]
    );
    return result.rows[0];
  });
}

async function updateUserPin(userId, pinHash) {
  const result = await query(
    'UPDATE users SET pin_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [pinHash, userId]
  );
  return result.rows[0];
}

/**
 * Atomically set pin_hash only if the user currently has no pin.
 * Returns the updated row, or null if someone else set a pin first.
 */
async function claimUserPin(userId, pinHash) {
  const result = await query(
    'UPDATE users SET pin_hash = $1, updated_at = NOW() WHERE id = $2 AND pin_hash IS NULL RETURNING *',
    [pinHash, userId]
  );
  return result.rows[0] || null;
}

async function getConnectedApps(userId) {
  const result = await query(
    'SELECT * FROM connected_apps WHERE user_id = $1 AND status = $2 ORDER BY connected_at DESC',
    [userId, 'active']
  );
  return result.rows;
}

async function addConnectedApp(userId, appName, appSlug, zapierZapId) {
  const result = await query(
    `INSERT INTO connected_apps (user_id, app_name, app_slug, zapier_zap_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, app_slug) DO UPDATE SET
       app_name = EXCLUDED.app_name,
       zapier_zap_id = EXCLUDED.zapier_zap_id,
       status = 'active',
       connected_at = NOW()
     RETURNING *`,
    [userId, appName, appSlug, zapierZapId || null]
  );
  return result.rows[0];
}

async function removeConnectedApp(userId, appSlug) {
  const result = await query(
    "UPDATE connected_apps SET status = 'disconnected' WHERE user_id = $1 AND app_slug = $2 RETURNING *",
    [userId, appSlug]
  );
  return result.rows[0];
}

async function addConversationMessage(userId, role, content) {
  const result = await query(
    'INSERT INTO conversation_history (user_id, role, content) VALUES ($1, $2, $3) RETURNING *',
    [userId, role, content]
  );
  return result.rows[0];
}

async function createReminder(userId, message, fireAt) {
  const result = await query(
    'INSERT INTO reminders (user_id, message, fire_at) VALUES ($1, $2, $3) RETURNING *',
    [userId, message, fireAt]
  );
  return result.rows[0];
}

async function getPendingReminders() {
  const result = await query(
    'SELECT r.*, u.phone, u.name FROM reminders r JOIN users u ON r.user_id = u.id WHERE r.fire_at <= NOW() AND r.fired = false'
  );
  return result.rows;
}

async function markReminderFired(id, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await query('UPDATE reminders SET fired = true WHERE id = $1', [id]);
      return result;
    } catch (err) {
      if (attempt === maxRetries) {
        throw new Error(`markReminderFired failed after ${maxRetries} attempts for reminder ${id}: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
}

async function createWorkflow(userId, { name, description, trigger_type, cron_expression, trigger_config, actions, steps, variables }) {
  const result = await query(
    `INSERT INTO workflows (user_id, name, description, trigger_type, cron_expression, trigger_config, actions, steps, variables)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [userId, name, description || null, trigger_type, cron_expression || null, trigger_config ? JSON.stringify(trigger_config) : null, JSON.stringify(actions || []), JSON.stringify(steps || []), JSON.stringify(variables || {})]
  );
  return result.rows[0];
}

async function listWorkflows(userId, { limit, offset } = {}) {
  if (Number.isFinite(limit) && Number.isFinite(offset)) {
    const countResult = await query(
      'SELECT COUNT(*) FROM workflows WHERE user_id = $1 AND active = true',
      [userId]
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const result = await query(
      'SELECT * FROM workflows WHERE user_id = $1 AND active = true ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    return { rows: result.rows, total };
  }
  const result = await query(
    'SELECT * FROM workflows WHERE user_id = $1 AND active = true ORDER BY created_at DESC',
    [userId]
  );
  return { rows: result.rows, total: result.rows.length };
}

async function cancelWorkflow(workflowId, userId) {
  const result = await query(
    'UPDATE workflows SET active = false, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
    [workflowId, userId]
  );
  return result.rows[0];
}

async function createWorkflowRun(workflowId) {
  const result = await query(
    "INSERT INTO workflow_runs (workflow_id, status) VALUES ($1, 'pending') RETURNING *",
    [workflowId]
  );
  return result.rows[0];
}

async function updateWorkflowRun(runId, { status, result: runResult, error, started_at, completed_at }) {
  const fields = [];
  const p = new ParamCollector();

  if (status !== undefined) { fields.push(`status = ${p.add(status)}`); }
  if (runResult !== undefined) { fields.push(`result = ${p.add(JSON.stringify(runResult))}`); }
  if (error !== undefined) { fields.push(`error = ${p.add(error)}`); }
  if (started_at !== undefined) { fields.push(`started_at = ${p.add(started_at)}`); }
  if (completed_at !== undefined) { fields.push(`completed_at = ${p.add(completed_at)}`); }

  if (fields.length === 0) return null;

  const idRef = p.add(runId);
  const res = await query(
    `UPDATE workflow_runs SET ${fields.join(', ')} WHERE id = ${idRef} RETURNING *`,
    p.values
  );
  return res.rows[0];
}

async function deleteUser(userId) {
  await withTransaction(async (txQuery) => {
    // Lock the row to prevent concurrent modifications during deletion
    const locked = await txQuery('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!locked.rows.length) {
      throw Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND' });
    }
    // ON DELETE CASCADE on foreign keys handles related data cleanup
    await txQuery('DELETE FROM users WHERE id = $1', [userId]);
  });
}

async function updatePushToken(userId, token) {
  // Only update (and bump updated_at) when the token actually changes
  const result = await query(
    'UPDATE users SET push_token = $1, updated_at = NOW() WHERE id = $2 AND push_token IS DISTINCT FROM $1 RETURNING *',
    [token, userId]
  );
  // If no rows returned, the token was already set — fetch the current user
  if (!result.rows[0]) {
    const current = await query('SELECT * FROM users WHERE id = $1', [userId]);
    return current.rows[0];
  }
  return result.rows[0];
}

// --- Workflow Engine v2 queries ---

async function getWorkflowById(workflowId) {
  const result = await query('SELECT * FROM workflows WHERE id = $1', [workflowId]);
  return result.rows[0] || null;
}

async function updateWorkflowRunMessages(runId, { messages, step_log, context, status }) {
  const fields = [];
  const p = new ParamCollector();
  if (messages !== undefined) { fields.push(`messages = ${p.add(JSON.stringify(messages))}`); }
  if (step_log !== undefined) { fields.push(`step_log = ${p.add(JSON.stringify(step_log))}`); }
  if (context !== undefined) { fields.push(`context = ${p.add(JSON.stringify(context))}`); }
  if (status !== undefined) { fields.push(`status = ${p.add(status)}`); }
  if (fields.length === 0) return null;
  const idRef = p.add(runId);
  const res = await query(`UPDATE workflow_runs SET ${fields.join(', ')} WHERE id = ${idRef} RETURNING *`, p.values);
  return res.rows[0];
}

/**
 * Append-only update for workflow run state.
 * Messages and step_log entries are INSERTed into the workflow_run_events table
 * (cheap, constant-size writes) instead of rewriting ever-growing JSONB arrays.
 * Context is shallow-merged on the run row (stays small).
 */
async function appendWorkflowRunState(runId, { newMessages, newStepLogs, contextPatch, status }) {
  await withTransaction(async (txQuery) => {
    // Advisory lock keyed on run_id serializes concurrent appends for the same
    // run without depending on a FOR UPDATE lock on a different table.  The two
    // halves of the UUID are combined into a single bigint hash so
    // pg_advisory_xact_lock gets a stable, collision-resistant key.
    await txQuery(
      `SELECT pg_advisory_xact_lock(('x' || left(replace($1::text, '-', ''), 16))::bit(64)::bigint)`,
      [runId]
    );

    // Verify the run still exists after acquiring the lock — it may have been
    // cascade-deleted while we waited, and inserting into workflow_run_events
    // with a missing run_id would violate the FK constraint.
    const runCheck = await txQuery('SELECT id FROM workflow_runs WHERE id = $1', [runId]);
    if (runCheck.rows.length === 0) return;

    const eventRows = [];
    if ((newMessages && newMessages.length > 0) || (newStepLogs && newStepLogs.length > 0)) {
      const seqRes = await txQuery(
        'SELECT COALESCE(MAX(seq), -1) AS max_seq FROM workflow_run_events WHERE run_id = $1',
        [runId]
      );
      let seq = seqRes.rows[0].max_seq + 1;

      if (newMessages && newMessages.length > 0) {
        for (const msg of newMessages) {
          eventRows.push({ seq: seq++, ev_type: 'message', data: msg });
        }
      }
      if (newStepLogs && newStepLogs.length > 0) {
        for (const entry of newStepLogs) {
          eventRows.push({ seq: seq++, ev_type: 'step_log', data: entry });
        }
      }
    }

    if (eventRows.length > 0) {
      const valParts = [];
      const ep = new ParamCollector();
      const runRef = ep.add(runId);
      for (const row of eventRows) {
        const seqRef = ep.add(row.seq);
        const typeRef = ep.add(row.ev_type);
        const dataRef = ep.add(JSON.stringify(row.data));
        valParts.push(`(${runRef}, ${seqRef}, ${typeRef}, ${dataRef}::jsonb)`);
      }
      await txQuery(
        `INSERT INTO workflow_run_events (run_id, seq, ev_type, data) VALUES ${valParts.join(', ')}`,
        ep.values
      );
    }

    const fields = [];
    const up = new ParamCollector();
    if (contextPatch && Object.keys(contextPatch).length > 0) {
      fields.push(`context = COALESCE(context, '{}'::jsonb) || ${up.add(JSON.stringify(contextPatch))}::jsonb`);
    }
    if (status !== undefined) {
      fields.push(`status = ${up.add(status)}`);
    }
    if (fields.length > 0) {
      const idRef = up.add(runId);
      await txQuery(`UPDATE workflow_runs SET ${fields.join(', ')} WHERE id = ${idRef}`, up.values);
    }
  });
}

/**
 * Reconstruct messages and step_log arrays from the workflow_run_events table.
 */
async function loadWorkflowRunEvents(runId) {
  const res = await query(
    'SELECT ev_type, data FROM workflow_run_events WHERE run_id = $1 ORDER BY seq',
    [runId]
  );
  const messages = [];
  const stepLog = [];
  for (const row of res.rows) {
    if (row.ev_type === 'message') messages.push(row.data);
    else if (row.ev_type === 'step_log') stepLog.push(row.data);
  }
  return { messages, stepLog };
}

async function getWorkflowRun(runId) {
  const result = await query('SELECT * FROM workflow_runs WHERE id = $1', [runId]);
  return result.rows[0] || null;
}

async function claimWorkflowRunForResume(runId) {
  return withTransaction(async (txQuery) => {
    const lock = await txQuery(
      "SELECT id FROM workflow_runs WHERE id = $1 AND status IN ('waiting', 'delayed') FOR UPDATE SKIP LOCKED",
      [runId]
    );
    if (lock.rows.length === 0) return null;
    const result = await txQuery(
      "UPDATE workflow_runs SET status = 'running' WHERE id = $1 RETURNING *",
      [runId]
    );
    return result.rows[0] || null;
  });
}

async function getLastWorkflowRunContext(workflowId) {
  const result = await query(
    "SELECT context FROM workflow_runs WHERE workflow_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 1",
    [workflowId]
  );
  return result.rows[0]?.context || {};
}

// --- Template queries ---

async function createTemplate({ name, description, category, steps, variables, system_prompt, author_user_id, is_system }) {
  const result = await query(
    `INSERT INTO workflow_templates (name, description, category, steps, variables, system_prompt, author_user_id, is_system)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [name, description || null, category || null, JSON.stringify(steps || []), JSON.stringify(variables || {}), system_prompt || null, author_user_id || null, is_system || false]
  );
  return result.rows[0];
}

async function searchTemplates(searchTerm, category, { limit, offset, userId } = {}) {
  // Only return system templates and the current user's own templates
  const p = new ParamCollector();
  let whereSql = ' WHERE (is_system = true';
  if (userId) {
    whereSql += ` OR author_user_id = ${p.add(userId)}`;
  }
  whereSql += ')';
  if (searchTerm) {
    const escaped = searchTerm.replace(/[%_\\]/g, '\\$&');
    const termRef = p.add(`%${escaped}%`);
    whereSql += ` AND (name ILIKE ${termRef} ESCAPE '\\' OR description ILIKE ${termRef} ESCAPE '\\')`;
  }
  if (category) {
    whereSql += ` AND category = ${p.add(category)}`;
  }

  if (Number.isFinite(limit) && Number.isFinite(offset)) {
    const countResult = await query(`SELECT COUNT(*) FROM workflow_templates${whereSql}`, p.values);
    const total = parseInt(countResult.rows[0].count, 10);
    const limitRef = p.add(limit);
    const offsetRef = p.add(offset);
    const pageSql = `SELECT * FROM workflow_templates${whereSql} ORDER BY usage_count DESC, created_at DESC LIMIT ${limitRef} OFFSET ${offsetRef}`;
    const result = await query(pageSql, p.values);
    return { rows: result.rows, total };
  }
  const sql = `SELECT * FROM workflow_templates${whereSql} ORDER BY usage_count DESC, created_at DESC`;
  const result = await query(sql, p.values);
  return { rows: result.rows, total: result.rows.length };
}

async function getTemplateById(templateId) {
  const result = await query('SELECT * FROM workflow_templates WHERE id = $1', [templateId]);
  return result.rows[0] || null;
}

async function incrementTemplateUsage(templateId) {
  await query('UPDATE workflow_templates SET usage_count = usage_count + 1 WHERE id = $1', [templateId]);
}

// --- Pending replies queries ---

async function createPendingReply({ run_id, workflow_id, user_id, prompt_text }) {
  const result = await query(
    'INSERT INTO workflow_pending_replies (run_id, workflow_id, user_id, prompt_text) VALUES ($1, $2, $3, $4) RETURNING *',
    [run_id, workflow_id, user_id, prompt_text]
  );
  return result.rows[0];
}

async function getPendingReplyForUser(userId) {
  const result = await query(
    'SELECT * FROM workflow_pending_replies WHERE user_id = $1 AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE SKIP LOCKED',
    [userId]
  );
  return result.rows[0] || null;
}

async function resolvePendingReply(replyId, replyText) {
  const result = await query(
    'UPDATE workflow_pending_replies SET resolved_at = NOW(), reply_text = $1 WHERE id = $2 AND resolved_at IS NULL RETURNING *',
    [replyText, replyId]
  );
  return result.rows[0] || null;
}

/**
 * Atomically claim and resolve the most recent pending reply for a user.
 * Uses FOR UPDATE SKIP LOCKED so concurrent requests cannot claim the same row.
 * Returns the claimed row or null if none available (already claimed by another request).
 */
async function claimPendingReplyForUser(userId, replyText) {
  const result = await query(
    `UPDATE workflow_pending_replies
     SET resolved_at = NOW(), reply_text = $2
     WHERE id = (
       SELECT id FROM workflow_pending_replies
       WHERE user_id = $1 AND resolved_at IS NULL
       ORDER BY created_at DESC LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [userId, replyText]
  );
  return result.rows[0] || null;
}

async function unclaimPendingReply(replyId) {
  await query(
    `UPDATE workflow_pending_replies
     SET resolved_at = NULL, reply_text = NULL
     WHERE id = $1`,
    [replyId]
  );
}

/**
 * Persist a blacklist entry to PostgreSQL (write-through from Redis).
 * Uses ON CONFLICT to upsert — logout-all may overwrite a previous timestamp.
 */
async function persistBlacklistEntry(key, value, ttlSeconds) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await query(
    `INSERT INTO token_blacklist (key, value, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = $2, expires_at = $3`,
    [key, value, expiresAt]
  );
}

/**
 * Check the persistent blacklist for the given keys.
 * Returns an array of { key, value } for entries that exist and haven't expired.
 */
async function checkBlacklistEntries(keys) {
  if (!keys.length) return [];
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const result = await query(
    `SELECT key, value FROM token_blacklist
     WHERE key IN (${placeholders}) AND expires_at > NOW()`,
    keys
  );
  return result.rows;
}

/**
 * Remove expired blacklist entries. Call periodically to prevent table bloat.
 */
async function purgeExpiredBlacklistEntries() {
  await query('DELETE FROM token_blacklist WHERE expires_at <= NOW()');
}

module.exports = {
  getUserByPhone,
  getUserByEmail,
  getUserByGoogleId,
  getUserByAppleId,
  getUserById,
  createUser,
  getOrCreateUserByPhone,
  createUserByEmail,
  linkUserIdentity,
  deleteUser,
  updateUserZapierAccount,
  updateUserPreferences,
  updateUserPin,
  claimUserPin,
  getConnectedApps,
  addConnectedApp,
  removeConnectedApp,
  addConversationMessage,
  createReminder,
  getPendingReminders,
  markReminderFired,
  createWorkflow,
  listWorkflows,
  cancelWorkflow,
  createWorkflowRun,
  updateWorkflowRun,
  updatePushToken,
  getWorkflowById,
  updateWorkflowRunMessages,
  appendWorkflowRunState,
  loadWorkflowRunEvents,
  getWorkflowRun,
  claimWorkflowRunForResume,
  getLastWorkflowRunContext,
  createTemplate,
  searchTemplates,
  getTemplateById,
  incrementTemplateUsage,
  createPendingReply,
  getPendingReplyForUser,
  resolvePendingReply,
  claimPendingReplyForUser,
  unclaimPendingReply,
  mergeUserAccounts,
  isSyntheticPhone,
  isRealPhone,
  persistBlacklistEntry,
  checkBlacklistEntries,
  purgeExpiredBlacklistEntries,
};
