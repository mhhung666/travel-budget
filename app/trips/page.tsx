'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Trip {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
}

export default function TripsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [joinTripId, setJoinTripId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (!response.ok) {
        router.push('/login');
        return;
      }
      const data = await response.json();
      setUser(data.user);
      await loadTrips();
    } catch (error) {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const loadTrips = async () => {
    try {
      const response = await fetch('/api/trips');
      if (response.ok) {
        const data = await response.json();
        setTrips(data.trips);
      }
    } catch (error) {
      console.error('Load trips error:', error);
    }
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setShowCreateModal(false);
      setFormData({ name: '', description: '' });
      await loadTrips();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleJoinTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/trips/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_id: parseInt(joinTripId) }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setShowJoinModal(false);
      setJoinTripId('');
      await loadTrips();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">載入中...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-800">我的旅行</h1>
            <div className="flex items-center gap-4">
              <span className="text-gray-600">
                歡迎, {user?.display_name}
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
              >
                登出
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800">旅行列表</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowJoinModal(true)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
              >
                加入旅行
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                建立新旅行
              </button>
            </div>
          </div>

          {trips.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <p>目前還沒有旅行記錄</p>
              <p className="text-sm mt-2">點擊「建立新旅行」開始規劃你的旅程!</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {trips.map((trip) => (
                <div
                  key={trip.id}
                  onClick={() => router.push(`/trips/${trip.id}`)}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition cursor-pointer"
                >
                  <h3 className="font-semibold text-lg text-gray-800 mb-2">
                    {trip.name}
                  </h3>
                  {trip.description && (
                    <p className="text-gray-600 text-sm mb-3">{trip.description}</p>
                  )}
                  <div className="flex justify-between items-center text-sm text-gray-500">
                    <span>{trip.member_count} 位成員</span>
                    <span>{new Date(trip.created_at).toLocaleDateString('zh-TW')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 建立旅行 Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">建立新旅行</h3>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateTrip}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  旅行名稱 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  描述 (可選)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setError('');
                    setFormData({ name: '', description: '' });
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  建立
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 加入旅行 Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">加入旅行</h3>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <form onSubmit={handleJoinTrip}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  旅行 ID
                </label>
                <input
                  type="number"
                  value={joinTripId}
                  onChange={(e) => setJoinTripId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  placeholder="請輸入旅行 ID"
                />
                <p className="text-sm text-gray-500 mt-1">
                  向其他成員詢問旅行 ID 以加入
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinModal(false);
                    setError('');
                    setJoinTripId('');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  加入
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
