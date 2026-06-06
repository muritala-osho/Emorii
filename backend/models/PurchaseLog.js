const mongoose = require('mongoose');

const purchaseLogSchema = new mongoose.Schema({
  userId:               { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  platform:             { type: String, enum: ['ios', 'android'], required: true },
  productId:            { type: String },
  eventType:            { type: String, required: true },
  idempotencyKey:       { type: String, required: true, unique: true },
  originalTransactionId:{ type: String, index: true },
  purchaseToken:        { type: String, index: true },
  expiresAt:            { type: Date },
  environment:          { type: String },
}, { timestamps: true });

async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    if (
      err.code === 20 ||
      err.codeName === 'IllegalOperation' ||
      (err.message && err.message.includes('Transaction numbers are only allowed'))
    ) {
      return fn(null);
    }
    throw err;
  } finally {
    session.endSession();
  }
}

purchaseLogSchema.statics.withTransaction = withTransaction;

module.exports = mongoose.model('PurchaseLog', purchaseLogSchema);
