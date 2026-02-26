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
};
