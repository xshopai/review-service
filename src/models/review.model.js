import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    // Core review data
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    // Purchase verification
    isVerifiedPurchase: {
      type: Boolean,
      default: false,
      index: true,
    },
    orderReference: {
      type: String,
      sparse: true,
    },

    // Review status
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'hidden'],
      default: 'pending',
      index: true,
    },

    // Helpful voting system
    helpfulVotes: {
      helpful: {
        type: Number,
        default: 0,
        min: 0,
      },
      notHelpful: {
        type: Number,
        default: 0,
        min: 0,
      },
      userVotes: [
        {
          userId: {
            type: String,
            required: true,
          },
          vote: {
            type: String,
            enum: ['helpful', 'notHelpful'],
            required: true,
          },
          votedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
    },

    // Audit fields (4-field pattern)
    createdBy: {
      type: String,
      required: true,
    },
    updatedBy: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    toJSON: { virtuals: true },
  }
);

// Essential indexes
reviewSchema.index({ productId: 1, status: 1 });
reviewSchema.index({ userId: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

// Text search for review content
reviewSchema.index({
  title: 'text',
  comment: 'text',
});

// Pre-save validation and audit field updates
reviewSchema.pre('save', function (next) {
  // Ensure at least title or comment exists
  if (!this.title?.trim() && !this.comment?.trim()) {
    return next(new Error('Review must have either a title or comment'));
  }

  // Update audit fields
  const now = new Date();
  if (this.isNew) {
    // For new documents, set createdBy and createdAt
    if (!this.createdBy) {
      this.createdBy = this.userId; // Use userId as createdBy
    }
    this.createdAt = now;
  }

  // Always update updatedBy and updatedAt
  this.updatedBy = this.userId; // Use userId as updatedBy
  this.updatedAt = now;

  next();
});

// Static method for product statistics
reviewSchema.statics.getProductStats = async function (productId) {
  const pipeline = [
    { $match: { productId, status: 'approved' } },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        averageRating: { $avg: '$rating' },
        verifiedReviews: { $sum: { $cond: ['$isVerifiedPurchase', 1, 0] } },
        ratingDistribution: { $push: '$rating' },
      },
    },
  ];

  const [result] = await this.aggregate(pipeline);
  return (
    result || {
      totalReviews: 0,
      averageRating: 0,
      verifiedReviews: 0,
      ratingDistribution: [],
    }
  );
};

// Create indexes for query performance (required for Cosmos DB MongoDB API)
// createdAt is used for sorting reviews by date
reviewSchema.index({ createdAt: -1 });
// Compound index for product reviews sorted by date
reviewSchema.index({ productId: 1, createdAt: -1 });

export default mongoose.model('Review', reviewSchema);
