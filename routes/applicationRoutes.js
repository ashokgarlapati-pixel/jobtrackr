const express = require('express');
const router = express.Router();
const Application = require('../models/Application');

// Helper to format Mongoose errors
const handleErrors = (error, res) => {
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

// GET /api/applications/stats
// Aggregation pipeline to calculate counts by status and average offer salary
router.get('/stats', async (req, res) => {
  try {
    // 1. Group applications by status and count them, sorted by count descending
    const statusCounts = await Application.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // 2. Calculate average salary for offers only
    const offerStats = await Application.aggregate([
      {
        $match: {
          status: 'Offer',
          salary: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          avgSalary: { $avg: '$salary' }
        }
      }
    ]);

    const averageOfferSalary = offerStats.length > 0
      ? Math.round(offerStats[0].avgSalary)
      : 0;

    res.json({
      statusCounts,
      averageOfferSalary
    });
  } catch (error) {
    handleErrors(error, res);
  }
});

// GET /api/applications
// List applications with pagination and owner populated
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.owner) {
      filter.owner = req.query.owner;
    }

    const total = await Application.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    const applications = await Application.find(filter)
      .populate('owner', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      page,
      limit,
      total,
      totalPages,
      applications
    });
  } catch (error) {
    handleErrors(error, res);
  }
});

// GET /api/applications/:id
// Get single application by ID with owner populated
router.get('/:id', async (req, res) => {
  try {
    const application = await Application.findById(req.params.id).populate('owner', 'name email');

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(application);
  } catch (error) {
    handleErrors(error, res);
  }
});

// POST /api/applications
// Create new application
router.post('/', async (req, res) => {
  try {
    const { company, role, owner, status, salary, notes } = req.body;

    const application = new Application({
      company,
      role,
      owner,
      status,
      salary,
      notes: notes || []
    });

    await application.save();
    await application.populate('owner', 'name email');

    res.status(201).json(application);
  } catch (error) {
    handleErrors(error, res);
  }
});

// PUT /api/applications/:id
// Update application
router.put('/:id', async (req, res) => {
  try {
    const application = await Application.findByIdAndUpdate(
      req.params.id,
      req.body,
      { returnDocument: 'after', runValidators: true }
    ).populate('owner', 'name email');

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(application);
  } catch (error) {
    handleErrors(error, res);
  }
});

// DELETE /api/applications/:id
// Delete application
router.delete('/:id', async (req, res) => {
  try {
    const application = await Application.findByIdAndDelete(req.params.id);

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({ message: 'Application deleted successfully' });
  } catch (error) {
    handleErrors(error, res);
  }
});

// POST /api/applications/:id/notes
// Add a note to an application and return with populated owner
router.post('/:id/notes', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({
        error: 'Validation failed',
        messages: { text: 'Note text is required' }
      });
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    application.notes.push({ text: text.trim() });
    await application.save();
    await application.populate('owner', 'name email');

    res.status(200).json(application);
  } catch (error) {
    handleErrors(error, res);
  }
});

module.exports = router;
