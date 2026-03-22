const { query, withTransaction } = require('./index');

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
  const values = [];
  let idx = 1;
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && allowed.includes(key)) {
      setClauses.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  if (setClauses.length === 0) return null;
  setClauses.push('updated_at = NOW()');
  values.push(userId);
  const result = await query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0];
}

/**
 * Merge sourceUserId into targetUserId: move all data, copy identity
 * fields that target lacks, then delete the source account.
 * Must run inside a transaction.
 */
async function mergeUserAccounts(targetUserId, sourceUserId, txQuery) {
  // Move child rows from source → target
  await txQuery('UPDATE connected_apps SET user_id = $1 WHERE user_id = $2 AND app_slug NOT IN (SELECT app_slug FROM connected_apps WHERE user_id = $1)', [targetUserId, sourceUserId]);
  await txQuery('DELETE FROM connected_apps WHERE user_id = $1', [sourceUserId]);
  await txQuery('UPDATE conversation_history SET user_id = $1 WHERE user_id = $2', [targetUserId, sourceUserId]);
  await txQuery('UPDATE automation_rules SET user_id = $1 WHERE user_id = $2', [targetUserId, sourceUserId]);
  await txQuery('UPDATE reminders SET user_id = $1 WHERE user_id = $2', [targetUserId, sourceUserId]);
  await txQuery('UPDATE workflows SET user_id = $1 WHERE user_id = $2', [targetUserId, sourceUserId]);
  await txQuery('UPDATE workflow_pending_replies SET user_id = $1 WHERE user_id = $2', [targetUserId, sourceUserId]);

  // Copy identity fields that target lacks from source
  const [target] = (await txQuery('SELECT * FROM users WHERE id = $1', [targetUserId])).rows;
  const [source] = (await txQuery('SELECT * FROM users WHERE id = $1', [sourceUserId])).rows;
  if (!target || !source) return;

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
    const values = [];
    let idx = 1;
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'preferences') {
        setClauses.push(`preferences = $${idx++}::jsonb`);
      } else {
        setClauses.push(`${key} = $${idx++}`);
      }
      values.push(value);
    }
    setClauses.push('updated_at = NOW()');
    values.push(targetUserId);
    await txQuery(`UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
  }

  // Clear source identity columns to avoid unique constraint violations, then delete
  await txQuery('UPDATE users SET phone = NULL, email = NULL, google_id = NULL, apple_id = NULL WHERE id = $1', [sourceUserId]);
  await txQuery('DELETE FROM users WHERE id = $1', [sourceUserId]);
}

async function createUser(phone, name) {
  try {
    const result = await query(
      'INSERT INTO users (phone, name) VALUES ($1, $2) RETURNING *',
      [phone, name || null]
    );
    return result.rows[0];
  } catch (err) {
    // Handle TOCTOU race: concurrent insert for the same phone hits unique constraint.
    // Return the existing row instead of throwing (PostgreSQL error code 23505).
    if (err.code === '23505' && phone) {
      const existing = await query('SELECT * FROM users WHERE phone = $1', [phone]);
      if (existing.rows[0]) return existing.rows[0];
    }
    throw err;
  }
}

/**
 * Atomically create a user with email set at insert time.
 * Prevents the TOCTOU race where concurrent signups both see no user
 * and both create separate accounts for the same email.
 * Returns { user, created } — created=false means an existing user was found.
 */
async function createUserByEmail(email, name) {
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

async function updateUserPreferences(userId, preferences) {
  const result = await query(
    'UPDATE users SET preferences = preferences || $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *',
    [JSON.stringify(preferences), userId]
  );
  return result.rows[0];
}

async function updateUserPin(userId, pinHash) {
  const result = await query(
    'UPDATE users SET pin_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [pinHash, userId]
  );
  return result.rows[0];
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

async function markReminderFired(id) {
  await query('UPDATE reminders SET fired = true WHERE id = $1', [id]);
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
  const values = [];
  let idx = 1;

  if (status !== undefined) { fields.push(`status = $${idx++}`); values.push(status); }
  if (runResult !== undefined) { fields.push(`result = $${idx++}`); values.push(JSON.stringify(runResult)); }
  if (error !== undefined) { fields.push(`error = $${idx++}`); values.push(error); }
  if (started_at !== undefined) { fields.push(`started_at = $${idx++}`); values.push(started_at); }
  if (completed_at !== undefined) { fields.push(`completed_at = $${idx++}`); values.push(completed_at); }

  if (fields.length === 0) return null;

  values.push(runId);
  const res = await query(
    `UPDATE workflow_runs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return res.rows[0];
}

async function deleteUser(userId) {
  await query('DELETE FROM users WHERE id = $1', [userId]);
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
  const values = [];
  let idx = 1;
  if (messages !== undefined) { fields.push(`messages = $${idx++}`); values.push(JSON.stringify(messages)); }
  if (step_log !== undefined) { fields.push(`step_log = $${idx++}`); values.push(JSON.stringify(step_log)); }
  if (context !== undefined) { fields.push(`context = $${idx++}`); values.push(JSON.stringify(context)); }
  if (status !== undefined) { fields.push(`status = $${idx++}`); values.push(status); }
  if (fields.length === 0) return null;
  values.push(runId);
  const res = await query(`UPDATE workflow_runs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
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
    // Serialize appends per run so seq allocation and context/status updates stay ordered.
    await txQuery('SELECT id FROM workflow_runs WHERE id = $1 FOR UPDATE', [runId]);

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
      const vals = [runId];
      let idx = 2;
      for (const row of eventRows) {
        valParts.push(`($1, $${idx++}, $${idx++}, $${idx++}::jsonb)`);
        vals.push(row.seq, row.ev_type, JSON.stringify(row.data));
      }
      await txQuery(
        `INSERT INTO workflow_run_events (run_id, seq, ev_type, data) VALUES ${valParts.join(', ')}`,
        vals
      );
    }

    const fields = [];
    const values = [];
    let fieldIdx = 1;
    if (contextPatch && Object.keys(contextPatch).length > 0) {
      fields.push(`context = COALESCE(context, '{}'::jsonb) || $${fieldIdx++}::jsonb`);
      values.push(JSON.stringify(contextPatch));
    }
    if (status !== undefined) {
      fields.push(`status = $${fieldIdx++}`);
      values.push(status);
    }
    if (fields.length > 0) {
      values.push(runId);
      await txQuery(`UPDATE workflow_runs SET ${fields.join(', ')} WHERE id = $${fieldIdx}`, values);
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
  let whereSql = ' WHERE (is_system = true';
  const values = [];
  let idx = 1;
  if (userId) {
    whereSql += ` OR author_user_id = $${idx}`;
    values.push(userId);
    idx++;
  }
  whereSql += ')';
  if (searchTerm) {
    const escaped = searchTerm.replace(/[%_\\]/g, '\\$&');
    whereSql += ` AND (name ILIKE $${idx} ESCAPE '\\' OR description ILIKE $${idx} ESCAPE '\\')`;
    values.push(`%${escaped}%`);
    idx++;
  }
  if (category) {
    whereSql += ` AND category = $${idx}`;
    values.push(category);
    idx++;
  }

  if (Number.isFinite(limit) && Number.isFinite(offset)) {
    const countResult = await query(`SELECT COUNT(*) FROM workflow_templates${whereSql}`, values);
    const total = parseInt(countResult.rows[0].count, 10);
    const pageSql = `SELECT * FROM workflow_templates${whereSql} ORDER BY usage_count DESC, created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    const result = await query(pageSql, [...values, limit, offset]);
    return { rows: result.rows, total };
  }
  const sql = `SELECT * FROM workflow_templates${whereSql} ORDER BY usage_count DESC, created_at DESC`;
  const result = await query(sql, values);
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
    'SELECT * FROM workflow_pending_replies WHERE user_id = $1 AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  return result.rows[0] || null;
}

async function resolvePendingReply(replyId, replyText) {
  const result = await query(
    'UPDATE workflow_pending_replies SET resolved_at = NOW(), reply_text = $1 WHERE id = $2 RETURNING *',
    [replyText, replyId]
  );
  return result.rows[0];
}

module.exports = {
  getUserByPhone,
  getUserByEmail,
  getUserByGoogleId,
  getUserByAppleId,
  getUserById,
  createUser,
  createUserByEmail,
  linkUserIdentity,
  deleteUser,
  updateUserZapierAccount,
  updateUserPreferences,
  updateUserPin,
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
  getLastWorkflowRunContext,
  createTemplate,
  searchTemplates,
  getTemplateById,
  incrementTemplateUsage,
  createPendingReply,
  getPendingReplyForUser,
  resolvePendingReply,
  mergeUserAccounts,
};
