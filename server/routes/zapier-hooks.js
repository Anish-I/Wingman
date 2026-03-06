const express = require('express');
const router = express.Router();
// Zapier inbound hooks not in use
router.all('*', (req, res) => res.status(404).json({ error: 'Not implemented' }));
module.exports = router;
