'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

interface Trip {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

interface Member {
  id: number;
  username: string;
  display_name: string;
  joined_at: string;
}

interface Expense {
  id: number;
  amount: number;
  description: string;
  date: string;
  payer_id: number;
  payer_name: string;
  splits: Array<{
    user_id: number;
    username: string;
    display_name: string;
    share_amount: number;
  }>;
}

export default function TripDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    payer_id: 0,
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    split_with: [] as number[],
  });

  useEffect(() => {
    loadTripData();
  }, [tripId]);

  const loadTripData = async () => {
    try {
      // 檢查認證
      const authResponse = await fetch('/api/auth/me');
      if (!authResponse.ok) {
        router.push('/login');
        return;
      }
      const authData = await authResponse.json();
      setCurrentUser(authData.user);

      // 載入旅行資料
      const [tripResponse, membersResponse, expensesResponse] = await Promise.all([
        fetch(`/api/trips/${tripId}`),
        fetch(`/api/trips/${tripId}/members`),
        fetch(`/api/trips/${tripId}/expenses`),
      ]);

      if (!tripResponse.ok) {
        if (tripResponse.status === 403) {
          setError('您不是此旅行的成員');
        } else {
          setError('無法載入旅行資料');
        }
        return;
      }

      const tripData = await tripResponse.json();
      const membersData = await membersResponse.json();
      const expensesData = await expensesResponse.json();

      setTrip(tripData.trip);
      setMembers(membersData.members);
      setExpenses(expensesData.expenses);

      // 設置默認付款人為當前用戶
      if (authData.user && expenseForm.payer_id === 0) {
        setExpenseForm(prev => ({ ...prev, payer_id: authData.user.id }));
      }
    } catch (err) {
      setError('載入失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch(`/api/trips/${tripId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...expenseForm,
          amount: parseFloat(expenseForm.amount),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setShowAddExpense(false);
      setExpenseForm({
        payer_id: currentUser?.id || 0,
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        split_with: [],
      });
      await loadTripData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteExpense = async (expenseId: number) => {
    if (!confirm('確定要刪除這筆支出嗎?')) return;

    try {
      const response = await fetch(`/api/trips/${tripId}/expenses/${expenseId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      await loadTripData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleSplitMember = (userId: number) => {
    setExpenseForm(prev => ({
      ...prev,
      split_with: prev.split_with.includes(userId)
        ? prev.split_with.filter(id => id !== userId)
        : [...prev.split_with, userId],
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">載入中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/trips')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            返回旅行列表
          </button>
        </div>
      </div>
    );
  }

  if (!trip) return null;

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/trips')}
              className="text-gray-600 hover:text-gray-800"
            >
              ← 返回
            </button>
            <h1 className="text-2xl font-bold text-gray-800">{trip.name}</h1>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 旅行資訊 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">旅行資訊</h2>
              {trip.description && (
                <p className="text-gray-600 mb-4">{trip.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>旅行 ID: {trip.id}</span>
                <span>建立時間: {new Date(trip.created_at).toLocaleDateString('zh-TW')}</span>
              </div>
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-800">
                  分享旅行 ID <strong>{trip.id}</strong> 給其他人,讓他們加入這個旅行!
                </p>
              </div>
            </div>

            {/* 支出列表 */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800">支出記錄</h2>
                <button
                  onClick={() => setShowAddExpense(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  新增支出
                </button>
              </div>

              {expenses.length === 0 ? (
                <div className="text-center text-gray-500 py-12">
                  <p>目前還沒有支出記錄</p>
                  <p className="text-sm mt-2">點擊「新增支出」開始記錄!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {expenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-800">{expense.description}</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {expense.payer_name} 付款 • {new Date(expense.date).toLocaleDateString('zh-TW')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-blue-600">
                            ${expense.amount.toLocaleString()}
                          </p>
                          {currentUser?.id === expense.payer_id && (
                            <button
                              onClick={() => handleDeleteExpense(expense.id)}
                              className="text-xs text-red-600 hover:text-red-800 mt-1"
                            >
                              刪除
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs text-gray-500 mb-2">分帳對象:</p>
                        <div className="flex flex-wrap gap-2">
                          {expense.splits.map((split) => (
                            <span
                              key={split.user_id}
                              className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                            >
                              {split.display_name}: ${split.share_amount.toFixed(0)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 成員列表 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                成員 ({members.length})
              </h2>
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{member.display_name}</p>
                      <p className="text-sm text-gray-500">@{member.username}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 結算按鈕 */}
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <button
                onClick={() => router.push(`/trips/${tripId}/settlement`)}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold"
              >
                查看結算
              </button>
              <p className="text-xs text-gray-500 text-center mt-2">
                查看每人應付/應收金額
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 新增支出 Modal */}
      {showAddExpense && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => {
            setShowAddExpense(false);
            setError('');
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-800">新增支出</h3>
                <button
                  onClick={() => {
                    setShowAddExpense(false);
                    setError('');
                  }}
                  className="text-gray-400 hover:text-gray-600 transition"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleAddExpense} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    付款人 *
                  </label>
                  <select
                    value={expenseForm.payer_id}
                    onChange={(e) => setExpenseForm({ ...expenseForm, payer_id: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value={0}>請選擇付款人</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    金額 *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    項目描述 *
                  </label>
                  <input
                    type="text"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    placeholder="例如: 午餐、交通費"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    日期 *
                  </label>
                  <input
                    type="date"
                    value={expenseForm.date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    分帳對象 *
                    {expenseForm.split_with.length > 0 && (
                      <span className="ml-2 text-blue-600">
                        (已選 {expenseForm.split_with.length} 人)
                      </span>
                    )}
                  </label>
                  <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                    {members.map((member) => (
                      <label
                        key={member.id}
                        className="flex items-center gap-3 p-2 hover:bg-white rounded cursor-pointer transition"
                      >
                        <input
                          type="checkbox"
                          checked={expenseForm.split_with.includes(member.id)}
                          onChange={() => toggleSplitMember(member.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{member.display_name}</span>
                      </label>
                    ))}
                  </div>
                  {expenseForm.split_with.length > 0 && expenseForm.amount && parseFloat(expenseForm.amount) > 0 && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                      <p className="text-sm text-blue-800">
                        💰 每人分擔: <strong>${(parseFloat(expenseForm.amount) / expenseForm.split_with.length).toFixed(2)}</strong>
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddExpense(false);
                      setError('');
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition font-medium"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={expenseForm.split_with.length === 0}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    新增支出
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
