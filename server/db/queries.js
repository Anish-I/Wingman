const { query } = require('./index');

async function getUserByPhone(phone) {
  const result = await query('SELECT * FROM users WHERE phone = $1', [phone]);
  return result.rows[0] || null;
}

async function getUserById(id) {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createUser(phone, name) {
  const result = await query(
    'INSERT INTO users (phone, name) VALUES ($1, $2) RETURNING *',
    [phone, name || null]
  );
  return result.rows[0];
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

async function createWorkflow(userId, { name, description, trigger_type, cron_expression, trigger_config, actions }) {
  const result = await query(
    `INSERT INTO workflows (user_id, name, description, trigger_type, cron_expression, trigger_config, actions)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, name, description || null, trigger_type, cron_expression || null, trigger_config ? JSON.stringify(trigger_config) : null, JSON.stringify(actions || [])]
  );
  return result.rows[0];
}

async function listWorkflows(userId) {
  const result = await query(
    'SELECT * FROM workflows WHERE user_id = $1 AND active = true ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
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

async function updatePushToken(userId, token) {
  const result = await query(
    'UPDATE users SET push_token = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [token, userId]
  );
  return result.rows[0];
}

module.exports = {
  getUserByPhone,
  getUserById,
  createUser,
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
};
