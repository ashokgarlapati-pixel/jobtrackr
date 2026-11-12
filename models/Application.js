const mongoose = require('mongoose');

// Embedded subdocument schema for notes
const noteSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'Note text is required'],
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const applicationSchema = new mongoose.Schema(
  {
    company: {
      type: String,
      required: [true, 'Company is required'],
      trim: true
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
      trim: true
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner is required']
    },
    notes: [noteSchema],
    status: {
      type: String,
      enum: {
        values: ['Applied', 'Interview', 'Offer', 'Rejected'],
        message: '{VALUE} is not a valid status'
      },
      default: 'Applied'
    },
    salary: {
      type: Number,
      min: [0, 'Salary must be a positive number']
    }
  },
  {
    timestamps: true
  }
);

// Compound index on owner and status for fast queries
applicationSchema.index({ owner: 1, status: 1 });

module.exports = mongoose.model('Application', applicationSchema);
