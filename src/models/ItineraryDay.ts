import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const ItineraryDaySchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    dayNumber: { type: Number, required: true },
    title: { type: String, required: true },
    content: { type: String, default: '' },
    // 當日地點（城市等較小範圍），用於旅行地圖的熱點圖；舊資料無此欄位即不計入。
    location: { type: Schema.Types.Mixed },
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
