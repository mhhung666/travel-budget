import mongoose from 'mongoose';
import { baseCurrency, isLedgerV2, ledgerOf, validateLedgerChildren } from './ledger';
import { dbConnect } from '@/lib/mongodb';
import { Trip as TripModel, type TripDoc } from '@/models';
import { toTripDto } from '@/lib/dto';
import { readTripListSummaries } from '@/lib/tripListSummary';
import type { TripWithMembers } from '@/types';

type LeanTrip = TripDoc & { _id: { toString(): string }; createdAt: Date };

/** Member-only list used by both Web and mobile adapters. */
export async function readMemberTrips(viewerId: string): Promise<TripWithMembers[]> {
  await dbConnect();
  const found = await TripModel.find({ 'members.user': viewerId })
    .sort({ createdAt: -1 })
    .lean<LeanTrip[]>();

  const trips = found.filter((t) => isLedgerV2() || baseCurrency(t) === 'TWD');
  if (isLedgerV2())
    for (const trip of trips)
      await validateLedgerChildren(mongoose.connection.db!, {
        ...trip,
        _id: new mongoose.mongo.ObjectId(trip._id.toString()),
      });
  // 依旅行日期（startDate）新到舊排序，沒有日期的旅程放最後。
  // DB 已先按 createdAt 由新到舊，stable sort 讓同日期 / 皆無日期者維持此序。
  trips.sort((a, b) => {
    const ta = a.startDate ? new Date(a.startDate).getTime() : null;
    const tb = b.startDate ? new Date(b.startDate).getTime() : null;
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1; // a 無日期 → 排後面
    if (tb === null) return -1; // b 無日期 → 排後面
    return tb - ta; // 新到舊
  });

  // 卡片狀態摘要（我的花費／結算餘額）：整批兩次查詢，不隨旅行數增加往返次數。
  const summaries = await readTripListSummaries(
    trips.map((trip) => trip._id.toString()),
    viewerId
  );
  const formattedTrips: TripWithMembers[] = trips.map((trip) => {
    const summary = summaries.get(trip._id.toString());
    return {
      ...toTripDto(trip, viewerId),
      ...(isLedgerV2() ? { ledger: ledgerOf(trip) } : {}),
      member_count: trip.members.length,
      my_spent: summary?.mySpent ?? 0,
      my_balance: summary?.myBalance ?? 0,
    };
  });

  return formattedTrips;
}
