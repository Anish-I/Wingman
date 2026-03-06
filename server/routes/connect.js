const express = require('express');
const router = express.Router();
// App connection via Zapier Embed removed — using NLA (nla.zapier.com) instead
router.all('*', (req, res) => res.status(404).json({ error: 'Not implemented' }));
module.exports = router;
