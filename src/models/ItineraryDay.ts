import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const ItineraryDaySchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    dayNumber: { type: Number, required: true },
    title: { type: String, required: true },
    content: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

// 取代原 (trip_id, day_number) 的 UNIQUE 約束
ItineraryDaySchema.index({ trip: 1, dayNumber: 1 }, { unique: true });

export type ItineraryDayDoc = InferSchemaType<typeof ItineraryDaySchema>;

export const ItineraryDay: Model<ItineraryDayDoc> =
  (mongoose.models.ItineraryDay as Model<ItineraryDayDoc>) ??
  mongoose.model<ItineraryDayDoc>('ItineraryDay', ItineraryDaySchema);
