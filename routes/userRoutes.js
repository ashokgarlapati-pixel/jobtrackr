const express = require('express');
const router = express.Router();
const User = require('../models/User');

const handleErrors = (error, res) => {
  if (error.code === 11000) {
    return res.status(400).json({
      error: 'Validation failed',
      messages: { email: 'Email already exists' }
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      error: `Invalid ${error.path}: ${error.value}`
    });
  }

  if (error.name === 'ValidationError') {
    const messages = {};
    for (let field in error.errors) {
      messages[field] = error.errors[field].message;
    }
    return res.status(400).json({
      error: 'Validation failed',
      messages
    });
  }

  return res.status(500).json({ error: error.message || 'Server error' });
};

// GET /api/users
// Get all users
router.get('/', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    handleErrors(error, res);
  }
});

// GET /api/users/:id
// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    handleErrors(error, res);
  }
});

// POST /api/users
// Create new user
router.post('/', async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = new User({ name, email });
    await user.save();
    res.status(201).json(user);
  } catch (error) {
    handleErrors(error, res);
  }
});

module.exports = router;
