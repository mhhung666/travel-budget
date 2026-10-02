import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    refreshHash: { type: String, required: true },
    credentialHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'mobile_session_expiry' });
type Session = InferSchemaType<typeof schema>;
export const MobileSession: Model<Session> =
  (mongoose.models.MobileSession as Model<Session>) ??
  mongoose.model<Session>('MobileSession', schema);

const throttleSchema = new Schema({
  _id: { type: String, required: true },
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
});
throttleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'mobile_login_expiry' });
type Throttle = InferSchemaType<typeof throttleSchema>;
export const MobileLoginAttempt: Model<Throttle> =
  (mongoose.models.MobileLoginAttempt as Model<Throttle>) ??
  mongoose.model<Throttle>('MobileLoginAttempt', throttleSchema);
