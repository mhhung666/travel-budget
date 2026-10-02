import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 一筆「實際還款」紀錄，讓結算從「只計算」變成有閉環的「標記已付」。
 *
 * `from` 付給 `to` `amount`（基準幣 TWD，與 Expense.amount / splits.shareAmount
 * 一致，結算餘額才能直接相減）。結算時把這些 payment 淨額抵銷掉應收／應付，
 * 餘額才得以歸零。刪除 Trip 時需一併刪除（無外鍵 cascade，見 deleteTrip）。
 */
const PaymentSchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    note: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

PaymentSchema.index({ trip: 1, createdAt: -1 });

export type PaymentDoc = InferSchemaType<typeof PaymentSchema>;

export const Payment: Model<PaymentDoc> =
  (mongoose.models.Payment as Model<PaymentDoc>) ??
  mongoose.model<PaymentDoc>('Payment', PaymentSchema);
